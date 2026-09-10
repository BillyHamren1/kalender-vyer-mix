/**
 * scannerReadContractV1 — Planning-sidan av EventFlow Scanner-läskontraktet v1.
 *
 * SYFTE
 *   Ge Scanner ett versionerat, ADDITIVT bevisblock där varje fält kommer från
 *   ÄGARSYSTEMET. Planning fabricerar aldrig identitet, status eller revision.
 *
 * REGLER (hårda):
 *   - Booking-bevis kommer ENBART från `bookings.last_applied_source_revision`.
 *     Aldrig packing.status, packing.updated_at, bookings.updated_at eller
 *     lokala Planning-ID:n som fallback.
 *   - Planning-kalender-bevis kommer från `calendar_events` (tenant-scopat).
 *     event.id bevaras exakt. Endast uttryckligt stödda faser mappas.
 *   - WMS-bevis kommer ENBART från ett lyckat get-reservation-svar. Okänd
 *     status returneras rått (`raw_status`) — aldrig tolkad till
 *     is_released/is_active.
 *   - Saknad/ogiltig upstreamdata → null eller typed failure-kod. Aldrig gissning.
 *
 * Filen är ren (inga IO-beroenden) och testbar från Vitest.
 */

export const SCANNER_READ_CONTRACT_VERSION = 'scanner_contract_v1' as const;
export const SCANNER_CONTRACT_TIME_ZONE = 'Europe/Stockholm' as const;
/** Max samtidiga WMS-resolutioner i opt-in-flödet. */
export const SCANNER_CONTRACT_WMS_CONCURRENCY = 6;

export interface ScannerBookingEvidence {
  booking_id: string | null;
  source_status: string | null;
  source_revision: number | null;
  source_updated_at: string | null;
}

export type ScannerCalendarPhase = 'rigg' | 'event' | 'riggner';

export interface ScannerCalendarEvent {
  event_id: string;
  booking_id: string | null;
  organization_id: string | null;
  job_id: string | null;
  phase: ScannerCalendarPhase;
  start_time: string | null;
  end_time: string | null;
  updated_at: string | null;
  time_zone: typeof SCANNER_CONTRACT_TIME_ZONE;
  all_day: false;
  revision: null;
}

export interface ScannerWmsEvidence {
  reservation_id: string | null;
  raw_status: string | null;
  updated_at: string | null;
  synced_at: string | null;
  resolution_code: string | null;
}

export interface ScannerContractV1 {
  contract_version: typeof SCANNER_READ_CONTRACT_VERSION;
  booking: ScannerBookingEvidence;
  planning: { calendar_events: ScannerCalendarEvent[] };
  wms: ScannerWmsEvidence;
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Returnerar en giltig timestamp-sträng, annars null. Ingen gissning. */
export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_LIKE.test(trimmed)) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return trimmed;
}

/** Endast icke-negativt heltal accepteras som revision. */
export function normalizeRevision(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Booking-bevis ENBART från bookings.last_applied_source_revision.
 * `bookingId` bevaras exakt som canonical id (ingen lokal fallback).
 */
export function buildBookingEvidence(
  bookingId: string | null | undefined,
  lastAppliedSourceRevision: unknown,
): ScannerBookingEvidence {
  const rev = (lastAppliedSourceRevision && typeof lastAppliedSourceRevision === 'object')
    ? lastAppliedSourceRevision as Record<string, unknown>
    : null;

  return {
    booking_id: typeof bookingId === 'string' && bookingId.length > 0 ? bookingId : null,
    source_status: rev ? normalizeText(rev.source_status) : null,
    source_revision: rev
      ? (normalizeRevision(rev.source_version) ?? normalizeRevision(rev.revision))
      : null,
    source_updated_at: rev ? normalizeTimestamp(rev.source_updated_at) : null,
  };
}

/** Konservativ fasmappning. Okända typer ignoreras helt i Scanner-kontraktet. */
export function mapCalendarPhase(eventType: unknown): ScannerCalendarPhase | null {
  if (typeof eventType !== 'string') return null;
  switch (eventType.trim()) {
    case 'rig':
    case 'rigg':
      return 'rigg';
    case 'event':
      return 'event';
    case 'rigDown':
    case 'rigdown':
    case 'rig_down':
    case 'riggner':
      return 'riggner';
    default:
      return null;
  }
}

export interface RawCalendarEventRow {
  id?: unknown;
  booking_id?: unknown;
  organization_id?: unknown;
  event_type?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  updated_at?: unknown;
}

/**
 * Kanoniserar calendar_events-rader. `jobId` är packing_projects.id och används
 * ENBART som lokal Scanner-jobbidentitet — aldrig som canonical bokningsidentitet.
 */
export function buildCalendarEvents(
  rows: RawCalendarEventRow[] | null | undefined,
  jobId: string | null,
): ScannerCalendarEvent[] {
  const out: ScannerCalendarEvent[] = [];
  for (const row of rows || []) {
    const eventId = typeof row?.id === 'string' ? row.id : null;
    if (!eventId) continue;
    const phase = mapCalendarPhase(row?.event_type);
    if (!phase) continue;
    out.push({
      event_id: eventId,
      booking_id: typeof row?.booking_id === 'string' ? row.booking_id : null,
      organization_id: typeof row?.organization_id === 'string' ? row.organization_id : null,
      job_id: jobId,
      phase,
      start_time: normalizeTimestamp(row?.start_time),
      end_time: normalizeTimestamp(row?.end_time),
      updated_at: normalizeTimestamp(row?.updated_at),
      time_zone: SCANNER_CONTRACT_TIME_ZONE,
      all_day: false,
      revision: null,
    });
  }
  return out;
}

export interface WmsResolutionLike {
  ok?: boolean;
  reservationId?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  syncedAt?: string | null;
  code?: string | null;
}

/** WMS-bevis. Endast ok-resolution får ge reservation_id/raw_status. */
export function buildWmsEvidence(result: WmsResolutionLike | null | undefined): ScannerWmsEvidence {
  if (!result || result.ok !== true) {
    return {
      reservation_id: null,
      raw_status: null,
      updated_at: null,
      synced_at: null,
      resolution_code: normalizeText(result?.code) ?? (result ? 'wms_unresolved' : 'wms_not_attempted'),
    };
  }
  return {
    reservation_id: normalizeText(result.reservationId),
    raw_status: normalizeText(result.status),
    updated_at: normalizeTimestamp(result.updatedAt),
    synced_at: normalizeTimestamp(result.syncedAt),
    resolution_code: null,
  };
}

export function buildScannerContractV1(input: {
  bookingId: string | null | undefined;
  lastAppliedSourceRevision: unknown;
  calendarRows: RawCalendarEventRow[] | null | undefined;
  jobId: string | null;
  wms: WmsResolutionLike | null | undefined;
}): ScannerContractV1 {
  return {
    contract_version: SCANNER_READ_CONTRACT_VERSION,
    booking: buildBookingEvidence(input.bookingId, input.lastAppliedSourceRevision),
    planning: { calendar_events: buildCalendarEvents(input.calendarRows, input.jobId) },
    wms: buildWmsEvidence(input.wms),
  };
}

/** Kör `worker` med begränsad samtidighet. Bevarar ordningen på resultaten. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const max = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const runnerCount = Math.min(max, items.length);
  for (let r = 0; r < runnerCount; r++) {
    runners.push((async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })());
  }
  await Promise.all(runners);
  return results;
}
