import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from './actualStaffDayModel';
import type { PlaceVisit, TravelGap } from './pingPlaceSegments';

const date = '2026-05-05';
const FA = { id: 'site-fa', name: 'FA Warehouse', lat: 59.3, lng: 18.0, radiusMeters: 100 };
const PROJ = { id: 'site-proj', name: 'Projekt A', lat: 59.4, lng: 18.1, radiusMeters: 100 };

const baseInput = (over: Partial<BuildActualStaffDayInput>): BuildActualStaffDayInput => ({
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
  knownSites: [FA, PROJ],
  privateZones: [],
  plannedAssignments: [],
  now: new Date(`${date}T20:00:00Z`),
  ...over,
});

const projVisit = (start: string, end: string): PlaceVisit => ({
  placeKey: `site:${PROJ.id}`,
  knownSite: { id: PROJ.id, name: PROJ.name },
  centre: { lat: PROJ.lat, lng: PROJ.lng },
  start: `${date}T${start}:00Z`,
  end: `${date}T${end}:00Z`,
  durationMin: 30,
  pingCount: 10,
  pings: [],
});
const faVisit = (start: string, end: string): PlaceVisit => ({
  placeKey: `site:${FA.id}`,
  knownSite: { id: FA.id, name: FA.name },
  centre: { lat: FA.lat, lng: FA.lng },
  start: `${date}T${start}:00Z`,
  end: `${date}T${end}:00Z`,
  durationMin: 90,
  pingCount: 30,
  pings: [],
});
const nightVisit: PlaceVisit = {
  placeKey: 'unknown:home',
  knownSite: null,
  centre: { lat: 59.31, lng: 18.05 },
  start: `${date}T02:00:00Z`,
  end: `${date}T02:06:00Z`,
  durationMin: 6,
  pingCount: 4,
  pings: [],
};

describe('Beslutsmatris för arbetsstart (Case A–E)', () => {
  it('Case A: assignment + GPS på arbetsplats → high confidence', () => {
    const v = projVisit('08:00', '12:00');
    const m = buildActualStaffDayModel(baseInput({
      visits: [v],
      plannedAssignments: [{ id: 'a1', label: PROJ.name, plannedStart: `${date}T08:00:00Z`, plannedEnd: `${date}T16:00:00Z` }],
      pings: [{ recorded_at: `${date}T08:00:00Z`, latitude: PROJ.lat, longitude: PROJ.lng, accuracy: 10 } as any],
    }));
    expect(m.workStartDecision.caseKind).toBe('A_assignment_with_gps');
    expect(m.workStartDecision.confidence).toBe('high');
    expect(m.workStartDecision.requiresReview).toBe(false);
    expect(m.workStartDecision.effectiveWorkStartIso).toBe(v.start);
  });

  it('Case B: ingen assignment men GPS på känd arbetsplats → unplanned', () => {
    const v = faVisit('09:00', '11:00');
    const m = buildActualStaffDayModel(baseInput({
      visits: [v],
      pings: [{ recorded_at: `${date}T09:00:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any],
    }));
    expect(m.workStartDecision.caseKind).toBe('B_known_site_no_assignment');
    expect(['medium', 'high']).toContain(m.workStartDecision.confidence);
    expect(m.workStartDecision.effectiveWorkStartIso).toBe(v.start);
  });

  it('Case C: assignment 08:00 men ingen signal förrän 13:10 → review', () => {
    const v = faVisit('13:10', '15:00');
    const m = buildActualStaffDayModel(baseInput({
      visits: [v],
      plannedAssignments: [{ id: 'a1', label: PROJ.name, plannedStart: `${date}T08:00:00Z`, plannedEnd: `${date}T16:00:00Z` }],
      pings: [{ recorded_at: `${date}T13:10:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any],
    }));
    expect(m.workStartDecision.caseKind).toBe('C_assignment_without_signal');
    expect(m.workStartDecision.requiresReview).toBe(true);
    // Anomaly med planned_time_without_signal-action ska finnas
    expect(m.proposedReport.anomalies.some(a => a.action?.kind === 'planned_time_without_signal')).toBe(true);
  });

  it('Case D: bara nattlig/privat GPS → ingen arbetsstart, lead-in dolt', () => {
    const m = buildActualStaffDayModel(baseInput({
      visits: [nightVisit],
    }));
    expect(m.workStartDecision.caseKind).toBe('D_only_private_then_first_work');
    expect(m.workStartDecision.effectiveWorkStartIso).toBeNull();
    expect(m.workStartDecision.hidNightLeadIn).toBe(true);
  });

  it('Case E: två arbetsplatser med travel emellan → work_travel + matrisflagga', () => {
    const v1 = projVisit('08:00', '12:00');
    const v2 = faVisit('13:00', '15:00');
    const t: TravelGap = {
      key: 'tr:1', start: v1.end, end: v2.start, durationMin: 60, from: v1, to: v2, pings: [],
    };
    const m = buildActualStaffDayModel(baseInput({
      visits: [v1, v2],
      travels: [t],
    }));
    expect(m.workStartDecision.hasInterWorksiteTravel).toBe(true);
    const trv = m.actualEvents.find(e => e.kind === 'gps_travel');
    expect((trv!.meta as any).travelClass).toBe('work_travel');
  });
});
