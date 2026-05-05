// @vitest-environment node
/**
 * Scenario 9 — Projekt-ekonomi använder confirmed project time, inte raw workday.
 *
 *   • Projektkostnad = confirmed time_reports.
 *   • Approved travel adderas endast om includeApprovedTravel=true.
 *   • Workday räknas aldrig mot projekt — överskott visas som
 *     unallocatedWorkdayMinutes (intern avvikelse), inte kostnad.
 *   • Lön ≠ projektkostnad och får inte blandas.
 */
import { describe, it, expect } from 'vitest';
import { buildProjectTimeSummary } from '../projectTimeModel';
import { buildProjectLaborBasis } from '../projectLaborBasis';

const STAFF = '11111111-1111-1111-1111-111111111111';
const BOOKING = 'b0000000-0000-0000-0000-00000000aaaa';

describe('buildProjectLaborBasis', () => {
  const summary = buildProjectTimeSummary({
    target: { kind: 'booking', bookingId: BOOKING },
    nowMs: new Date('2026-05-05T17:00:00Z').getTime(),
    timeReports: [{
      id: 'tr', staff_id: STAFF, booking_id: BOOKING, large_project_id: null,
      start_time: '2026-05-05T08:00:00Z', end_time: '2026-05-05T12:00:00Z',
      hours_worked: 4, break_time: 0, approved: true, is_subdivision: false,
      source: 'mobile', source_entry_id: null,
    }],
    locationTimeEntries: [{
      // Pågående aktivitet på samma projekt — preliminär, inte kostnad.
      id: 'lte-active', staff_id: STAFF, booking_id: BOOKING,
      large_project_id: null, location_id: null,
      entered_at: '2026-05-05T13:00:00Z', exited_at: null,
      total_minutes: null, source: 'gps',
    }],
    travelLogs: [
      { id: 'tv-ok', staff_id: STAFF, destination_booking_id: BOOKING,
        start_time: '2026-05-05T07:30:00Z', end_time: '2026-05-05T08:00:00Z',
        hours_worked: 0.5, approved: true, auto_detected: false,
        source: 'manual', classification: 'work' },
      { id: 'tv-sug', staff_id: STAFF, destination_booking_id: BOOKING,
        start_time: '2026-05-05T12:00:00Z', end_time: '2026-05-05T12:25:00Z',
        hours_worked: 25 / 60, approved: false, auto_detected: true,
        source: 'gap_derived', classification: 'work' },
    ],
  });

  // Workday för samma person — 8h med 30min rast = 450 min
  const workdays = [{
    staffId: STAFF,
    startedAt: '2026-05-05T07:30:00Z',
    endedAt:   '2026-05-05T16:00:00Z',
    breakMinutes: 30,
  }];

  it('default: projektkostnad = confirmed (240), travel separat, workday-överskott blir avvikelse', () => {
    const basis = buildProjectLaborBasis(summary, { workdays });
    expect(basis.confirmedMinutes).toBe(240);
    expect(basis.approvedTravelMinutes).toBe(30);
    expect(basis.billableMinutes).toBe(240); // travel ej inkluderat per default
    // pending = active(240) + suggested(0) + suggested travel(25) + approved travel inte räknat (30)
    expect(basis.pendingMinutes).toBe(240 + 25 + 30);
    // workday 450 − (confirmed 240 + approved travel 30) = 180 min ofördelad
    expect(basis.unallocatedWorkdayMinutes).toBe(180);
    expect(basis.hasUnallocatedWorkday).toBe(true);
    expect(basis.perStaff[0].workdayMinutes).toBe(450);
  });

  it('includeApprovedTravel=true lägger restid i kostnaden', () => {
    const basis = buildProjectLaborBasis(summary, { workdays, includeApprovedTravel: true });
    expect(basis.billableMinutes).toBe(270); // 240 + 30
    // pending tappar approved travel (den ingår nu i billable), behåller suggested travel + active
    expect(basis.pendingMinutes).toBe(240 + 25);
  });

  it('utan workday-data: ingen ofördelad-avvikelse rapporteras', () => {
    const basis = buildProjectLaborBasis(summary);
    expect(basis.unallocatedWorkdayMinutes).toBe(0);
    expect(basis.hasUnallocatedWorkday).toBe(false);
  });

  it('pågående workday räknas inte (lön/projekt får inte använda öppna workdays)', () => {
    const basis = buildProjectLaborBasis(summary, {
      workdays: [{ staffId: STAFF, startedAt: '2026-05-05T07:30:00Z', endedAt: null }],
    });
    expect(basis.perStaff[0].workdayMinutes).toBe(0);
    expect(basis.unallocatedWorkdayMinutes).toBe(0);
  });

  it('workday lever separat från projektkostnad: 240 confirmed ≠ 450 workday', () => {
    const basis = buildProjectLaborBasis(summary, { workdays });
    expect(basis.billableMinutes).not.toBe(basis.perStaff[0].workdayMinutes);
    // Lön kan basera sig på workdayMinutes; projekt på billableMinutes.
    expect(basis.perStaff[0].workdayMinutes).toBe(450);
    expect(basis.billableMinutes).toBe(240);
  });
});
