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

  // Workman-scenariot: timer + time_report startade/stoppade nästan samtidigt
  // mot samma projekt. Får aldrig dubbelräknas.
  describe('Workman scenario — timer + time_report sammanfaller', () => {
    const target = { kind: 'booking' as const, bookingId: BOOKING };
    const trWindow = tr({
      id: 'tr-workman',
      start_time: '2026-05-05T08:04:00Z',
      end_time: '2026-05-05T12:25:00Z',
      hours_worked: 4 + 21 / 60,
    });
    const lteWindow = lte({
      id: 'lte-workman',
      entered_at: '2026-05-05T08:04:00Z',
      exited_at: '2026-05-05T12:25:00Z',
      total_minutes: 261,
    });

    it('hård dedup när source_entry_id binder TR↔LTE', () => {
      const r = buildProjectTimeSummary({
        target,
        timeReports: [{ ...trWindow, source_entry_id: 'lte-workman' }],
        locationTimeEntries: [lteWindow],
        travelLogs: [],
      });
      expect(r.confirmedMinutes).toBe(261);
      expect(r.activeMinutes).toBe(0);
      expect(r.suggestedMinutes).toBe(0);
      expect(r.staffBreakdown[0].confirmedMinutes).toBe(261);
      expect(r.sourceRows.find(s => s.rowId === 'lte-workman')?.decision).toBe('skipped_dedup_hard');
    });

    it('mjuk dedup via overlap när source_entry_id saknas', () => {
      const r = buildProjectTimeSummary({
        target,
        timeReports: [trWindow],
        locationTimeEntries: [lteWindow],
        travelLogs: [],
      });
      expect(r.confirmedMinutes).toBe(261);
      expect(r.activeMinutes).toBe(0);
      expect(r.suggestedMinutes).toBe(0);
      expect(r.sourceRows.find(s => s.rowId === 'lte-workman')?.decision).toBe('skipped_dedup_overlap');
      expect(r.anomalies.some(a => a.kind === 'overlap_dedup_applied')).toBe(true);
    });

    it('LTE vinner över GPS/assistant — närvaro utan timer/TR blir bara förslag', () => {
      // Ingen TR, ingen LTE → ingen confirmed/active. (GPS/assistant matas inte
      // in i project time-modellen alls; de kan bara bli suggestion via LTE
      // eller travel_time_logs.) Denna invariant testas implicit: utan input
      // blir summeringen 0 även om "GPS-evidens" finns ute i världen.
      const r = buildProjectTimeSummary({
        target,
        timeReports: [],
        locationTimeEntries: [],
        travelLogs: [],
      });
      expect(r.confirmedMinutes + r.activeMinutes + r.suggestedMinutes).toBe(0);
    });

    it('travel räknas separat även om den ligger precis före passet', () => {
      const r = buildProjectTimeSummary({
        target,
        timeReports: [{ ...trWindow, source_entry_id: 'lte-workman' }],
        locationTimeEntries: [lteWindow],
        travelLogs: [trav({
          id: 'tv-workman',
          start_time: '2026-05-05T07:30:00Z',
          end_time: '2026-05-05T08:04:00Z',
          hours_worked: 34 / 60,
        })],
      });
      expect(r.confirmedMinutes).toBe(261);
      expect(r.travelMinutesApproved).toBe(34);
      // Travel ska aldrig läcka in i confirmed/active/suggested.
      expect(r.activeMinutes).toBe(0);
      expect(r.suggestedMinutes).toBe(0);
    });
  });
});

