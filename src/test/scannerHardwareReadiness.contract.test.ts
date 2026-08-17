/**
 * SCANNER HARDENING – STEG 11: contract tests för hardware readiness,
 * event fidelity och kontextmedveten RFID-dedupe.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveHardwareHealth,
  canClaimScannerReady,
  type HardwareHealthInput,
} from '@/lib/scanner/hardwareHealth';
import { toScanEventMeta, hasFullFidelity, queueScanSource } from '@/lib/scanner/scanEventFidelity';
import { RfidDedupeTracker, rfidDedupeKey } from '@/lib/scanner/rfidDedupe';
import { buildQueuedOperation } from '@/services/scanner/operationQueueService';
import type { ScanEvent } from '@/services/scanner/types';

const base: HardwareHealthInput = {
  online: true,
  isNative: true,
  isAndroid: true,
  isZebraDevice: true,
  dataWedgeListenerActive: false,
  dataWedgeInitSent: false,
  dataWedgeProfileSwitchOk: null,
  dataWedgeScannerInputOk: null,
  dataWedgeLastScanTime: null,
  keyboardListenerActive: false,
  cameraAvailable: false,
  rfidListenerActive: false,
  rfidNativeAvailable: false,
  rfidReaderConnected: false,
  now: 1_000_000,
};

describe('STEG 11 – hardware readiness', () => {
  it('barcode via DataWedge med verifierad profil → BARCODE_SCANNER_READY', () => {
    const h = deriveHardwareHealth({
      ...base,
      dataWedgeListenerActive: true,
      dataWedgeInitSent: true,
      dataWedgeProfileSwitchOk: true,
      dataWedgeScannerInputOk: true,
    });
    expect(h.states).toContain('DATAWEDGE_DETECTED');
    expect(h.states).toContain('DATAWEDGE_PROFILE_READY');
    expect(h.states).toContain('BARCODE_SCANNER_READY');
    expect(h.barcodeInputMode).toBe('datawedge');
    expect(h.degraded).toBe(false);
    expect(canClaimScannerReady(h)).toBe(true);
  });

  it('keyboard fallback ger ALDRIG scanner ready → DEGRADED', () => {
    const h = deriveHardwareHealth({ ...base, keyboardListenerActive: true });
    expect(h.states).toContain('INPUT_LISTENER_READY');
    expect(h.states).toContain('DEGRADED');
    expect(h.states).not.toContain('BARCODE_SCANNER_READY');
    expect(h.barcodeScannerReady).toBe(false);
    expect(h.barcodeInputMode).toBe('keyboard');
    expect(canClaimScannerReady(h)).toBe(false);
    expect(h.label).toContain('Keyboard');
  });

  it('listener aktiv men DataWedge saknas → detekteras inte som DataWedge', () => {
    const h = deriveHardwareHealth({ ...base, keyboardListenerActive: true, cameraAvailable: true });
    expect(h.states).not.toContain('DATAWEDGE_DETECTED');
    expect(h.reason).toMatch(/Keyboard/);
  });

  it('DataWedge detekterad men status okänd → DEGRADED, inte ready', () => {
    const h = deriveHardwareHealth({
      ...base,
      dataWedgeListenerActive: true,
      dataWedgeInitSent: true,
    });
    expect(h.states).toContain('DATAWEDGE_DETECTED');
    expect(h.states).toContain('DEGRADED');
    expect(h.barcodeScannerReady).toBe(false);
    expect(h.reason).toMatch(/kunde inte verifieras/);
  });

  it('DataWedge profil FAILURE → tydlig orsak, ej ready', () => {
    const h = deriveHardwareHealth({
      ...base,
      dataWedgeListenerActive: true,
      dataWedgeInitSent: true,
      dataWedgeProfileSwitchOk: false,
      dataWedgeScannerInputOk: null,
    });
    expect(h.barcodeScannerReady).toBe(false);
    expect(h.reason).toMatch(/profilen/i);
  });

  it('faktiskt DataWedge-scan nyligen räknas som empirisk handshake', () => {
    const h = deriveHardwareHealth({
      ...base,
      dataWedgeListenerActive: true,
      dataWedgeInitSent: true,
      dataWedgeLastScanTime: base.now! - 5_000,
    });
    expect(h.barcodeScannerReady).toBe(true);
  });

  it('RFID_READER_READY kräver ansluten läsare, inte bara listener', () => {
    const listenerOnly = deriveHardwareHealth({
      ...base,
      rfidListenerActive: true,
      rfidNativeAvailable: true,
    });
    expect(listenerOnly.states).not.toContain('RFID_READER_READY');

    const connected = deriveHardwareHealth({
      ...base,
      rfidListenerActive: true,
      rfidNativeAvailable: true,
      rfidReaderConnected: true,
    });
    expect(connected.states).toContain('RFID_READER_READY');
  });

  it('offline flaggas och blockerar "scanner redo"-påstående', () => {
    const h = deriveHardwareHealth({
      ...base,
      online: false,
      dataWedgeListenerActive: true,
      dataWedgeInitSent: true,
      dataWedgeProfileSwitchOk: true,
      dataWedgeScannerInputOk: true,
    });
    expect(h.states).toContain('OFFLINE');
    expect(canClaimScannerReady(h)).toBe(false);
    expect(h.label).toBe('Offline');
  });

  it('app resume/reconnect: status räknas om från nya inputs', () => {
    const before = deriveHardwareHealth({ ...base, keyboardListenerActive: true });
    expect(before.barcodeScannerReady).toBe(false);
    const after = deriveHardwareHealth({
      ...base,
      dataWedgeListenerActive: true,
      dataWedgeInitSent: true,
      dataWedgeProfileSwitchOk: true,
      dataWedgeScannerInputOk: true,
    });
    expect(after.barcodeScannerReady).toBe(true);
  });
});

const mkScan = (over: Partial<ScanEvent> = {}): ScanEvent => ({
  id: 'scan-1',
  type: 'barcode',
  source: 'zebra_datawedge',
  value: 'ABC123',
  timestamp: 1_700_000_000_000,
  symbology: 'CODE128',
  deviceInfo: 'TC22',
  rawData: '{"raw":1}',
  isDuplicate: false,
  ...over,
});

describe('STEG 11 – event fidelity', () => {
  it('behåller hela ScanEvent, inte bara value', () => {
    const meta = toScanEventMeta(mkScan());
    expect(hasFullFidelity(meta)).toBe(true);
    expect(meta.value).toBe('ABC123');
    expect(meta.symbology).toBe('CODE128');
    expect(meta.device_info).toBe('TC22');
    expect(meta.input_channel).toBe('hardware');
    expect(meta.raw_data).toBe('{"raw":1}');
    expect(meta.scanned_at_ms).toBe(1_700_000_000_000);
  });

  it('RFID-fält bevaras', () => {
    const meta = toScanEventMeta(
      mkScan({ type: 'rfid', source: 'zebra_rfid', value: 'E280 1160', rssi: -55, antennaId: 2 }),
    );
    expect(meta.input_channel).toBe('rfid');
    expect(meta.rssi).toBe(-55);
    expect(meta.antenna_id).toBe(2);
  });

  it('keyboard fallback markeras som keyboard-kanal', () => {
    expect(toScanEventMeta(mkScan({ source: 'keyboard_fallback' })).input_channel).toBe('keyboard');
    expect(queueScanSource('keyboard_fallback')).toBe('manual');
    expect(queueScanSource('zebra_datawedge')).toBe('hardware');
  });

  it('operationen i kön bär hela scan-eventet', () => {
    const op = buildQueuedOperation(
      { operation: 'increment', packingId: 'p1', itemId: 'i1', scanEvent: mkScan() },
      'op-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(op.scan_value).toBe('ABC123');
    expect(op.scan_event?.symbology).toBe('CODE128');
    expect(op.scan_event?.source).toBe('zebra_datawedge');
    expect(op.scan_source).toBe('hardware');
  });
});

describe('STEG 11 – kontextmedveten RFID-dedupe', () => {
  const EPC = 'E28011606000020F';

  it('samma EPC + samma action inom fönstret = dubblett', () => {
    const t = new RfidDedupeTracker(5000);
    expect(t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 0).isDuplicate).toBe(false);
    const second = t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 1000);
    expect(second.isDuplicate).toBe(true);
    expect(second.reason).toBe('same_action_within_window');
  });

  it('PACK följt av snabb UNPACK av samma EPC blockeras INTE', () => {
    const t = new RfidDedupeTracker(5000);
    t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 0);
    const unpack = t.evaluate({ epc: EPC, action: 'decrement_by_serial', packingId: 'p1' }, 800);
    expect(unpack.isDuplicate).toBe(false);
    expect(unpack.reason).toBe('action_changed');
  });

  it('samma action men annan packningskontext är inte dubblett', () => {
    const t = new RfidDedupeTracker(5000);
    t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 0);
    const other = t.evaluate({ epc: EPC, action: 'increment', packingId: 'p2' }, 500);
    expect(other.isDuplicate).toBe(false);
    expect(other.reason).toBe('context_changed');
  });

  it('efter fönstret är samma action inte längre dubblett', () => {
    const t = new RfidDedupeTracker(5000);
    t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 0);
    const later = t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 6000);
    expect(later.isDuplicate).toBe(false);
    expect(later.reason).toBe('window_elapsed');
  });

  it('reset (app resume/reconnect) rensar dedupe-fönstret', () => {
    const t = new RfidDedupeTracker(5000);
    t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 0);
    t.reset();
    expect(t.evaluate({ epc: EPC, action: 'increment', packingId: 'p1' }, 100).isDuplicate).toBe(false);
  });

  it('dedupe-nyckeln innehåller action och kontext – aldrig bara EPC', () => {
    const key = rfidDedupeKey({ epc: 'e280 1160', action: 'increment', packingId: 'p1', sessionId: 's1' });
    expect(key.startsWith('E2801160::increment::p1::s1')).toBe(true);
    expect(key).not.toBe('E2801160');
  });
});
