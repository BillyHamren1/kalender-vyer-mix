import { Capacitor } from '@capacitor/core';
import { APP_MODE } from '@/config/appMode';

export type DiagnosticSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface DiagnosticInsight {
  title: string;
  probableCause: string;
  suggestion: string;
}

export interface DiagnosticEvent {
  id: string;
  code: string;
  source: string;
  severity: DiagnosticSeverity;
  message: string;
  timestamp: number;
  route: string;
  platform: string;
  native: boolean;
  appMode: string;
  fingerprint: string;
  metadata?: Record<string, unknown>;
  insight: DiagnosticInsight;
}

export interface ReportDiagnosticInput {
  code: string;
  source: string;
  message?: string;
  severity?: DiagnosticSeverity;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'app_diagnostics_v1';
const MAX_EVENTS = 100;
const DEDUPE_WINDOW_MS = 2000;

const subscribers = new Set<() => void>();
const recentFingerprints = new Map<string, number>();

let diagnostics = loadStoredDiagnostics();
let diagnosticsInitialized = false;
let originalConsoleError: typeof console.error | null = null;

function loadStoredDiagnostics(): DiagnosticEvent[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistDiagnostics() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(diagnostics.slice(0, MAX_EVENTS)));
  } catch {
    // Ignore storage failures.
  }
}

function notifySubscribers() {
  subscribers.forEach((listener) => listener());
}

function getPlatformLabel() {
  if (typeof window === 'undefined') return 'unknown';
  if (Capacitor.isNativePlatform()) return `native-${Capacitor.getPlatform()}`;
  return 'web';
}

function safeSerialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
      stack: undefined,
    };
  }

  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    return {
      name: typeof candidate.name === 'string' ? candidate.name : 'Error',
      message: typeof candidate.message === 'string' ? candidate.message : JSON.stringify(safeSerialize(candidate)),
      stack: typeof candidate.stack === 'string' ? candidate.stack : undefined,
    };
  }

  return {
    name: 'UnknownError',
    message: 'Okänt fel',
    stack: undefined,
  };
}

function buildFingerprint(code: string, source: string, message: string) {
  return `${code}::${source}::${message}`.toLowerCase().slice(0, 500);
}

function shouldSkipDuplicate(fingerprint: string) {
  const now = Date.now();
  const lastSeen = recentFingerprints.get(fingerprint);
  recentFingerprints.set(fingerprint, now);

  if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
    return true;
  }

  for (const [key, timestamp] of recentFingerprints.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS * 5) {
      recentFingerprints.delete(key);
    }
  }

  return false;
}

export function getDiagnosticSuggestion(code: string, message = '', metadata?: Record<string, unknown>): DiagnosticInsight {
  const normalizedCode = code.toUpperCase();
  const normalizedMessage = message.toLowerCase();
  const platform = typeof metadata?.platform === 'string' ? metadata.platform : getPlatformLabel();

  if (normalizedCode.includes('CAMERA_PERMISSION_DENIED') || normalizedMessage.includes('permission denied')) {
    return {
      title: 'Kamerabehörighet saknas',
      probableCause: 'Appen har inte rätt att använda kameran på enheten.',
      suggestion: 'Öppna iPhone-inställningar för appen och tillåt kamera, starta sedan om scannern.',
    };
  }

  if (normalizedCode.includes('GET_USER_MEDIA_UNSUPPORTED')) {
    return {
      title: 'Kamerastöd saknas i webvyn',
      probableCause: 'Den aktiva iOS-webvyn exponerar inte getUserMedia korrekt.',
      suggestion: 'Verifiera native kamera-setup i Capacitor/WKWebView och kör npx cap sync innan nästa build.',
    };
  }

  if (normalizedCode.includes('CAMERA_START_TIMEOUT')) {
    return {
      title: 'Kameran startade aldrig klart',
      probableCause: 'Kameran låser sig vid uppstart eller används redan av annan vy/app.',
      suggestion: 'Stäng kameraflödet, kontrollera att ingen annan kameravy är aktiv och testa om uppstarten fastnar i native-lagret.',
    };
  }

  if (normalizedCode.includes('SCANNER_NO_VIDEO_PIXELS')) {
    return {
      title: 'Scanner får inga bildpixlar',
      probableCause: 'Videoströmmen finns men <video>-ytan eller iOS-renderingen levererar 0x0 pixlar till detektorn.',
      suggestion: 'Kontrollera native iOS-kamera, video-layout och om WKWebView faktiskt producerar frames till BarcodeDetector.',
    };
  }

  if (normalizedCode.includes('SCANNER_NO_DETECTIONS')) {
    return {
      title: 'Aktiv kamera utan avläsning',
      probableCause: `Scannern ser bild men lyckas inte dekoda QR-koder${platform.includes('ios') ? ' på iOS' : ''}.`,
      suggestion: 'Verifiera detectorn med känd test-QR och överväg native QR-läsning om BarcodeDetector/polyfill inte räcker.',
    };
  }

  if (normalizedCode.includes('BARCODE_DETECTOR_INIT_FAILED') || normalizedCode.includes('BARCODE_DETECT_LOOP_FAILURE')) {
    return {
      title: 'QR-detektorn fungerar inte stabilt',
      probableCause: 'BarcodeDetector eller polyfillen kraschar eller kan inte initieras korrekt.',
      suggestion: 'Logga detector-typen, fallback-kedjan och byt till native iOS-detektering om felet återkommer.',
    };
  }

  if (normalizedCode.includes('REACT_RENDER_ERROR')) {
    return {
      title: 'UI-krasch upptäckt',
      probableCause: 'En React-komponent kastade ett fel under rendering eller lifecycle.',
      suggestion: 'Öppna senaste fel i diagnostiken och följ componentStack för att isolera vyn som kraschar.',
    };
  }

  if (normalizedCode.includes('UNHANDLED_REJECTION')) {
    return {
      title: 'Ohanterat async-fel',
      probableCause: 'Ett Promise-fel fångades aldrig upp av appen.',
      suggestion: 'Lägg till try/catch runt async-flödet som orsakade felet och visa tydlig fallback i UI.',
    };
  }

  if (normalizedCode.includes('WINDOW_ERROR') || normalizedCode.includes('CONSOLE_ERROR')) {
    return {
      title: 'Runtime-fel upptäckt',
      probableCause: 'JavaScript-fel har kastats i klienten.',
      suggestion: 'Använd felkoden och metadata i diagnostiken för att spåra exakt vy, källa och stacktrace.',
    };
  }

  if (normalizedMessage.includes('non-2xx status code') || normalizedMessage.includes('edge function returned')) {
    return {
      title: 'Backend-anrop misslyckades',
      probableCause: 'En Edge Function svarade med felstatus.',
      suggestion: 'Kontrollera funktionsloggarna och koppla felkoden till det exakta anropet innan UI:t försöker igen.',
    };
  }

  return {
    title: 'Okänt fel upptäckt',
    probableCause: 'Appen hittade ett fel som ännu inte har en specialregel.',
    suggestion: 'Utgå från felkoden, route och metadata för att skapa en ny regel i diagnosmotorn.',
  };
}

export function reportDiagnostic(input: ReportDiagnosticInput): DiagnosticEvent | null {
  const normalizedError = input.error ? normalizeError(input.error) : null;
  const message = input.message || normalizedError?.message || 'Okänt fel';
  const fingerprint = buildFingerprint(input.code, input.source, message);

  if (shouldSkipDuplicate(fingerprint)) {
    return null;
  }

  const metadata = {
    ...(input.metadata ?? {}),
    ...(normalizedError ? {
      errorName: normalizedError.name,
      errorStack: normalizedError.stack,
    } : {}),
  };

  const event: DiagnosticEvent = {
    id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    code: input.code,
    source: input.source,
    severity: input.severity ?? 'error',
    message,
    timestamp: Date.now(),
    route: typeof window === 'undefined' ? '' : window.location.pathname,
    platform: getPlatformLabel(),
    native: Capacitor.isNativePlatform(),
    appMode: APP_MODE,
    fingerprint,
    metadata,
    insight: getDiagnosticSuggestion(input.code, message, {
      ...metadata,
      platform: getPlatformLabel(),
    }),
  };

  diagnostics = [event, ...diagnostics].slice(0, MAX_EVENTS);
  persistDiagnostics();
  notifySubscribers();
  return event;
}

export function getDiagnostics() {
  return diagnostics;
}

export function clearDiagnostics() {
  diagnostics = [];
  persistDiagnostics();
  notifySubscribers();
}

export function subscribeDiagnostics(listener: () => void) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function buildConsoleMessage(args: unknown[]) {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      return JSON.stringify(safeSerialize(arg));
    })
    .join(' ')
    .slice(0, 2000);
}

export function initializeGlobalDiagnostics() {
  if (diagnosticsInitialized || typeof window === 'undefined') {
    return;
  }

  diagnosticsInitialized = true;

  window.addEventListener('error', (event) => {
    reportDiagnostic({
      code: 'WINDOW_ERROR',
      source: 'window',
      severity: 'error',
      message: event.message || 'Ohanterat window-fel',
      error: event.error,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportDiagnostic({
      code: 'UNHANDLED_REJECTION',
      source: 'promise',
      severity: 'error',
      error: event.reason,
      metadata: {
        reason: safeSerialize(event.reason),
      },
    });
  });

  if (!originalConsoleError) {
    originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      reportDiagnostic({
        code: 'CONSOLE_ERROR',
        source: 'console',
        severity: 'warning',
        message: buildConsoleMessage(args),
        metadata: {
          args: safeSerialize(args),
        },
      });

      originalConsoleError?.(...args);
    };
  }
}