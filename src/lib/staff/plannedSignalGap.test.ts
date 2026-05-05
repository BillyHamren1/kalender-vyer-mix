import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from './actualStaffDayModel';
import type { PlaceVisit } from './pingPlaceSegments';

const date = '2026-05-05';
const FA = { id: 'site-fa', name: 'FA Warehouse', lat: 59.3, lng: 18.0, radiusMeters: 100 };

const faVisit: PlaceVisit = {
  placeKey: `site:${FA.id}`,
  knownSite: { id: FA.id, name: FA.name },
  centre: { lat: FA.lat, lng: FA.lng },
  start: `${date}T13:10:00Z`,
  end: `${date}T15:00:00Z`,
  durationMin: 110,
  pingCount: 50,
  pings: [],
};

const baseInput: BuildActualStaffDayInput = {
  date,
  workday: null,
  timeReports: [],
  locationEntries: [],
  travelLogs: [],
  assistantEvents: [],
  flags: [],
  visits: [faVisit],
  travels: [],
  pings: [{ lat: FA.lat, lng: FA.lng, recorded_at: faVisit.start, accuracy: 10 }],
  latestPing: { recorded_at: faVisit.end },
  knownSites: [FA],
  privateZones: [],
  now: new Date(`${date}T16:00:00Z`),
};

describe('planned_time_without_signal anomaly', () => {
  it('emitterar planned_signal_gap när planerad start saknar signal', () => {
    const m = buildActualStaffDayModel({
      ...baseInput,
      plannedAssignments: [{
        id: 'a1',
        label: 'Projekt A',
        plannedStart: `${date}T08:00:00Z`,
        plannedEnd: `${date}T16:00:00Z`,
      }],
    });
    const planned = m.actualEvents.find(e => e.kind === 'planned_start');
    const gap = m.actualEvents.find(e => e.kind === 'planned_signal_gap');
    expect(planned?.label).toMatch(/Planerad start: Projekt A/);
    expect(gap).toBeDefined();
    const meta = (gap!.meta ?? {}) as any;
    expect(meta.anomalyType).toBe('planned_time_without_signal');
    expect(meta.requiresReview).toBe(true);
    expect(meta.isEvidence).toBe(false);
    expect(Array.isArray(meta.suggestedActions)).toBe(true);
    const anomaly = m.proposedReport.anomalies.find(a => a.id.startsWith('planned-gap:'));
    expect(anomaly).toBeDefined();
  });

  it('skapar inte gap om signal finns nära planerad start', () => {
    const m = buildActualStaffDayModel({
      ...baseInput,
      pings: [{ lat: FA.lat, lng: FA.lng, recorded_at: `${date}T08:05:00Z`, accuracy: 10 }],
      plannedAssignments: [{
        id: 'a1',
        label: 'Projekt A',
        plannedStart: `${date}T08:00:00Z`,
      }],
    });
    expect(m.actualEvents.find(e => e.kind === 'planned_signal_gap')).toBeUndefined();
  });

  it('assignment utan GPS skapar INTE workday (ej automatisk lönegrundande tid)', () => {
    const m = buildActualStaffDayModel({
      ...baseInput,
      plannedAssignments: [{
        id: 'a1',
        label: 'Projekt A',
        plannedStart: `${date}T08:00:00Z`,
      }],
    });
    expect(m.reportState.workday).toBeNull();
    expect(m.proposedReport.proposedWorkdayStart).toBeNull();
  });
});
