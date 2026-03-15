/**
 * KeyboardFallbackBridge — HID keyboard input for simple barcode scanners
 * 
 * Many barcode scanners work in HID mode, typing characters followed by Enter.
 * This bridge captures fast keyboard input and treats it as a scan.
 * 
 * Also serves as interim DataWedge support when DataWedge is configured
 * in "Keystroke output" mode instead of Intent output.
 * 
 * This is a FALLBACK — Zebra devices should use DataWedgeBridge instead.
 */

import { ScanEvent } from './types';

type KeyboardScanCallback = (scan: ScanEvent) => void;

let isActive = false;
let callback: KeyboardScanCallback | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let inputBuffer = '';
let bufferTimeout: ReturnType<typeof setTimeout> | null = null;
let scanCounter = 0;

// Time window between keystrokes to consider them part of a scan (ms)
const KEYSTROKE_TIMEOUT = 100;
// Minimum characters for a valid scan
const MIN_SCAN_LENGTH = 3;

export function startKeyboardListener(onScan: KeyboardScanCallback): void {
  if (isActive) {
    console.warn('[KeyboardFallback] Already active, stopping first');
    stopKeyboardListener();
  }

  callback = onScan;
  isActive = true;

  keydownHandler = (event: KeyboardEvent) => {
    // Skip if user is typing in an input/textarea
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (bufferTimeout) clearTimeout(bufferTimeout);

    if (event.key === 'Enter') {
      const scannedValue = inputBuffer.trim();
      if (scannedValue.length >= MIN_SCAN_LENGTH) {
        scanCounter++;
        const scanEvent: ScanEvent = {
          id: `kb_${Date.now()}_${scanCounter}`,
          type: 'barcode',
          source: 'keyboard_fallback',
          value: scannedValue,
          timestamp: Date.now(),
          deviceInfo: 'HID Keyboard Scanner',
          isDuplicate: false,
        };
        callback?.(scanEvent);
      }
      inputBuffer = '';
    } else if (event.key.length === 1) {
      inputBuffer += event.key;
      bufferTimeout = setTimeout(() => {
        inputBuffer = '';
      }, KEYSTROKE_TIMEOUT);
    }
  };

  window.addEventListener('keydown', keydownHandler);
  console.log('[KeyboardFallback] Listener registered');
}

export function stopKeyboardListener(): void {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  if (bufferTimeout) {
    clearTimeout(bufferTimeout);
    bufferTimeout = null;
  }
  callback = null;
  isActive = false;
  inputBuffer = '';
  console.log('[KeyboardFallback] Listener removed');
}

export function isKeyboardListenerActive(): boolean {
  return isActive;
}
