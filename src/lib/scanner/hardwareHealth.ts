/**
 * SCANNER HARDENING – STEG 11: hardware readiness.
 *
 * Problemet: `isBarcodeReady` blev true bara för att en keyboard-listener
 * registrerats. Här separeras "det finns en input-listener" från
 * "hårdvaruscannern är verifierat redo".
 *
 * Regler (låsta av scannerHardwareReadiness.contract.test.ts):
 * - BARCODE_SCANNER_READY kräver VERIFIERAD DataWedge-profil (SUCCESS på
 *   både SWITCH_TO_PROFILE och SCANNER_INPUT_PLUGIN).
 * - Keyboard fallback ger ALDRIG BARCODE_SCANNER_READY → DEGRADED.
 * - Går status inte att verifiera (unknown) → DEGRADED, aldrig "ready".
 * - RFID_READER_READY kräver fysiskt ansluten läsare, inte bara listener.
 */

export type ScannerHealthState =
  | 'INPUT_LISTENER_READY'
  | 'DATAWEDGE_DETECTED'
  | 'DATAWEDGE_PROFILE_READY'
  | 'BARCODE_SCANNER_READY'
  | 'RFID_READER_READY'
  | 'OFFLINE'
  | 'DEGRADED';

export type BarcodeInputMode = 'datawedge' | 'keyboard' | 'camera' | 'none';

export interface HardwareHealthInput {
  online: boolean;
  isNative: boolean;
  isAndroid: boolean;
  isZebraDevice: boolean;
  /** DataWedge-pluginens listener är registrerad (säger inget om profilen). */
  dataWedgeListenerActive: boolean;
  /** Init-kommandon skickade till DataWedge. */
  dataWedgeInitSent: boolean;
  /** SUCCESS/FAILURE/okänt från DataWedge RESULT-intent. */
  dataWedgeProfileSwitchOk: boolean | null;
  dataWedgeScannerInputOk: boolean | null;
  /** Senaste faktiska scan via DataWedge (empirisk handshake-bekräftelse). */
  dataWedgeLastScanTime: number | null;
  keyboardListenerActive: boolean;
  cameraAvailable: boolean;
  rfidListenerActive: boolean;
  rfidNativeAvailable: boolean;
  rfidReaderConnected: boolean;
  now?: number;
}

/** Ett faktiskt DataWedge-scan inom denna tid räknas som verifierad handshake. */
export const DATAWEDGE_EMPIRICAL_PROOF_MS = 10 * 60 * 1000;

export interface HardwareHealth {
  states: ScannerHealthState[];
  barcodeInputMode: BarcodeInputMode;
  /** Verifierat redo — får styra "Scanner redo"-text i UI. */
  barcodeScannerReady: boolean;
  rfidReaderReady: boolean;
  degraded: boolean;
  offline: boolean;
  /** Kort svensk statustext för UI. */
  label: string;
  reason: string | null;
}

const has = (arr: ScannerHealthState[], s: ScannerHealthState) => arr.includes(s);

export const deriveHardwareHealth = (input: HardwareHealthInput): HardwareHealth => {
  const now = input.now ?? Date.now();
  const states: ScannerHealthState[] = [];

  const anyListener = input.dataWedgeListenerActive || input.keyboardListenerActive || input.rfidListenerActive;
  if (anyListener) states.push('INPUT_LISTENER_READY');

  const dataWedgeDetected =
    input.isNative && input.isAndroid && input.dataWedgeListenerActive && input.dataWedgeInitSent;
  if (dataWedgeDetected) states.push('DATAWEDGE_DETECTED');

  const recentDataWedgeScan =
    input.dataWedgeLastScanTime != null && now - input.dataWedgeLastScanTime <= DATAWEDGE_EMPIRICAL_PROOF_MS;

  const profileVerified =
    dataWedgeDetected &&
    ((input.dataWedgeProfileSwitchOk === true && input.dataWedgeScannerInputOk === true) ||
      recentDataWedgeScan);

  if (profileVerified) states.push('DATAWEDGE_PROFILE_READY');

  // Endast verifierad DataWedge ger "barcode scanner ready".
  const barcodeScannerReady = profileVerified;
  if (barcodeScannerReady) states.push('BARCODE_SCANNER_READY');

  const rfidReaderReady = input.rfidNativeAvailable && input.rfidListenerActive && input.rfidReaderConnected;
  if (rfidReaderReady) states.push('RFID_READER_READY');

  if (!input.online) states.push('OFFLINE');

  let barcodeInputMode: BarcodeInputMode = 'none';
  if (barcodeScannerReady) barcodeInputMode = 'datawedge';
  else if (input.keyboardListenerActive) barcodeInputMode = 'keyboard';
  else if (input.cameraAvailable) barcodeInputMode = 'camera';

  let reason: string | null = null;
  if (!barcodeScannerReady) {
    if (dataWedgeDetected && input.dataWedgeProfileSwitchOk === false) {
      reason = 'DataWedge-profilen kunde inte aktiveras';
    } else if (dataWedgeDetected && input.dataWedgeScannerInputOk === false) {
      reason = 'DataWedge scanner input är avstängd';
    } else if (dataWedgeDetected) {
      reason = 'DataWedge-status kunde inte verifieras';
    } else if (input.keyboardListenerActive) {
      reason = 'Keyboard-läge – Zebra-scanner ej verifierad';
    } else if (input.cameraAvailable) {
      reason = 'Kameraläge – ingen hårdvaruscanner';
    } else {
      reason = 'Ingen scanner-input tillgänglig';
    }
  }

  const degraded = !barcodeScannerReady && (anyListener || input.cameraAvailable);
  if (degraded) states.push('DEGRADED');

  let label: string;
  if (!input.online) label = 'Offline';
  else if (barcodeScannerReady) label = 'Zebra-scanner redo';
  else if (barcodeInputMode === 'keyboard') label = 'Keyboard-läge (begränsad)';
  else if (barcodeInputMode === 'camera') label = 'Kameraläge (begränsad)';
  else label = 'Ingen scanner';

  return {
    states,
    barcodeInputMode,
    barcodeScannerReady,
    rfidReaderReady,
    degraded,
    offline: !input.online,
    label,
    reason,
  };
};

/** Får UI påstå "scanner redo"? Aldrig vid keyboard/okänd status. */
export const canClaimScannerReady = (h: HardwareHealth): boolean =>
  has(h.states, 'BARCODE_SCANNER_READY') && !h.offline;
