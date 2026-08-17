/**
 * SCANNER HARDENING – STEG 11: event fidelity.
 *
 * En scan får ALDRIG reduceras till `scan.value` på vägen in i operationen.
 * Hela ScanEvent-metadatan (source, symbology, device, timestamp, RFID-fält,
 * råpayload) följer med operationen genom kön och till WMS.
 */

import type { ScanEvent, ScanSource, ScanType } from '@/services/scanner/types';

export interface ScanEventMeta {
  scan_id: string;
  value: string;
  type: ScanType;
  source: ScanSource;
  /** 'hardware' | 'keyboard' | 'camera' | 'rfid' | 'manual' */
  input_channel: 'hardware' | 'keyboard' | 'camera' | 'rfid' | 'manual';
  symbology: string | null;
  device_info: string | null;
  scanned_at: string;
  scanned_at_ms: number;
  rssi: number | null;
  antenna_id: number | null;
  raw_data: string | null;
  is_duplicate: boolean;
  job_context: string | null;
  packing_context: string | null;
  parcel_context: string | null;
}

const CHANNEL_BY_SOURCE: Record<ScanSource, ScanEventMeta['input_channel']> = {
  zebra_datawedge: 'hardware',
  zebra_rfid: 'rfid',
  camera: 'camera',
  keyboard_fallback: 'keyboard',
  manual_input: 'manual',
};

export const toScanEventMeta = (scan: ScanEvent): ScanEventMeta => ({
  scan_id: scan.id,
  value: scan.value,
  type: scan.type,
  source: scan.source,
  input_channel: CHANNEL_BY_SOURCE[scan.source] ?? 'manual',
  symbology: scan.symbology ?? null,
  device_info: scan.deviceInfo ?? null,
  scanned_at: new Date(scan.timestamp).toISOString(),
  scanned_at_ms: scan.timestamp,
  rssi: typeof scan.rssi === 'number' ? scan.rssi : null,
  antenna_id: typeof scan.antennaId === 'number' ? scan.antennaId : null,
  raw_data: scan.rawData ?? null,
  is_duplicate: Boolean(scan.isDuplicate),
  job_context: scan.jobContext ?? null,
  packing_context: scan.packingContext ?? null,
  parcel_context: scan.parcelContext ?? null,
});

/** Fält som absolut måste finnas kvar efter transporten genom pipelinen. */
export const REQUIRED_FIDELITY_FIELDS: (keyof ScanEventMeta)[] = [
  'scan_id',
  'value',
  'type',
  'source',
  'input_channel',
  'symbology',
  'device_info',
  'scanned_at',
  'raw_data',
];

export const hasFullFidelity = (meta: Partial<ScanEventMeta> | null | undefined): boolean =>
  !!meta && REQUIRED_FIDELITY_FIELDS.every((f) => f in (meta as object));

/** Mappning ScanEvent.source → QueuedOperation.scan_source (legacy-fält). */
export const queueScanSource = (
  source: ScanSource,
): 'camera' | 'hardware' | 'manual' | 'rfid' | 'unknown' => {
  switch (source) {
    case 'zebra_datawedge':
      return 'hardware';
    case 'zebra_rfid':
      return 'rfid';
    case 'camera':
      return 'camera';
    case 'keyboard_fallback':
    case 'manual_input':
      return 'manual';
    default:
      return 'unknown';
  }
};
