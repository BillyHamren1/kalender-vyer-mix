import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SCANNER_CONTRACT_WMS_CONCURRENCY,
  buildBookingEvidence,
  buildCalendarEvents,
  buildScannerContractV1,
  buildWmsEvidence,
  mapCalendarPhase,
  mapWithConcurrency,
} from '../../supabase/functions/_shared/scannerReadContractV1';

const scannerApi = readFileSync('supabase/functions/scanner-api/index.ts', 'utf8');
const listBlock = scannerApi.slice(
  scannerApi.indexOf("case 'list_active_packings'"),
  scannerApi.indexOf("case 'get_packing'"),
);

describe('booking evidence', () => {
  it('läser endast last_applied_source_revision och bevarar booking_id exakt', () => {
    const ev = buildBookingEvidence('bk-1', {
      source_status: 'confirmed',
      source_version: 12,
      source_updated_at: '2026-09-01T10:00:00Z',
    });
    expect(ev).toEqual({
      booking_id: 'bk-1',
      source_status: 'confirmed',
      source_revision: 12,
      source_updated_at: '2026-09-01T10:00:00Z',
    });
  });

  it('ger null vid saknad/ogiltig revision — ingen gissning', () => {
    expect(buildBookingEvidence('bk-1', null)).toEqual({
      booking_id: 'bk-1', source_status: null, source_revision: null, source_updated_at: null,
    });
    expect(buildBookingEvidence('bk-1', { source_version: -1, source_updated_at: 'igår' }).source_revision).toBeNull();
    expect(buildBookingEvidence('bk-1', { source_version: 1.5 }).source_revision).toBeNull();
    expect(buildBookingEvidence('bk-1', { source_updated_at: 'igår' }).source_updated_at).toBeNull();
  });

  it('använder inga packing-/lokala fallbackar i wiringen', () => {
    expect(listBlock).not.toMatch(/lastAppliedSourceRevision:\s*p\.(status|updated_at)/);
    expect(listBlock).toMatch(/lastAppliedSourceRevision: p\.booking_id \? revisionMap/);
    expect(listBlock).toMatch(/select\('id, last_applied_source_revision'\)/);
  });
});

describe('calendar evidence', () => {
  it('mappar endast stödda faser', () => {
    expect(mapCalendarPhase('rig')).toBe('rigg');
    expect(mapCalendarPhase('rigg')).toBe('rigg');
    expect(mapCalendarPhase('event')).toBe('event');
    ['rigDown', 'rigdown', 'rig_down', 'riggner'].forEach((t) => expect(mapCalendarPhase(t)).toBe('riggner'));
    ['transport', 'todo', '', null, 42].forEach((t) => expect(mapCalendarPhase(t as any)).toBeNull());
  });

  it('bevarar event.id exakt och sätter kanoniska fält', () => {
    const events = buildCalendarEvents([
      { id: 'ev-1', booking_id: 'bk-1', organization_id: 'org-1', event_type: 'rig', start_time: '2026-09-01T06:00:00Z', end_time: '2026-09-01T10:00:00Z' },
      { id: 'ev-2', booking_id: 'bk-1', organization_id: 'org-1', event_type: 'transport' },
      { booking_id: 'bk-1', event_type: 'event' },
    ], 'pk-1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_id: 'ev-1', booking_id: 'bk-1', organization_id: 'org-1',
      job_id: 'pk-1', phase: 'rigg', time_zone: 'Europe/Stockholm', all_day: false, revision: null,
      updated_at: null,
    });
  });

  it('kalenderläsningen är tenant-scopad i wiringen', () => {
    const cal = listBlock.slice(listBlock.indexOf("from('calendar_events')"));
    expect(cal.slice(0, 400)).toMatch(/\.eq\('organization_id', ORG_ID\)/);
    const bookingsRead = listBlock.slice(listBlock.indexOf("select('id, last_applied_source_revision')"));
    expect(bookingsRead.slice(0, 300)).toMatch(/\.eq\('organization_id', ORG_ID\)/);
  });
});

describe('wms evidence', () => {
  it('returnerar okänd status rått, aldrig tolkad', () => {
    const ev = buildWmsEvidence({ ok: true, reservationId: 'res-1', status: 'ÅTERLÄMNAD_X', updatedAt: '2026-09-01T10:00:00Z', syncedAt: null });
    expect(ev.raw_status).toBe('ÅTERLÄMNAD_X');
    expect(JSON.stringify(ev)).not.toMatch(/is_released|is_active/);
    expect(ev.reservation_id).toBe('res-1');
    expect(ev.synced_at).toBeNull();
  });

  it('misslyckad resolution ger null + typed code', () => {
    expect(buildWmsEvidence({ ok: false, code: 'wms_unavailable' })).toEqual({
      reservation_id: null, raw_status: null, updated_at: null, synced_at: null, resolution_code: 'wms_unavailable',
    });
    expect(buildWmsEvidence(null).resolution_code).toBe('wms_not_attempted');
  });

  it('reservation_id sätts endast från lyckad WMS-resolution', () => {
    expect(listBlock).toMatch(/wms_reservation_id: contract\.wms\.reservation_id/);
    expect(listBlock).not.toMatch(/wms_reservation_id: p\./);
  });
});

describe('opt-in wiring', () => {
  it('opt-in false gör noll nya WMS-anrop och lämnar svarsformen orörd', () => {
    expect(listBlock).toMatch(/if \(params\?\.includeScannerContractV1 === true\)/);
    const optIn = listBlock.slice(listBlock.indexOf('includeScannerContractV1 === true'));
    expect(optIn).toMatch(/resolveWmsReservation/);
    const beforeOptIn = listBlock.slice(0, listBlock.indexOf('includeScannerContractV1 === true'));
    expect(beforeOptIn).not.toMatch(/resolveWmsReservation/);
  });

  it('framtida packningar filtreras fortfarande enligt befintlig logik', () => {
    expect(listBlock).toMatch(/rigDate <= cutoffDate/);
    expect(listBlock).toMatch(/downDate <= cutoffDate/);
    expect(listBlock).toMatch(/\.slice\(0, 300\)/);
  });

  it('databasfel fail-closed med stabila koder', () => {
    expect(listBlock).toMatch(/scanner_contract_booking_read_failed/);
    expect(listBlock).toMatch(/scanner_contract_calendar_read_failed/);
  });

  it('opt-in true använder max 6 samtidiga resolutioner', async () => {
    expect(SCANNER_CONTRACT_WMS_CONCURRENCY).toBe(6);
    expect(listBlock).toMatch(/mapWithConcurrency\(\s*filtered,\s*SCANNER_CONTRACT_WMS_CONCURRENCY/);

    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const out = await mapWithConcurrency(items, SCANNER_CONTRACT_WMS_CONCURRENCY, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(6);
    expect(out).toEqual(items.map((n) => n * 2));
  });
});

describe('full contract', () => {
  it('bygger versionerat block utan fabricerade värden', () => {
    const contract = buildScannerContractV1({
      bookingId: 'bk-1',
      lastAppliedSourceRevision: { source_status: 'confirmed', revision: 3, source_updated_at: '2026-09-01T10:00:00Z' },
      calendarRows: [{ id: 'ev-1', booking_id: 'bk-1', organization_id: 'org-1', event_type: 'rigdown', start_time: '2026-09-03T08:00:00Z' }],
      jobId: 'pk-1',
      wms: { ok: false, code: 'wms_reservation_not_found' },
    });
    expect(contract.contract_version).toBe('scanner_contract_v1');
    expect(contract.booking.source_revision).toBe(3);
    expect(contract.planning.calendar_events[0].phase).toBe('riggner');
    expect(contract.planning.calendar_events[0].job_id).toBe('pk-1');
    expect(contract.wms.resolution_code).toBe('wms_reservation_not_found');
    expect(contract.wms.reservation_id).toBeNull();
  });
});
