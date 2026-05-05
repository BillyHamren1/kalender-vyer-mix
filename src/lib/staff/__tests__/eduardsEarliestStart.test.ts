/**
 * Regression: workday-start ska vara tidigaste arbetsrelevanta bekräftade
 * händelse, inte planerad starttid, om GPS visar arbete på annan känd
 * arbetsplats tidigare.
 *
 * Eduards-scenariot:
 *   - Planerad start Workman 10:00
 *   - GPS på FA Warehouse 06:50–07:30
 *   - GPS på Workman 08:01–12:00
 *
 * Förväntat: workStartDecision.effectiveWorkStartIso = 06:50 (FA),
 * och computeStrongWorkIndicators.proposedStartIso = 06:50.
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from '../actualStaffDayModel';
import { computeStrongWorkIndicators } from '../strongWorkIndicators';
import type { PlaceVisit } from '../pingPlaceSegments';

const date = '2026-05-05';
const FA = { id: 'site-fa', name: 'FA Warehouse', lat: 59.30, lng: 18.00, radiusMeters: 100 };
const WORKMAN = { id: 'site-workman', name: 'Workman Event AB', lat: 59.40, lng: 18.10, radiusMeters: 100 };

const visit = (site: typeof FA, start: string, end: string): PlaceVisit => ({
  placeKey: `site:${site.id}`,
  knownSite: { id: site.id, name: site.name },
  centre: { lat: site.lat, lng: site.lng },
  start: `${date}T${start}:00Z`,
  end: `${date}T${end}:00Z`,
  durationMin: 40,
  pingCount: 12,
  pings: [],
});

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
  knownSites: [FA, WORKMAN],
  privateZones: [],
  plannedAssignments: [],
  now: new Date(`${date}T20:00:00Z`),
  ...over,
});

describe('Eduards: tidigaste arbetsrelevanta händelse vinner över planerad start', () => {
  it('GPS FA 06:50 + planerad Workman 10:00 → workday-start = 06:50', () => {
    const fa = visit(FA, '06:50', '07:30');
    const wm = visit(WORKMAN, '08:01', '12:00');
    const m = buildActualStaffDayModel(baseInput({
      visits: [fa, wm],
      plannedAssignments: [{
        id: 'a1',
        label: WORKMAN.name,
        plannedStart: `${date}T10:00:00Z`,
        plannedEnd: `${date}T18:00:00Z`,
      }],
      pings: [
        { recorded_at: `${date}T06:50:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
        { recorded_at: `${date}T08:01:00Z`, latitude: WORKMAN.lat, longitude: WORKMAN.lng, accuracy: 10 } as any,
      ],
    }));

    // Beslutsmatris: Case A, men starttid = tidigaste arbetsrelevanta visit (FA 06:50)
    expect(m.workStartDecision.caseKind).toBe('A_assignment_with_gps');
    expect(m.workStartDecision.effectiveWorkStartIso).toBe(fa.start);

    // Strong work indicators speglar samma start
    const ind = computeStrongWorkIndicators(m);
    expect(ind.hasStrong).toBe(true);
    expect(ind.proposedStartIso).toBe(fa.start);
    expect(ind.reasonCodes).toContain('gps_on_known_work_site');
  });
});
