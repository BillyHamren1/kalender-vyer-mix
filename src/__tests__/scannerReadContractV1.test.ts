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
  normalizeTimestamp,

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
  const EXPECTED = { bookingId: 'bk-1', organizationId: 'org-1', jobId: 'pk-1' };
  const ok = {
    id: 'ev-1', booking_id: 'bk-1', organization_id: 'org-1', event_type: 'rig',
    start_time: '2026-09-01T06:00:00Z', end_time: '2026-09-01T10:00:00Z',
  };

  it('mappar endast stödda faser', () => {
    expect(mapCalendarPhase('rig')).toBe('rigg');
    expect(mapCalendarPhase('rigg')).toBe('rigg');
    expect(mapCalendarPhase('event')).toBe('event');
    ['rigDown', 'rigdown', 'rig_down', 'riggner'].forEach((t) => expect(mapCalendarPhase(t)).toBe('riggner'));
    ([ 'transport', 'todo', '', null, 42 ] as unknown[]).forEach((t) => expect(mapCalendarPhase(t)).toBeNull());
  });

  it('bevarar event.id/tider exakt och sätter kanoniska fält', () => {
    const events = buildCalendarEvents([ok], EXPECTED);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      event_id: 'ev-1', booking_id: 'bk-1', organization_id: 'org-1', job_id: 'pk-1',
      phase: 'rigg', starts_at: '2026-09-01T06:00:00Z', ends_at: '2026-09-01T10:00:00Z',
      updated_at: null, time_zone: 'Europe/Stockholm', all_day: false, revision: null,
    });
    expect(Object.keys(events[0])).not.toContain('start_time');
    expect(Object.keys(events[0])).not.toContain('end_time');
  });

  it('utelämnar rader som inte uppfyller kontraktet', () => {
    const bad = [
      { ...ok, organization_id: 'org-2' },              // cross-tenant
      { ...ok, booking_id: 'bk-2' },                    // fel booking
      { ...ok, id: '' },                                // saknat event_id
      { ...ok, id: undefined },
      { ...ok, booking_id: null },
      { ...ok, organization_id: null },
      { ...ok, event_type: 'transport' },               // okänd fas
      { ...ok, start_time: '2026-09-01T06:00:00' },     // tid utan offset
      { ...ok, end_time: '2026-09-01' },                // datum utan tid
      { ...ok, start_time: '2026-02-31T06:00:00Z' },    // omöjligt datum
      { ...ok, start_time: '2026-09-01T25:00:00Z' },    // omöjlig tid
      { ...ok, start_time: '2026-09-01T10:00:00Z', end_time: '2026-09-01T06:00:00Z' }, // end före start
      { ...ok, start_time: null },
      { ...ok, end_time: undefined },
    ];
    expect(buildCalendarEvents(bad, EXPECTED)).toEqual([]);
    // Blandat: endast den giltiga raden tas med.
    expect(buildCalendarEvents([...bad, ok], EXPECTED).map((e) => e.event_id)).toEqual(['ev-1']);
  });

  it('kräver förväntad identitet — inget fabriceras', () => {
    expect(buildCalendarEvents([ok], { ...EXPECTED, jobId: null })).toEqual([]);
    expect(buildCalendarEvents([ok], { ...EXPECTED, organizationId: '' })).toEqual([]);
    expect(buildCalendarEvents([ok], { ...EXPECTED, bookingId: undefined })).toEqual([]);
  });

  it('normalizeTimestamp accepterar endast RFC3339-instants', () => {
    ['2026-09-01T06:00:00Z', '2026-09-01T06:00Z', '2026-09-01T06:00:00.123+02:00', '2026-09-01T06:00:00-05:00']
      .forEach((v) => expect(normalizeTimestamp(v)).toBe(v));
    ['2026-09-01', '2026-09-01T06:00:00', '2026-09-01 06:00:00+00', '2026-02-30T06:00:00Z',
      '2026-13-01T06:00:00Z', '2026-09-01T06:60:00Z', 'igår', '', null, 42]
      .forEach((v) => expect(normalizeTimestamp(v as unknown)).toBeNull());
  });

  it('kalenderläsningen är tenant-scopad i wiringen', () => {
    const cal = listBlock.slice(listBlock.indexOf("from('calendar_events')"));
    expect(cal.slice(0, 400)).toMatch(/\.eq\('organization_id', ORG_ID\)/);
    const bookingsRead = listBlock.slice(listBlock.indexOf("select('id, last_applied_source_revision')"));
    expect(bookingsRead.slice(0, 300)).toMatch(/\.eq\('organization_id', ORG_ID\)/);
    expect(listBlock).toMatch(/organizationId: ORG_ID/);
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
      organizationId: 'org-1',
      lastAppliedSourceRevision: { source_status: 'confirmed', revision: 3, source_updated_at: '2026-09-01T10:00:00Z' },
      calendarRows: [
        { id: 'ev-1', booking_id: 'bk-1', organization_id: 'org-1', event_type: 'rigdown', start_time: '2026-09-03T08:00:00Z', end_time: '2026-09-03T12:00:00Z' },
        { id: 'ev-2', booking_id: 'bk-1', organization_id: 'org-2', event_type: 'rig', start_time: '2026-09-03T08:00:00Z', end_time: '2026-09-03T12:00:00Z' },
      ],
      jobId: 'pk-1',
      wms: { ok: false, code: 'wms_reservation_not_found' },
    });
    expect(contract.planning.calendar_events).toHaveLength(1);

    expect(contract.contract_version).toBe('scanner_contract_v1');
    expect(contract.booking.source_revision).toBe(3);
    expect(contract.planning.calendar_events[0].phase).toBe('riggner');
    expect(contract.planning.calendar_events[0].job_id).toBe('pk-1');
    expect(contract.wms.resolution_code).toBe('wms_reservation_not_found');
    expect(contract.wms.reservation_id).toBeNull();
  });
});

describe('byte-för-byte bevarande av ägarsystemets ID/status', () => {
  it('buildBookingEvidence bevarar booking_id och source_status exakt', () => {
    const ev = buildBookingEvidence(' bk-1 ', { source_status: '  Bekräftad/OK  ' });
    expect(ev.booking_id).toBe(' bk-1 ');
    expect(ev.source_status).toBe('  Bekräftad/OK  ');
  });

  it('buildBookingEvidence ger null för whitespace-only', () => {
    const ev = buildBookingEvidence('   ', { source_status: '   ' });
    expect(ev.booking_id).toBeNull();
    expect(ev.source_status).toBeNull();
  });

  it('buildCalendarEvents bevarar id/booking/org/job exakt och kräver exakt match', () => {
    const rows = [
      { id: ' ev-1 ', booking_id: ' bk-1 ', organization_id: ' org-1 ', event_type: 'rig', start_time: '2026-09-03T08:00:00Z', end_time: '2026-09-03T12:00:00Z' },
      { id: 'ev-2', booking_id: 'bk-1', organization_id: ' org-1 ', event_type: 'rig', start_time: '2026-09-03T08:00:00Z', end_time: '2026-09-03T12:00:00Z' },
    ];
    const out = buildCalendarEvents(rows, { bookingId: ' bk-1 ', organizationId: ' org-1 ', jobId: ' pk-1 ' });
    expect(out).toHaveLength(1);
    expect(out[0].event_id).toBe(' ev-1 ');
    expect(out[0].booking_id).toBe(' bk-1 ');
    expect(out[0].organization_id).toBe(' org-1 ');
    expect(out[0].job_id).toBe(' pk-1 ');
  });

  it('buildWmsEvidence bevarar reservation_id och raw_status exakt', () => {
    const ev = buildWmsEvidence({ ok: true, reservationId: ' res-1 ', status: ' Släppt/ÅÄÖ ', updatedAt: '2026-09-01T10:00:00Z', syncedAt: null });
    expect(ev.reservation_id).toBe(' res-1 ');
    expect(ev.raw_status).toBe(' Släppt/ÅÄÖ ');
    expect((ev as Record<string, unknown>).is_released).toBeUndefined();
  });

  it('normalizeTimestamp avvisar omgivande whitespace istället för att trimma', () => {
    expect(normalizeTimestamp(' 2026-09-01T10:00:00Z')).toBeNull();
    expect(normalizeTimestamp('2026-09-01T10:00:00Z ')).toBeNull();
    expect(normalizeTimestamp('\n2026-09-01T10:00:00Z\n')).toBeNull();
    expect(normalizeTimestamp('2026-09-01T10:00:00Z')).toBe('2026-09-01T10:00:00Z');
  });

  it('timestamp med whitespace i kalenderrad utelämnas', () => {
    const out = buildCalendarEvents(
      [{ id: 'ev-1', booking_id: 'bk-1', organization_id: 'org-1', event_type: 'rig', start_time: ' 2026-09-03T08:00:00Z', end_time: '2026-09-03T12:00:00Z' }],
      { bookingId: 'bk-1', organizationId: 'org-1', jobId: 'pk-1' },
    );
    expect(out).toHaveLength(0);
  });
});
