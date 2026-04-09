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
 * On native Android, startDataWedgeListener() now also runs:
 *   1. ENABLE_DATAWEDGE → ensures DataWedge is on
 *   2. SWITCH_TO_PROFILE → switches to "EventFlow Scanner" profile
 *   3. SCANNER_INPUT_PLUGIN → enables the scanner input
 * 
 * These commands are best-effort (non-fatal on failure).
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
  sendCommand(options: { command: string; parameter: string }): Promise<void>;
  isListening(): Promise<{ listening: boolean }>;
  addListener(
    eventName: 'datawedge_scan',
    callback: (data: NativeScanPayload) => void
  ): Promise<{ remove: () => void }>;
}

interface NativeScanPayload {
  data: string;
  symbology: string;
  source: string;
  timestamp: number;
  rawExtras?: Record<string, string>;
}

// Register the native plugin (no-op on web, connects on Android)
const DataWedge = registerPlugin<DataWedgePluginInterface>('DataWedge');

// ── State ────────────────────────────────────────────────────────

let pluginListener: { remove: () => void } | null = null;
let windowListener: ((e: Event) => void) | null = null;
let isActive = false;
let callback: DataWedgeCallback | null = null;
let scanCounter = 0;

// Init tracking (for debug panel)
let initCommandsSent = false;
let initErrors: string[] = [];
let lastScanTimestamp: number | null = null;
let lastScanValue: string | null = null;

// ── Start Listener ───────────────────────────────────────────────

/**
 * Start listening for DataWedge scan events.
 * 
 * On native Android: registers a Capacitor plugin event listener
 * that receives forwarded DataWedge broadcast intents, then sends
 * init commands to ensure the correct profile and scanner input are active.
 * 
 * On web: falls back to window CustomEvent listener for testing.
 */
export function startDataWedgeListener(onScan: DataWedgeCallback): void {
  if (isActive) {
    console.warn('[DataWedge] Listener already active, removing old one first');
    stopDataWedgeListener();
  }

  callback = onScan;
  isActive = true;
  initErrors = [];

  if (Capacitor.isNativePlatform()) {
    // Native path — listen to Capacitor plugin events from DataWedgePlugin.java
    startNativeListener();
    // Run init sequence after listener is set up
    runDataWedgeInitSequence();
  } else {
    // Web fallback — listen to window events (for simulation/testing)
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
    // Fall back to web listener
    console.log('[DataWedge] Falling back to web event listener');
    startWebFallbackListener();
  }
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
 * 
 * Sequence:
 *   1. ENABLE_DATAWEDGE → make sure DataWedge service is enabled
 *   2. SWITCH_TO_PROFILE → activate our app-specific profile
 *   3. SCANNER_INPUT_PLUGIN → enable the barcode scanner input
 */
async function runDataWedgeInitSequence(): Promise<void> {
  console.log('[DataWedge] Running init sequence...');

  // Step 1: Enable DataWedge
  await sendInitCommand('ENABLE_DATAWEDGE', 'true', 'Enable DataWedge');

  // Step 2: Switch to our profile
  // Small delay to let DataWedge process the enable command
  await delay(100);
  await sendInitCommand('SWITCH_TO_PROFILE', DATAWEDGE_PROFILE_NAME, `Switch to profile "${DATAWEDGE_PROFILE_NAME}"`);

  // Step 3: Enable scanner input plugin
  await delay(100);
  await sendInitCommand('SCANNER_INPUT_PLUGIN', 'ENABLE_PLUGIN', 'Enable scanner input');

  initCommandsSent = true;

  if (initErrors.length === 0) {
    console.log('[DataWedge] Init sequence completed successfully');
  } else {
    console.warn('[DataWedge] Init sequence completed with errors:', initErrors);
  }
}

async function sendInitCommand(command: string, parameter: string, description: string): Promise<void> {
  try {
    await DataWedge.sendCommand({ command, parameter });
    console.log(`[DataWedge] ✓ ${description}`);
  } catch (error: any) {
    const msg = `${description}: ${error.message || error}`;
    console.warn(`[DataWedge] ✗ ${msg}`);
    initErrors.push(msg);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Stop Listener ────────────────────────────────────────────────

/**
 * Stop listening for DataWedge events.
 */
export function stopDataWedgeListener(): void {
  if (pluginListener) {
    pluginListener.remove();
    pluginListener = null;
    console.log('[DataWedge] Native plugin listener removed');
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
  console.log('[DataWedge] All listeners removed');
}

// ── Status / Debug Getters ───────────────────────────────────────

/** Check if DataWedge listener is active. */
export function isDataWedgeActive(): boolean {
  return isActive;
}

/** Get session scan count. */
export function getDataWedgeScanCount(): number {
  return scanCounter;
}

/** Reset session counter. */
export function resetDataWedgeScanCount(): void {
  scanCounter = 0;
}

/** Whether init commands were sent to DataWedge. */
export function wasInitCommandsSent(): boolean {
  return initCommandsSent;
}

/** Any errors during init sequence. */
export function getInitErrors(): string[] {
  return [...initErrors];
}

/** Timestamp of last received scan. */
export function getLastScanTimestamp(): number | null {
  return lastScanTimestamp;
}

/** Value of last received scan. */
export function getLastScanValue(): string | null {
  return lastScanValue;
}

// ── DataWedge Commands ───────────────────────────────────────────

/**
 * Send a command to DataWedge via the native plugin.
 * 
 * Common commands:
 * - SWITCH_TO_PROFILE: Switch DataWedge profile
 * - ENABLE_DATAWEDGE: Enable/disable DataWedge
 * - SCANNER_INPUT_PLUGIN: Enable/disable scanner
 * 
 * @example
 * sendDataWedgeCommand('SWITCH_TO_PROFILE', 'EventFlow Scanner');
 */
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

/**
 * Simulate a DataWedge scan (for testing without Zebra hardware).
 */
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
