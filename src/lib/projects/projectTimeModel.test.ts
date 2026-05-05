import { describe, it, expect } from 'vitest';
import {
  buildProjectTimeSummary,
  type PtmTimeReport,
  type PtmLocationTimeEntry,
  type PtmTravelLog,
} from './projectTimeModel';

const STAFF = '11111111-1111-1111-1111-111111111111';
const BOOKING = 'b0000000-0000-0000-0000-000000000001';
const LARGE = 'l0000000-0000-0000-0000-000000000001';
const SUB_BOOKING = 'b0000000-0000-0000-0000-000000000002';

const tr = (over: Partial<PtmTimeReport> = {}): PtmTimeReport => ({
  id: 'tr1', staff_id: STAFF, booking_id: BOOKING, large_project_id: null,
  start_time: '2026-05-05T08:00:00Z', end_time: '2026-05-05T12:00:00Z',
  hours_worked: 4, break_time: 0, approved: true, is_subdivision: false,
  source: 'mobile', source_entry_id: null,
  ...over,
});
const lte = (over: Partial<PtmLocationTimeEntry> = {}): PtmLocationTimeEntry => ({
  id: 'lte1', staff_id: STAFF, booking_id: BOOKING, large_project_id: null, location_id: null,
  entered_at: '2026-05-05T13:00:00Z', exited_at: '2026-05-05T15:00:00Z',
  total_minutes: 120, source: 'gps',
  ...over,
});
const trav = (over: Partial<PtmTravelLog> = {}): PtmTravelLog => ({
  id: 'tv1', staff_id: STAFF, destination_booking_id: BOOKING,
  start_time: '2026-05-05T07:00:00Z', end_time: '2026-05-05T08:00:00Z',
  hours_worked: 1, approved: true, auto_detected: false,
  source: 'manual', classification: 'work',
  ...over,
});

describe('buildProjectTimeSummary', () => {
  it('counts approved time_report as confirmed and stops there', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'booking', bookingId: BOOKING },
      timeReports: [tr()], locationTimeEntries: [], travelLogs: [],
    });
    expect(r.confirmedMinutes).toBe(240);
    expect(r.activeMinutes).toBe(0);
    expect(r.suggestedMinutes).toBe(0);
    expect(r.staffBreakdown[0].confirmedMinutes).toBe(240);
  });

  it('hard-dedups LTE when time_report.source_entry_id matches', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'booking', bookingId: BOOKING },
      timeReports: [tr({ source_entry_id: 'lte1' })],
      locationTimeEntries: [lte()],
      travelLogs: [],
    });
    expect(r.confirmedMinutes).toBe(240);
    expect(r.suggestedMinutes).toBe(0);
    expect(r.sourceRows.find(s => s.rowId === 'lte1')?.decision).toBe('skipped_dedup_hard');
  });

  it('soft-dedups overlapping LTE and emits anomaly', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'booking', bookingId: BOOKING },
      timeReports: [tr()],
      locationTimeEntries: [lte({
        entered_at: '2026-05-05T11:00:00Z', exited_at: '2026-05-05T13:00:00Z',
        total_minutes: 120,
      })],
      travelLogs: [],
    });
    expect(r.suggestedMinutes).toBe(0);
    expect(r.anomalies.some(a => a.kind === 'overlap_dedup_applied')).toBe(true);
  });

  it('counts non-overlapping closed LTE as suggested', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'booking', bookingId: BOOKING },
      timeReports: [tr()], locationTimeEntries: [lte()], travelLogs: [],
    });
    expect(r.confirmedMinutes).toBe(240);
    expect(r.suggestedMinutes).toBe(120);
  });

  it('counts active LTE separately', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'booking', bookingId: BOOKING },
      timeReports: [],
      locationTimeEntries: [lte({ exited_at: null, total_minutes: null, entered_at: '2026-05-05T14:00:00Z' })],
      travelLogs: [],
      nowMs: new Date('2026-05-05T15:00:00Z').getTime(),
    });
    expect(r.activeMinutes).toBe(60);
  });

  it('skips is_subdivision time reports', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'booking', bookingId: BOOKING },
      timeReports: [tr({ is_subdivision: true })],
      locationTimeEntries: [], travelLogs: [],
    });
    expect(r.confirmedMinutes).toBe(0);
    expect(r.sourceRows[0].decision).toBe('skipped_subdivision');
  });

  it('rolls up large project via large_project_id and includeBookingIds', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'large_project', largeProjectId: LARGE },
      includeBookingIds: [SUB_BOOKING],
      timeReports: [
        tr({ id: 'tr-large', booking_id: null, large_project_id: LARGE }),
        tr({ id: 'tr-sub', booking_id: SUB_BOOKING, large_project_id: null }),
        tr({ id: 'tr-other', booking_id: 'unrelated', large_project_id: null }),
      ],
      locationTimeEntries: [], travelLogs: [],
    });
    expect(r.confirmedMinutes).toBe(480);
    expect(r.sourceRows.find(s => s.rowId === 'tr-other')?.decision).toBe('skipped_not_target');
  });

  it('splits travel into approved vs suggested', () => {
    const r = buildProjectTimeSummary({
      target: { kind: 'booking', bookingId: BOOKING },
      timeReports: [], locationTimeEntries: [],
      travelLogs: [trav(), trav({ id: 'tv2', approved: false, auto_detected: true })],
    });
    expect(r.travelMinutesApproved).toBe(60);
    expect(r.travelMinutesSuggested).toBe(60);
  });
});
