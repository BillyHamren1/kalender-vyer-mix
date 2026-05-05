/**
 * Kontrakt: Planering och Faktiskt är HÅRT separerade i ActualStaffDayModel.
 *
 * - planned_start får ALDRIG dyka upp i model.actualEvents
 * - planeringsförväntan exponeras endast i model.planningItems
 * - en planerad assignment påverkar aldrig tidslinjen som om den hänt
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel } from '@/lib/staff/actualStaffDayModel';

const date = '2026-05-05';

describe('Planning vs Actual hard separation', () => {
  const model = buildActualStaffDayModel({
    date,
    workday: null,
    timeReports: [],
    locationEntries: [],
    travelLogs: [],
    assistantEvents: [],
    flags: [],
    visits: [],
    travels: [],
    pings: [],
    latestPing: null,
    knownSites: [],
    privateZones: [],
    plannedAssignments: [
      {
        id: 'a1',
        label: 'Projekt A',
        plannedStart: `${date}T16:00:00+00:00`,
        plannedEnd: `${date}T22:00:00+00:00`,
      },
    ],
    now: new Date(`${date}T23:00:00Z`),
  });

  it('emitterar inga planned_start-events i actualEvents', () => {
    const planned = model.actualEvents.filter(e => e.kind === 'planned_start');
    expect(planned).toHaveLength(0);
  });

  it('exponerar assignment via planningItems', () => {
    expect(model.planningItems).toHaveLength(1);
    const p = model.planningItems[0];
    expect(p.assignmentId).toBe('a1');
    expect(p.label).toBe('Projekt A');
    expect(p.plannedStart).toBe(`${date}T16:00:00+00:00`);
    expect(p.plannedEnd).toBe(`${date}T22:00:00+00:00`);
    expect(p.source).toBe('planning');
  });

  it('actualEvents innehåller bara faktiska kinds', () => {
    const allowed = new Set([
      'workday_started','workday_ended','timer_started','timer_stopped','timer_end_estimated',
      'time_report_created','time_report_closed','gps_arrival','gps_departure','gps_visit',
      'gps_travel','assistant_arrival','assistant_departure','assistant_other',
      'travel_suggestion','stale_signal','gps_gap','planned_signal_gap','anomaly',
    ]);
    for (const ev of model.actualEvents) {
      expect(allowed.has(ev.kind)).toBe(true);
      expect(ev.kind).not.toBe('planned_start');
    }
  });
});
