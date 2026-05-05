/**
 * Markuss-scenariot — multi-stop workday utan foreground-app.
 *
 * GPS:
 *   06:51–07:33 FA Warehouse
 *   08:03–10:00 Workman Event AB
 *
 * Förväntat (efter server auto-start har körts):
 *   - workday startad 06:51 (server_auto_start)
 *   - LTE FA Warehouse 06:51–07:33 (server_background_gps)
 *   - work_travel FA → Workman 07:33–08:03
 *   - LTE Workman 08:03→ pågår
 *   - status "Auto-startad från GPS", inte "Saknar arbetsdag"
 *   - Decision matrix = Case B (oplanerat) eller E om travel mellan dem.
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from './actualStaffDayModel';
import type { PlaceVisit, TravelGap } from './pingPlaceSegments';

const date = '2026-05-05';
const FA = { id: 'site-fa', name: 'FA Warehouse', lat: 59.3, lng: 18.0, radiusMeters: 100 };
const WM = { id: 'site-wm', name: 'Workman Event AB', lat: 59.32, lng: 18.05, radiusMeters: 100 };

const faVisit: PlaceVisit = {
  placeKey: `site:${FA.id}`,
  knownSite: { id: FA.id, name: FA.name },
  centre: { lat: FA.lat, lng: FA.lng },
  start: `${date}T06:51:00Z`,
  end: `${date}T07:33:00Z`,
  durationMin: 42,
  pingCount: 18,
  pings: [],
};
const wmVisit: PlaceVisit = {
  placeKey: `site:${WM.id}`,
  knownSite: { id: WM.id, name: WM.name },
  centre: { lat: WM.lat, lng: WM.lng },
  start: `${date}T08:03:00Z`,
  end: `${date}T10:00:00Z`,
  durationMin: 117,
  pingCount: 40,
  pings: [],
};
const travel: TravelGap = {
  key: 'travel:markuss',
  start: faVisit.end,
  end: wmVisit.start,
  durationMin: 30,
  from: faVisit,
  to: wmVisit,
  pings: [],
};

const input: BuildActualStaffDayInput = {
  date,
  workday: {
    id: 'wd-markuss',
    started_at: faVisit.start,
    ended_at: null,
    started_by: 'server_auto_start',
    metadata: { auto_started: true, auto_start_source: 'server_background_gps' },
  },
  timeReports: [],
  locationEntries: [
    {
      id: 'lte-fa',
      entered_at: faVisit.start,
      exited_at: faVisit.end,
      label: FA.name,
      isPresenceOnly: false,
      hours: 0.7,
      source: 'auto_geofence_server',
      entry_date: date,
      metadata: { auto_started: true, auto_start_source: 'server_background_gps' },
    },
    {
      id: 'lte-wm',
      entered_at: wmVisit.start,
      exited_at: null,
      label: WM.name,
      isPresenceOnly: false,
      hours: 0,
      source: 'auto_geofence_server',
      entry_date: date,
      metadata: { auto_started: true, auto_start_source: 'server_background_gps' },
    },
  ],
  travelLogs: [],
  assistantEvents: [],
  flags: [],
  visits: [faVisit, wmVisit],
  travels: [travel],
  pings: [
    { recorded_at: faVisit.start, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
    { recorded_at: wmVisit.start, latitude: WM.lat, longitude: WM.lng, accuracy: 10 } as any,
  ],
  latestPing: { recorded_at: `${date}T10:00:00Z` },
  knownSites: [FA, WM],
  privateZones: [],
  plannedAssignments: [],
  now: new Date(`${date}T10:05:00Z`),
};

describe('Markuss-scenariot — multi-stop auto-start utan foreground', () => {
  const m = buildActualStaffDayModel(input);

  it('workday började 06:51 — inte "Saknar arbetsdag"', () => {
    const wd = m.actualEvents.find(e => e.kind === 'workday_started');
    expect(wd?.at).toBe(faVisit.start);
    expect(m.reportState.workday).not.toBeNull();
    expect(m.reportState.workday!.started_by).toBe('server_auto_start');
  });

  it('LTE FA Warehouse 06:51–07:33', () => {
    const lte = m.reportState.locationEntries.find(e => e.id === 'lte-fa')!;
    expect(lte.entered_at).toBe(faVisit.start);
    expect(lte.exited_at).toBe(faVisit.end);
    expect(lte.metadata?.auto_start_source).toBe('server_background_gps');
  });

  it('work_travel FA → Workman 07:33–08:03 i huvudjournalen', () => {
    const trv = m.actualEvents.find(e => e.kind === 'gps_travel');
    expect(trv).toBeDefined();
    expect(trv!.at).toBe(faVisit.end);
    expect(trv!.until).toBe(wmVisit.start);
    const meta = (trv!.meta ?? {}) as any;
    expect(meta.travelClass).toBe('work_travel');
    expect(meta.workRelevant).toBe(true);
    expect(trv!.label).toMatch(/^Förflyttning: /);
  });

  it('LTE Workman pågår från 08:03', () => {
    const lte = m.reportState.locationEntries.find(e => e.id === 'lte-wm')!;
    expect(lte.entered_at).toBe(wmVisit.start);
    expect(lte.exited_at).toBeNull();
  });

  it('båda visit-arrivals visas (FA + Workman) som arbetsrelevanta', () => {
    const fa = m.actualEvents.find(e => e.kind === 'gps_arrival' && e.place === FA.name);
    const wm = m.actualEvents.find(e => e.kind === 'gps_arrival' && e.place === WM.name);
    expect(fa).toBeDefined();
    expect(wm).toBeDefined();
    expect((fa!.meta as any).workRelevant).toBe(true);
    expect((wm!.meta as any).workRelevant).toBe(true);
  });

  it('Decision matrix = Case B (oplanerat) + hasInterWorksiteTravel=true', () => {
    expect(m.workStartDecision.caseKind).toBe('B_known_site_no_assignment');
    expect(m.workStartDecision.confidence).toBe('high');
    expect(m.workStartDecision.effectiveWorkStartIso).toBe(faVisit.start);
    expect(m.workStartDecision.hasInterWorksiteTravel).toBe(true);
    expect(m.workStartDecision.requiresReview).toBe(false);
  });
});
