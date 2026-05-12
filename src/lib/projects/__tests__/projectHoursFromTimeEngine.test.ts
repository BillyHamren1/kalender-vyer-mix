// @vitest-environment node
/**
 * PROJECT HOURS 8 — regressionstester
 * ===================================
 *
 * Låser läsmodellen för "projektets rapporterade personaltimmar":
 *
 *   • Source = staff_day_report_cache (Time Engine). Inga time_reports.
 *   • Work-block räknas på rätt target (booking / project / large_project /
 *     booking-länkad-till-large-project).
 *   • Samma block räknas aldrig dubbelt (large project-aggregeringen).
 *   • Private residence ("Jag är hemma") räknas ALDRIG.
 *   • Transport räknas ALDRIG som projekttid (default policy).
 *   • signal_gap / unknown / needs_review / gps_gap räknas inte fristående.
 *   • Konsoliderade work-sessioner räknas på sin samlade duration.
 *   • Staff- och day-summary speglar samma totala tid som blocken.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeProjectHoursFromDayReports,
  summarizeLargeProjectHoursFromDayReports,
  type StaffDayReportInput,
  type ProjectTimeEngineBlock,
} from '../projectHoursFromTimeEngine';

const BOOKING_A = 'b0000000-0000-0000-0000-0000000000aa';
const BOOKING_B = 'b0000000-0000-0000-0000-0000000000bb';
const PROJECT_A = 'p0000000-0000-0000-0000-0000000000aa';
const LARGE_A = 'l0000000-0000-0000-0000-0000000000aa';

const STAFF_1 = { id: '11111111-1111-1111-1111-111111111111', name: 'Anna' };
const STAFF_2 = { id: '22222222-2222-2222-2222-222222222222', name: 'Bertil' };

const work = (extra: Partial<ProjectTimeEngineBlock>): ProjectTimeEngineBlock => ({
  id: extra.id ?? `blk-${Math.random().toString(36).slice(2, 9)}`,
  kind: 'work',
  startAt: '2026-05-12T07:00:00Z',
  endAt: '2026-05-12T09:00:00Z',
  durationMinutes: 120,
  ...extra,
});

const day = (
  staff: { id: string; name: string },
  date: string,
  blocks: ProjectTimeEngineBlock[],
): StaffDayReportInput => ({
  staff_id: staff.id,
  staff_name: staff.name,
  date,
  blocks,
});

describe('summarizeProjectHoursFromDayReports', () => {
  it('1. work-block med booking_id räknas på rätt booking', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [
        work({ booking_id: BOOKING_A, durationMinutes: 60 }),
        work({ booking_id: BOOKING_B, durationMinutes: 999 }),
      ]),
    ];
    const out = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOKING_A });
    expect(out.totalMinutes).toBe(60);
    expect(out.staffCount).toBe(1);
  });

  it('2. work-block med project_id räknas på rätt project', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [
        work({ project_id: PROJECT_A, durationMinutes: 90 }),
        work({ project_id: 'other', durationMinutes: 999 }),
      ]),
    ];
    const out = summarizeProjectHoursFromDayReports(reports, { project_id: PROJECT_A });
    expect(out.totalMinutes).toBe(90);
  });

  it('3. work-block med large_project_id räknas på rätt large project', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [
        work({ large_project_id: LARGE_A, durationMinutes: 75 }),
      ]),
    ];
    const out = summarizeLargeProjectHoursFromDayReports(reports, {
      large_project_id: LARGE_A,
      booking_ids: [],
    });
    expect(out.totalMinutes).toBe(75);
  });

  it('4. work-block med booking_id kopplad till large project räknas på large project', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [
        // Inget large_project_id på blocket — bara booking_id som tillhör projektet
        work({ booking_id: BOOKING_A, durationMinutes: 45 }),
      ]),
    ];
    const out = summarizeLargeProjectHoursFromDayReports(reports, {
      large_project_id: LARGE_A,
      booking_ids: [BOOKING_A],
    });
    expect(out.totalMinutes).toBe(45);
  });

  it('5. samma block räknas inte dubbelt (large project dedup)', () => {
    // Block bär BÅDE large_project_id OCH booking_id som finns i listan.
    // Får bara räknas en gång.
    const reports = [
      day(STAFF_1, '2026-05-12', [
        work({
          id: 'shared-block-1',
          large_project_id: LARGE_A,
          booking_id: BOOKING_A,
          durationMinutes: 120,
        }),
      ]),
    ];
    const out = summarizeLargeProjectHoursFromDayReports(reports, {
      large_project_id: LARGE_A,
      booking_ids: [BOOKING_A],
    });
    expect(out.totalMinutes).toBe(120);
    expect(out.blocks).toHaveLength(1);
  });

  it('6. private residence / "Jag är hemma" räknas ALDRIG', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [
        { kind: 'private_residence', booking_id: BOOKING_A, durationMinutes: 600 } as any,
        { kind: 'home', project_id: PROJECT_A, durationMinutes: 600 } as any,
        { kind: 'private_or_background', large_project_id: LARGE_A, durationMinutes: 600 } as any,
      ]),
    ];
    expect(
      summarizeProjectHoursFromDayReports(reports, { booking_id: BOOKING_A }).totalMinutes,
    ).toBe(0);
    expect(
      summarizeProjectHoursFromDayReports(reports, { project_id: PROJECT_A }).totalMinutes,
    ).toBe(0);
    expect(
      summarizeLargeProjectHoursFromDayReports(reports, {
        large_project_id: LARGE_A,
        booking_ids: [],
      }).totalMinutes,
    ).toBe(0);
  });

  it('7. transport räknas inte som projekttid (default)', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [
        { kind: 'transport', booking_id: BOOKING_A, durationMinutes: 60 } as any,
        { kind: 'travel', booking_id: BOOKING_A, durationMinutes: 60 } as any,
        work({ booking_id: BOOKING_A, durationMinutes: 30 }),
      ]),
    ];
    const out = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOKING_A });
    expect(out.totalMinutes).toBe(30);
    // Same-target transport flaggas som warning men adderas aldrig
    expect(out.warnings.some((w) => w.startsWith('transport_not_counted'))).toBe(true);
  });

  it('8. signal_gap / unknown_place / needs_review / gps_gap räknas inte fristående', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [
        { kind: 'signal_gap', booking_id: BOOKING_A, durationMinutes: 120 } as any,
        { kind: 'unknown_place', booking_id: BOOKING_A, durationMinutes: 120 } as any,
        { kind: 'needs_review', booking_id: BOOKING_A, durationMinutes: 120 } as any,
        { kind: 'gps_gap', booking_id: BOOKING_A, durationMinutes: 120 } as any,
      ]),
    ];
    const out = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOKING_A });
    expect(out.totalMinutes).toBe(0);
  });

  it('9. konsoliderat work-block räknas på hela sessionens duration', () => {
    // Time Engine har redan absorberat micro-stops/transport in i sessionen.
    // Vi litar på det och räknar block-durationen rakt av.
    const reports = [
      day(STAFF_1, '2026-05-12', [
        work({
          kind: 'work_session',
          booking_id: BOOKING_A,
          startAt: '2026-05-12T06:00:00Z',
          endAt: '2026-05-12T14:30:00Z',
          durationMinutes: 510, // 8h30
        }),
      ]),
    ];
    const out = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOKING_A });
    expect(out.totalMinutes).toBe(510);
    expect(out.totalHours).toBeCloseTo(8.5, 2);
  });

  it('10. staff summary summerar rätt per person', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [work({ booking_id: BOOKING_A, durationMinutes: 60 })]),
      day(STAFF_1, '2026-05-13', [work({ booking_id: BOOKING_A, durationMinutes: 30 })]),
      day(STAFF_2, '2026-05-12', [work({ booking_id: BOOKING_A, durationMinutes: 120 })]),
    ];
    const out = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOKING_A });
    expect(out.totalMinutes).toBe(210);
    expect(out.staffCount).toBe(2);
    const anna = out.staffSummaries.find((s) => s.staff_id === STAFF_1.id);
    const bertil = out.staffSummaries.find((s) => s.staff_id === STAFF_2.id);
    expect(anna?.totalMinutes).toBe(90);
    expect(anna?.days).toEqual(['2026-05-12', '2026-05-13']);
    expect(bertil?.totalMinutes).toBe(120);
  });

  it('11. day summary summerar rätt per dag (unika personer per dag)', () => {
    const reports = [
      day(STAFF_1, '2026-05-12', [work({ booking_id: BOOKING_A, durationMinutes: 60 })]),
      day(STAFF_2, '2026-05-12', [work({ booking_id: BOOKING_A, durationMinutes: 90 })]),
      day(STAFF_1, '2026-05-13', [work({ booking_id: BOOKING_A, durationMinutes: 30 })]),
    ];
    const out = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOKING_A });
    const d12 = out.daySummaries.find((d) => d.date === '2026-05-12');
    const d13 = out.daySummaries.find((d) => d.date === '2026-05-13');
    expect(d12?.totalMinutes).toBe(150);
    expect(d12?.staffCount).toBe(2);
    expect(d13?.totalMinutes).toBe(30);
    expect(d13?.staffCount).toBe(1);
    // Total ska matcha summan av staff-summaries
    const staffSum = out.staffSummaries.reduce((acc, s) => acc + s.totalMinutes, 0);
    expect(out.totalMinutes).toBe(staffSum);
  });
});
