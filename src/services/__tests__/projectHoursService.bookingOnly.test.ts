// @vitest-environment node
/**
 * Regressionstest för booking-strikt target.
 *
 * Säkerställer att `summarizeProjectHoursFromDayReports` med
 * target = { booking_id } INTE räknar block som bara matchar via
 * large_project_id — vilket var dubbelräkningsbuggen i useLargeProjectEconomy
 * (Swedish Game Fair fick hela LP-totalen på varje syskonbooking).
 *
 * Direkt-test mot pure helpern (samma helper som
 * fetchProjectStaffHoursAsTimeReportsBookingOnly bygger sitt resultat från).
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeProjectHoursFromDayReports,
  summarizeLargeProjectHoursFromDayReports,
  type StaffDayReportInput,
} from '@/lib/projects/projectHoursFromTimeEngine';

const LP = 'lp-swedish-game-fair';
const BOOK_A = 'booking-a';
const BOOK_B = 'booking-b';
const STAFF = 'staff-1';

function dayWith(blocks: any[]): StaffDayReportInput[] {
  return [{ staff_id: STAFF, staff_name: 'Anna', date: '2026-05-26', blocks }];
}

describe('booking-only target avbryter large-project-OR-matchning', () => {
  it('block med endast large_project_id IGNORERAS av booking-only target', () => {
    const reports = dayWith([
      { id: 'b1', kind: 'work', large_project_id: LP, durationMinutes: 480 },
    ]);
    // Booking-only target: får INTE matcha bara på large_project_id.
    const out = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOK_A });
    expect(out.totalMinutes).toBe(0);
  });

  it('block matchar booking-only target endast när booking_id matchar exakt', () => {
    const reports = dayWith([
      { id: 'b1', kind: 'work', booking_id: BOOK_A, large_project_id: LP, durationMinutes: 120 },
      { id: 'b2', kind: 'work', booking_id: BOOK_B, large_project_id: LP, durationMinutes: 999 },
    ]);
    const outA = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOK_A });
    const outB = summarizeProjectHoursFromDayReports(reports, { booking_id: BOOK_B });
    expect(outA.totalMinutes).toBe(120);
    expect(outB.totalMinutes).toBe(999);
  });

  it('LP-aggregeringen räknar fortfarande ETT block en gång även när det matchar både booking_id och large_project_id', () => {
    const reports = dayWith([
      { id: 'shared', kind: 'work', booking_id: BOOK_A, large_project_id: LP, durationMinutes: 480 },
    ]);
    const out = summarizeLargeProjectHoursFromDayReports(reports, {
      large_project_id: LP,
      booking_ids: [BOOK_A, BOOK_B],
    });
    expect(out.totalMinutes).toBe(480);
    expect(out.blocks).toHaveLength(1);
  });

  it('summan av per-booking booking-only-vyer = LP-totalen (ingen dubbelräkning)', () => {
    // Två bookings under SGF, ett block vardera + ett block märkt bara med LP.
    const reports = dayWith([
      { id: 'a1', kind: 'work', booking_id: BOOK_A, large_project_id: LP, durationMinutes: 300 },
      { id: 'b1', kind: 'work', booking_id: BOOK_B, large_project_id: LP, durationMinutes: 240 },
      { id: 'lp1', kind: 'work', large_project_id: LP, durationMinutes: 60 },
    ]);
    const perBooking =
      summarizeProjectHoursFromDayReports(reports, { booking_id: BOOK_A }).totalMinutes +
      summarizeProjectHoursFromDayReports(reports, { booking_id: BOOK_B }).totalMinutes;
    const lp = summarizeLargeProjectHoursFromDayReports(reports, {
      large_project_id: LP,
      booking_ids: [BOOK_A, BOOK_B],
    }).totalMinutes;
    // Per-booking-summan saknar LP-only-blocket (60) — som det ska. LP-totalen
    // är 600. Det viktiga: per-booking-summan ÖVERSKRIDER aldrig LP-totalen.
    expect(perBooking).toBe(540);
    expect(lp).toBe(600);
    expect(perBooking).toBeLessThanOrEqual(lp);
  });
});
