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
 */

import { ScanEvent, DataWedgeIntentData } from './types';
import { Capacitor, registerPlugin } from '@capacitor/core';

type DataWedgeCallback = (scan: ScanEvent) => void;

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

// Custom event name for web fallback / simulation
const DATAWEDGE_WEB_EVENT = 'datawedge:scan';

// DataWedge intent action (must match device config)
const DATAWEDGE_ACTION = 'se.eventflow.scanner.SCAN';

// ── Start Listener ───────────────────────────────────────────────

/**
 * Start listening for DataWedge scan events.
 * 
 * On native Android: registers a Capacitor plugin event listener
 * that receives forwarded DataWedge broadcast intents.
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

  if (Capacitor.isNativePlatform()) {
    // Native path — listen to Capacitor plugin events from DataWedgePlugin.java
    startNativeListener();
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
      const scanEvent: ScanEvent = {
        id: `dw_${Date.now()}_${scanCounter}`,
        type: 'barcode',
        source: 'zebra_datawedge',
        value: payload.data,
        timestamp: payload.timestamp || Date.now(),
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
    const scanEvent: ScanEvent = {
      id: `dw_${Date.now()}_${scanCounter}`,
      type: 'barcode',
      source: 'zebra_datawedge',
      value: detail.data,
      timestamp: Date.now(),
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
  console.log('[DataWedge] All listeners removed');
}

// ── Status ───────────────────────────────────────────────────────

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
 * On native: dispatches through the same plugin event path (if possible).
 * On web: dispatches a CustomEvent on window.
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
