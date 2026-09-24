import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildScannerContractV1,
  SCANNER_CONTRACT_BOOKING_READ_FAILED,
  SCANNER_CONTRACT_CALENDAR_READ_FAILED,
} from '../../supabase/functions/_shared/scannerReadContractV1';

const base = {
  bookingId: 'b1',
  organizationId: 'org1',
  lastAppliedSourceRevision: { source_status: 'CONFIRMED', source_updated_at: '2026-09-23T11:57:29.976Z' },
  calendarRows: [{ id: 'e1', booking_id: 'b1', organization_id: 'org1', event_type: 'rig', start_time: '2026-09-24T08:00:00Z', end_time: '2026-09-24T12:00:00Z' }],
  jobId: 'p1',
  wms: { ok: true, reservationId: 'r1', status: 'ACTIVE' },
};

describe('list_active_packings per-job blockers', () => {
  it('no blockers on success', () => {
    const c = buildScannerContractV1(base);
    expect(c.blockers).toEqual([]);
    expect(c.planning.calendar_events).toHaveLength(1);
    expect(c.booking.source_status).toBe('CONFIRMED');
  });

  it('booking read failure → exact blocker, no fabricated evidence', () => {
    const c = buildScannerContractV1({ ...base, bookingReadFailed: true });
    expect(c.blockers).toEqual([SCANNER_CONTRACT_BOOKING_READ_FAILED]);
    expect(c.booking.source_status).toBeNull();
    expect(c.booking.booking_id).toBe('b1');
    expect(c.wms.reservation_id).toBe('r1');
  });

  it('calendar read failure → exact blocker, empty events', () => {
    const c = buildScannerContractV1({ ...base, calendarReadFailed: true });
    expect(c.blockers).toEqual([SCANNER_CONTRACT_CALENDAR_READ_FAILED]);
    expect(c.planning.calendar_events).toEqual([]);
  });

  it('scanner-api no longer returns whole-list 502 for evidence reads', () => {
    const src = readFileSync('supabase/functions/scanner-api/index.ts', 'utf8');
    const start = src.indexOf("case 'list_active_packings'");
    const block = src.slice(start, src.indexOf('return new Response(JSON.stringify(filtered)', start));
    expect(block).not.toMatch(/status: 502/);
    expect(block).toMatch(/bookingReadFailed = true/);
    expect(block).toMatch(/calendarReadFailed = true/);
  });
});
