/**
 * DataWedgeBridge — Zebra DataWedge integration for barcode scanning
 * 
 * On Zebra TC22 (and other TC/MC/EC series), DataWedge sends scan data
 * to the app via Android Intents (broadcasts). In a Capacitor WebView,
 * we receive these through a custom Capacitor plugin that listens for
 * the DataWedge broadcast and forwards it to the WebView via 
 * window events or plugin callbacks.
 * 
 * === ANDROID NATIVE SETUP REQUIRED ===
 * 
 * To complete this integration, the following must be done in the 
 * Android native project:
 * 
 * 1. Create a Capacitor plugin: DataWedgePlugin.java
 *    - Register a BroadcastReceiver for DataWedge intents
 *    - Forward scan data to WebView via plugin events
 * 
 * 2. Configure DataWedge on the Zebra device:
 *    - Profile name: "EventFlow Scanner"
 *    - Intent output enabled
 *    - Intent action: "se.eventflow.scanner.SCAN"
 *    - Intent delivery: Broadcast
 *    - Intent category: default
 *    - Barcode input enabled
 *    - Keystroke output DISABLED (we use intent, not keystroke)
 * 
 * 3. Register the plugin in MainActivity.java
 * 
 * The bridge below handles the WebView side of this integration.
 * It listens for events dispatched by the native plugin and 
 * normalizes them into ScanEvent format.
 * 
 * === INTERIM APPROACH ===
 * Until the native plugin is built, DataWedge can be configured to 
 * use "Keystroke output" mode, which types the barcode as keyboard
 * input. The KeyboardFallbackBridge handles this case.
 */

import { ScanEvent, DataWedgeIntentData } from './types';

type DataWedgeCallback = (scan: ScanEvent) => void;

// Custom event name dispatched by the native Capacitor plugin
const DATAWEDGE_EVENT = 'datawedge:scan';

// DataWedge intent action (must match device config)
const DATAWEDGE_ACTION = 'se.eventflow.scanner.SCAN';

let listener: ((e: Event) => void) | null = null;
let isActive = false;
let callback: DataWedgeCallback | null = null;
let scanCounter = 0;

/**
 * Start listening for DataWedge scan events.
 * 
 * The native Capacitor plugin dispatches CustomEvents on `window`
 * with the scan data in `event.detail`.
 */
export function startDataWedgeListener(onScan: DataWedgeCallback): void {
  if (isActive) {
    console.warn('[DataWedge] Listener already active, removing old one first');
    stopDataWedgeListener();
  }

  callback = onScan;
  isActive = true;

  listener = (event: Event) => {
    const detail = (event as CustomEvent<DataWedgeIntentData>).detail;
    if (!detail?.data) {
      console.warn('[DataWedge] Received event with no data:', detail);
      return;
    }

    scanCounter++;
    const scanEvent: ScanEvent = {
      id: `dw_${Date.now()}_${scanCounter}`,
      type: 'barcode',
      source: 'zebra_datawedge',
      value: detail.data,
      timestamp: Date.now(),
      rawData: JSON.stringify(detail),
      symbology: detail.labelType || undefined,
      deviceInfo: 'Zebra DataWedge',
      isDuplicate: false,
    };

    callback?.(scanEvent);
  };

  window.addEventListener(DATAWEDGE_EVENT, listener);
  console.log('[DataWedge] Listener registered, waiting for scans...');
}

/**
 * Stop listening for DataWedge events.
 */
export function stopDataWedgeListener(): void {
  if (listener) {
    window.removeEventListener(DATAWEDGE_EVENT, listener);
    listener = null;
  }
  callback = null;
  isActive = false;
  console.log('[DataWedge] Listener removed');
}

/**
 * Check if DataWedge listener is active.
 */
export function isDataWedgeActive(): boolean {
  return isActive;
}

/**
 * Get session scan count.
 */
export function getDataWedgeScanCount(): number {
  return scanCounter;
}

/**
 * Reset session counter.
 */
export function resetDataWedgeScanCount(): void {
  scanCounter = 0;
}

/**
 * Send a command to DataWedge via the native plugin.
 * 
 * TODO: Implement in native Capacitor plugin
 * 
 * Common commands:
 * - SWITCH_TO_PROFILE: Switch DataWedge profile
 * - ENABLE_DATAWEDGE: Enable/disable DataWedge
 * - SCANNER_INPUT_PLUGIN: Enable/disable scanner
 * 
 * @example
 * sendDataWedgeCommand('SWITCH_TO_PROFILE', { PROFILE_NAME: 'EventFlow Scanner' });
 */
export async function sendDataWedgeCommand(
  command: string, 
  extras?: Record<string, string>
): Promise<void> {
  // TODO: Call native plugin to send DataWedge API intent
  // Example Android implementation:
  // Intent i = new Intent();
  // i.setAction("com.symbol.datawedge.api.ACTION");
  // i.putExtra(command, extras);
  // context.sendBroadcast(i);
  console.log(`[DataWedge] Command: ${command}`, extras);
}

/**
 * Simulate a DataWedge scan (for testing without Zebra hardware).
 * Dispatches the same CustomEvent that the native plugin would.
 */
export function simulateDataWedgeScan(barcode: string, symbology?: string): void {
  const event = new CustomEvent<DataWedgeIntentData>(DATAWEDGE_EVENT, {
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
