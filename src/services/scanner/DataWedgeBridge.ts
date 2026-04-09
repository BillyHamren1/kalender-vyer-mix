/**
 * DataWedgeBridge — Zebra DataWedge integration for barcode scanning
 * 
 * Connects to the native DataWedgePlugin (Capacitor) which receives
 * Android broadcast intents from Zebra DataWedge and forwards them
 * as plugin events to the WebView.
 * 
 * On non-native platforms (web), falls back to simulated events
 * dispatched on window for testing.
 * 
 * === DEVICE CONFIGURATION ===
 * 
 * DataWedge must be configured on the Zebra device:
 *   - Profile name: "EventFlow Scanner"
 *   - Intent output: Enabled
 *   - Intent action: se.eventflow.scanner.SCAN
 *   - Intent delivery: Broadcast
 *   - Intent category: default
 *   - Barcode input: Enabled
 *   - Keystroke output: DISABLED
 * 
 * === INIT SEQUENCE ===
 * 
 * On native Android, startDataWedgeListener() runs:
 *   1. ENABLE_DATAWEDGE → ensures DataWedge is on
 *   2. SWITCH_TO_PROFILE → switches to "EventFlow Scanner" profile
 *   3. SCANNER_INPUT_PLUGIN → enables the scanner input
 * 
 * Each command includes SEND_RESULT + COMMAND_IDENTIFIER. The native plugin
 * listens for DataWedge RESULT_ACTION broadcasts and forwards them as
 * 'datawedge_result' events, allowing the frontend to verify success/failure.
 */

import { ScanEvent, DataWedgeIntentData } from './types';
import { Capacitor, registerPlugin } from '@capacitor/core';

type DataWedgeCallback = (scan: ScanEvent) => void;

// ── Constants ────────────────────────────────────────────────────

/** DataWedge profile name — must match device config. Single source of truth. */
export const DATAWEDGE_PROFILE_NAME = 'EventFlow Scanner';

/** DataWedge intent action — must match profile config and DataWedgePlugin.java */
const DATAWEDGE_ACTION = 'se.eventflow.scanner.SCAN';

/** Custom event name for web fallback / simulation */
const DATAWEDGE_WEB_EVENT = 'datawedge:scan';

// ── Native Plugin Interface ──────────────────────────────────────

interface DataWedgePluginInterface {
  sendCommand(options: { command: string; parameter: string }): Promise<{ commandIdentifier: string }>;
  isListening(): Promise<{ listening: boolean }>;
  addListener(
    eventName: 'datawedge_scan',
    callback: (data: NativeScanPayload) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: 'datawedge_result',
    callback: (data: NativeResultPayload) => void
  ): Promise<{ remove: () => void }>;
}

interface NativeScanPayload {
  data: string;
  symbology: string;
  source: string;
  timestamp: number;
  rawExtras?: Record<string, string>;
}

interface NativeResultPayload {
  commandIdentifier: string;
  commandName: string;
  result: string;         // "SUCCESS", "FAILURE", or ""
  resultInfo: string;     // semicolon-separated key=value pairs
  timestamp: number;
  rawExtras?: Record<string, string>;
}

// Register the native plugin (no-op on web, connects on Android)
const DataWedge = registerPlugin<DataWedgePluginInterface>('DataWedge');

// ── State ────────────────────────────────────────────────────────

let pluginListener: { remove: () => void } | null = null;
let resultListener: { remove: () => void } | null = null;
let windowListener: ((e: Event) => void) | null = null;
let isActive = false;
let callback: DataWedgeCallback | null = null;
let scanCounter = 0;

// Init tracking (for debug panel)
let initCommandsSent = false;
let initErrors: string[] = [];
let lastScanTimestamp: number | null = null;
let lastScanValue: string | null = null;

// ── Init Result Tracking ─────────────────────────────────────────

export type DwCommandStatus = 'pending' | 'success' | 'failure' | 'unknown';

export interface DwCommandResult {
  commandName: string;
  commandIdentifier: string;
  status: DwCommandStatus;
  resultInfo: string;
  sentAt: number;
  receivedAt: number | null;
  rawExtras?: Record<string, string>;
}

/** Results keyed by the short command name (ENABLE_DATAWEDGE, etc.) */
const initCommandResults = new Map<string, DwCommandResult>();

/** Whether result listener is registered */
let resultListenerActive = false;

// ── Start Listener ───────────────────────────────────────────────

/**
 * Start listening for DataWedge scan events.
 */
export function startDataWedgeListener(onScan: DataWedgeCallback): void {
  if (isActive) {
    console.warn('[DataWedge] Listener already active, removing old one first');
    stopDataWedgeListener();
  }

  callback = onScan;
  isActive = true;
  initErrors = [];
  initCommandResults.clear();

  if (Capacitor.isNativePlatform()) {
    startNativeListener();
    startResultListener();
    runDataWedgeInitSequence();
  } else {
    startWebFallbackListener();
  }
}

async function startNativeListener(): Promise<void> {
  try {
    pluginListener = await DataWedge.addListener('datawedge_scan', (payload: NativeScanPayload) => {
      console.log('[DataWedge] Native scan received:', payload.data, 'symbology:', payload.symbology);
      
      if (!payload.data) {
        console.warn('[DataWedge] Native event with empty data, ignoring');
        return;
      }

      scanCounter++;
      lastScanTimestamp = payload.timestamp || Date.now();
      lastScanValue = payload.data;

      const scanEvent: ScanEvent = {
        id: `dw_${Date.now()}_${scanCounter}`,
        type: 'barcode',
        source: 'zebra_datawedge',
        value: payload.data,
        timestamp: lastScanTimestamp,
        rawData: JSON.stringify(payload),
        symbology: payload.symbology || undefined,
        deviceInfo: 'Zebra DataWedge (native)',
        isDuplicate: false,
      };

      callback?.(scanEvent);
    });

    console.log('[DataWedge] Native Capacitor plugin listener registered');
  } catch (error) {
    console.error('[DataWedge] Failed to register native listener:', error);
    console.log('[DataWedge] Falling back to web event listener');
    startWebFallbackListener();
  }
}

/**
 * Register listener for DataWedge RESULT intents.
 * These arrive asynchronously after we send commands with SEND_RESULT.
 */
async function startResultListener(): Promise<void> {
  if (resultListenerActive) return;

  try {
    resultListener = await DataWedge.addListener('datawedge_result', (payload: NativeResultPayload) => {
      console.log('[DataWedge] Result received:', payload.commandName,
        '→', payload.result || '(empty)',
        'id:', payload.commandIdentifier);

      if (payload.resultInfo) {
        console.log('[DataWedge] Result info:', payload.resultInfo);
      }

      // Match to a pending init command
      const entry = findPendingCommand(payload.commandIdentifier, payload.commandName);
      if (entry) {
        const status: DwCommandStatus =
          payload.result === 'SUCCESS' ? 'success' :
          payload.result === 'FAILURE' ? 'failure' :
          'unknown';

        entry.status = status;
        entry.receivedAt = payload.timestamp || Date.now();
        entry.resultInfo = payload.resultInfo || '';
        entry.rawExtras = payload.rawExtras;

        if (status === 'failure') {
          const msg = `${entry.commandName}: FAILURE — ${payload.resultInfo || 'no info'}`;
          console.warn('[DataWedge] ✗ Init command failed:', msg);
          initErrors.push(msg);
        } else if (status === 'success') {
          console.log(`[DataWedge] ✓ Init result confirmed: ${entry.commandName}`);
        } else {
          console.log(`[DataWedge] ? Init result unknown for: ${entry.commandName}`);
        }
      } else {
        // Result for a command we didn't track — log it anyway
        console.log('[DataWedge] Untracked result:', payload.commandName,
          payload.result, payload.commandIdentifier);
      }
    });

    resultListenerActive = true;
    console.log('[DataWedge] Result listener registered');
  } catch (error) {
    console.error('[DataWedge] Failed to register result listener:', error);
  }
}

function findPendingCommand(identifier: string, commandName: string): DwCommandResult | null {
  // Try exact match by identifier first
  for (const entry of initCommandResults.values()) {
    if (entry.commandIdentifier === identifier) return entry;
  }
  // Fallback: match by command name if identifier doesn't match
  // (DataWedge sometimes returns a different identifier format)
  if (commandName && commandName !== 'UNKNOWN') {
    return initCommandResults.get(commandName) || null;
  }
  return null;
}

function startWebFallbackListener(): void {
  windowListener = (event: Event) => {
    const detail = (event as CustomEvent<DataWedgeIntentData>).detail;
    if (!detail?.data) {
      console.warn('[DataWedge] Web event with no data:', detail);
      return;
    }

    scanCounter++;
    lastScanTimestamp = Date.now();
    lastScanValue = detail.data;

    const scanEvent: ScanEvent = {
      id: `dw_${Date.now()}_${scanCounter}`,
      type: 'barcode',
      source: 'zebra_datawedge',
      value: detail.data,
      timestamp: lastScanTimestamp,
      rawData: JSON.stringify(detail),
      symbology: detail.labelType || undefined,
      deviceInfo: 'Zebra DataWedge (web fallback)',
      isDuplicate: false,
    };

    callback?.(scanEvent);
  };

  window.addEventListener(DATAWEDGE_WEB_EVENT, windowListener);
  console.log('[DataWedge] Web fallback listener registered');
}

// ── Init Sequence ────────────────────────────────────────────────

/**
 * Runs the DataWedge init sequence on native Android.
 * Best-effort: each command is independent and non-fatal.
 * Results are tracked via the result listener.
 */
async function runDataWedgeInitSequence(): Promise<void> {
  console.log('[DataWedge] Running init sequence...');

  await sendInitCommand('ENABLE_DATAWEDGE', 'true', 'Enable DataWedge');

  await delay(100);
  await sendInitCommand('SWITCH_TO_PROFILE', DATAWEDGE_PROFILE_NAME, `Switch to profile "${DATAWEDGE_PROFILE_NAME}"`);

  await delay(100);
  await sendInitCommand('SCANNER_INPUT_PLUGIN', 'ENABLE_PLUGIN', 'Enable scanner input');

  initCommandsSent = true;

  // Allow time for results to arrive, then check
  setTimeout(() => {
    markStaleCommandsAsUnknown();
  }, 3000);

  if (initErrors.length === 0) {
    console.log('[DataWedge] Init sequence completed (waiting for results...)');
  } else {
    console.warn('[DataWedge] Init sequence completed with send errors:', initErrors);
  }
}

async function sendInitCommand(command: string, parameter: string, description: string): Promise<void> {
  const now = Date.now();

  // Pre-register as pending
  initCommandResults.set(command, {
    commandName: command,
    commandIdentifier: '', // will be filled after send
    status: 'pending',
    resultInfo: '',
    sentAt: now,
    receivedAt: null,
  });

  try {
    const resp = await DataWedge.sendCommand({ command, parameter });
    // Update with the identifier returned by the plugin
    const entry = initCommandResults.get(command);
    if (entry) {
      entry.commandIdentifier = resp?.commandIdentifier || '';
    }
    console.log(`[DataWedge] → ${description} (id: ${resp?.commandIdentifier || 'none'})`);
  } catch (error: any) {
    const msg = `${description}: ${error.message || error}`;
    console.warn(`[DataWedge] ✗ Send failed: ${msg}`);
    initErrors.push(msg);
    const entry = initCommandResults.get(command);
    if (entry) {
      entry.status = 'failure';
      entry.resultInfo = error.message || String(error);
      entry.receivedAt = Date.now();
    }
  }
}

/**
 * After a timeout, mark any still-pending commands as 'unknown'.
 * This means DataWedge never responded (possibly not installed or wrong version).
 */
function markStaleCommandsAsUnknown(): void {
  for (const entry of initCommandResults.values()) {
    if (entry.status === 'pending') {
      console.warn(`[DataWedge] No result received for: ${entry.commandName} — marking as unknown`);
      entry.status = 'unknown';
      entry.resultInfo = 'No response from DataWedge within 3s';
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Stop Listener ────────────────────────────────────────────────

export function stopDataWedgeListener(): void {
  if (pluginListener) {
    pluginListener.remove();
    pluginListener = null;
    console.log('[DataWedge] Native plugin listener removed');
  }

  if (resultListener) {
    resultListener.remove();
    resultListener = null;
    resultListenerActive = false;
    console.log('[DataWedge] Result listener removed');
  }

  if (windowListener) {
    window.removeEventListener(DATAWEDGE_WEB_EVENT, windowListener);
    windowListener = null;
    console.log('[DataWedge] Web fallback listener removed');
  }

  callback = null;
  isActive = false;
  initCommandsSent = false;
  initErrors = [];
  lastScanTimestamp = null;
  lastScanValue = null;
  initCommandResults.clear();
  console.log('[DataWedge] All listeners removed');
}

// ── Status / Debug Getters ───────────────────────────────────────

export function isDataWedgeActive(): boolean {
  return isActive;
}

export function getDataWedgeScanCount(): number {
  return scanCounter;
}

export function resetDataWedgeScanCount(): void {
  scanCounter = 0;
}

export function wasInitCommandsSent(): boolean {
  return initCommandsSent;
}

export function getInitErrors(): string[] {
  return [...initErrors];
}

export function getLastScanTimestamp(): number | null {
  return lastScanTimestamp;
}

export function getLastScanValue(): string | null {
  return lastScanValue;
}

/** Get all init command results for debug display. */
export function getInitCommandResults(): DwCommandResult[] {
  return Array.from(initCommandResults.values());
}

/** Whether the profile switch command got a SUCCESS result. */
export function profileSwitchSucceeded(): boolean | null {
  const entry = initCommandResults.get('SWITCH_TO_PROFILE');
  if (!entry) return null;
  if (entry.status === 'success') return true;
  if (entry.status === 'failure') return false;
  return null; // pending or unknown
}

/** Whether the scanner input enable command got a SUCCESS result. */
export function scannerInputEnabledSucceeded(): boolean | null {
  const entry = initCommandResults.get('SCANNER_INPUT_PLUGIN');
  if (!entry) return null;
  if (entry.status === 'success') return true;
  if (entry.status === 'failure') return false;
  return null;
}

// ── DataWedge Commands ───────────────────────────────────────────

export async function sendDataWedgeCommand(
  command: string, 
  parameter?: string
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await DataWedge.sendCommand({ command, parameter: parameter || '' });
      console.log(`[DataWedge] Command sent: ${command}`, parameter);
    } catch (error) {
      console.error(`[DataWedge] Command failed: ${command}`, error);
    }
  } else {
    console.log(`[DataWedge] Command (web no-op): ${command}`, parameter);
  }
}

// ── Simulation (for testing without Zebra hardware) ──────────────

export function simulateDataWedgeScan(barcode: string, symbology?: string): void {
  const event = new CustomEvent<DataWedgeIntentData>(DATAWEDGE_WEB_EVENT, {
    detail: {
      action: DATAWEDGE_ACTION,
      data: barcode,
      labelType: symbology || 'CODE128',
      source: 'simulated',
    }
  });
  window.dispatchEvent(event);
  console.log(`[DataWedge] Simulated scan: ${barcode}`);
}
