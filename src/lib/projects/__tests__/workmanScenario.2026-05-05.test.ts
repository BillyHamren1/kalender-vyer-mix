// @vitest-environment node
/**
 * Scenario 8 — Workman / FA Warehouse 2026-05-05 (Markuss/Eduards)
 *
 * Bekräftar att buildProjectTimeSummary för Workman-bookingen:
 *   ✓ inte räknar tid på FA Warehouse (location-LTE → annan target)
 *   ✓ räknar Workman-vistelse/timer på Workman
 *   ✓ klassar travel FA → Workman som föreslagen restid (inte confirmed projekttid)
 *   ✓ deduplicerar timer + tidrapport (en gång)
 *   ✓ exponerar pågående timer som activeMinutes
 *   ✓ flaggar "stängd LTE utan time_report" som anomali → projektet kan visa
 *     "tid finns men arbetsdag saknas" via samma signalväg (workday_flags lever separat).
 */
import { describe, it, expect } from 'vitest';
import {
  buildProjectTimeSummary,
  type PtmTimeReport,
  type PtmLocationTimeEntry,
  type PtmTravelLog,
} from '../projectTimeModel';

const MARKUSS = '11111111-1111-1111-1111-1111111111aa';
const EDUARDS = '22222222-2222-2222-2222-2222222222bb';
const WORKMAN = 'b0000000-0000-0000-0000-00000000aaaa'; // 2604-111 Workman Event AB
const FA_LOC  = 'l0000000-0000-0000-0000-0000000000fa'; // FA Warehouse internal location
const NOW_MS  = new Date('2026-05-05T13:30:00Z').getTime();

describe('Scenario 8 — Workman/FA Warehouse 2026-05-05', () => {
  // Markuss: TR + matchande LTE på Workman + restid + FA Warehouse-presence
  const markussTR: PtmTimeReport = {
    id: 'tr-mk',
    staff_id: MARKUSS,
    booking_id: WORKMAN,
    large_project_id: null,
    start_time: '2026-05-05T08:01:00Z',
    end_time:   '2026-05-05T12:04:00Z',
    hours_worked: 4.05,
    break_time: 0,
    approved: true,
    is_subdivision: false,
    source: 'mobile',
    source_entry_id: 'lte-mk-workman', // hård dedup
  };
  const markussWorkmanLTE: PtmLocationTimeEntry = {
    id: 'lte-mk-workman',
    staff_id: MARKUSS,
    booking_id: WORKMAN,
    large_project_id: null,
    location_id: null,
    entered_at: '2026-05-05T08:01:00Z',
    exited_at:  '2026-05-05T12:04:00Z',
    total_minutes: 243,
    source: 'gps',
  };
  const markussFaPresenceLTE: PtmLocationTimeEntry = {
    id: 'lte-mk-fa',
    staff_id: MARKUSS,
    booking_id: null, large_project_id: null,
    location_id: FA_LOC,
    entered_at: '2026-05-05T06:50:00Z',
    exited_at:  '2026-05-05T07:33:00Z',
    total_minutes: 43,
    source: 'gps',
  };
  const markussTravel: PtmTravelLog = {
    id: 'tv-mk',
    staff_id: MARKUSS,
    destination_booking_id: WORKMAN,
    start_time: '2026-05-05T07:33:00Z',
    end_time:   '2026-05-05T08:01:00Z',
    hours_worked: 28 / 60,
    approved: false, // föreslagen
    auto_detected: true,
    source: 'gap_derived',
    classification: 'work',
  };

  // Eduards: pågående timer + ingen TR ännu
  const eduardsActiveLTE: PtmLocationTimeEntry = {
    id: 'lte-ed-workman',
    staff_id: EDUARDS,
    booking_id: WORKMAN,
    large_project_id: null,
    location_id: null,
    entered_at: '2026-05-05T08:30:00Z',
    exited_at: null, // pågående
    total_minutes: null,
    source: 'gps',
  };

  // Stängd Workman-LTE för Eduards utan motsvarande time_report → orphan
  const eduardsOrphanClosedLTE: PtmLocationTimeEntry = {
    id: 'lte-ed-workman-orphan',
    staff_id: EDUARDS,
    booking_id: WORKMAN,
    large_project_id: null,
    location_id: null,
    entered_at: '2026-05-04T08:00:00Z',
    exited_at:  '2026-05-04T11:30:00Z',
    total_minutes: 210,
    source: 'gps',
  };

  const summary = buildProjectTimeSummary({
    target: { kind: 'booking', bookingId: WORKMAN },
    nowMs: NOW_MS,
    timeReports: [markussTR],
    locationTimeEntries: [
      markussWorkmanLTE,
      markussFaPresenceLTE,
      eduardsActiveLTE,
      eduardsOrphanClosedLTE,
    ],
    travelLogs: [markussTravel],
  });

  it('FA Warehouse-tiden hamnar inte på Workman', () => {
    const faRow = summary.sourceRows.find(r => r.rowId === 'lte-mk-fa');
    expect(faRow?.decision).toBe('skipped_not_target');
    // Bidrar inte till någon räknad kategori
    expect(summary.staffBreakdown.find(s => s.staffId === MARKUSS)?.confirmedMinutes).toBe(243);
  });

  it('Workman-tidrapporten räknas som confirmed och timern deduplicerar via source_entry_id', () => {
    expect(summary.confirmedMinutes).toBe(243); // 08:01–12:04 = 243 min
    const trRow = summary.sourceRows.find(r => r.rowId === 'tr-mk');
    expect(trRow?.decision).toBe('counted_confirmed');
    const lteRow = summary.sourceRows.find(r => r.rowId === 'lte-mk-workman');
    expect(lteRow?.decision).toBe('skipped_dedup_hard');
    // Inga overlap-anomalier för Markuss Workman-paret (hård dedup, inte mjuk)
    expect(summary.anomalies.some(a => a.rowId === 'lte-mk-workman' && a.kind === 'overlap_dedup_applied')).toBe(false);
  });

  it('Travel FA → Workman blir suggested travel, inte confirmed projekttid', () => {
    const tRow = summary.sourceRows.find(r => r.rowId === 'tv-mk');
    expect(tRow?.decision).toBe('counted_travel_suggested');
    expect(tRow?.kind).toBe('travel_suggested');
    expect(summary.travelMinutesSuggested).toBe(28);
    expect(summary.travelMinutesApproved).toBe(0);
    // Restid blandas inte in i confirmed
    expect(summary.confirmedMinutes).toBe(243);
  });

  it('pågående Eduards-timer rapporteras som activeMinutes på Workman', () => {
    const ed = summary.staffBreakdown.find(s => s.staffId === EDUARDS);
    expect(ed?.activeMinutes).toBeGreaterThan(0);
    // 08:30 → 13:30 = 300 min
    expect(ed?.activeMinutes).toBe(300);
    expect(summary.activeMinutes).toBe(300);
    const row = summary.sourceRows.find(r => r.rowId === 'lte-ed-workman');
    expect(row?.decision).toBe('counted_active');
  });

  it('stängd Eduards-LTE utan time_report flaggas som anomali (signal för "tid finns men arbetsdag saknas")', () => {
    const a = summary.anomalies.find(a => a.rowId === 'lte-ed-workman-orphan');
    expect(a?.kind).toBe('lte_no_time_report');
    expect(summary.suggestedMinutes).toBe(210);
  });

  it('staffBreakdown listar bara personer som faktiskt varit på Workman', () => {
    const ids = summary.staffBreakdown.map(s => s.staffId).sort();
    expect(ids).toEqual([MARKUSS, EDUARDS].sort());
  });
});
