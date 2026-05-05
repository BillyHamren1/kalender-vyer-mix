/**
 * Billy-scenariot — slutverifiering av reglerna 1–7.
 *
 * 02:03 bakgrunds-GPS (okänd plats) → 13:10 FA Warehouse, workday 13:10.
 * Förväntat:
 *  - Ingen huvudrad "02:03–13:10 Förflyttning"
 *  - 02:03 hamnar under Bakgrunds-GPS / ej arbetskopplad
 *  - Huvudjournalen börjar 13:10 (Anlände FA Warehouse, Vistelse pågår, Arbetsdag startad)
 *
 * Variant: assignment 08:00 utan signal förrän 13:10
 *  - planerad start 08:00 visas
 *  - "Ingen app/GPS-signal" från 08:00 till 13:10
 *  - planned_time_without_signal-anomaly med suggestedActions
 *  - workday-decision = Case C, requiresReview = true
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from './actualStaffDayModel';
import type { PlaceVisit, TravelGap } from './pingPlaceSegments';

const date = '2026-05-05';
const FA = { id: 'site-fa', name: 'FA Warehouse', lat: 59.3, lng: 18.0, radiusMeters: 100 };

const nightVisit: PlaceVisit = {
  placeKey: 'unknown:home',
  knownSite: null,
  centre: { lat: 59.31, lng: 18.05 },
  start: `${date}T02:03:00Z`,
  end: `${date}T02:09:00Z`,
  durationMin: 6,
  pingCount: 4,
  pings: [],
};

const faVisit: PlaceVisit = {
  placeKey: `site:${FA.id}`,
  knownSite: { id: FA.id, name: FA.name },
  centre: { lat: FA.lat, lng: FA.lng },
  start: `${date}T13:10:00Z`,
  end: `${date}T13:25:00Z`,
  durationMin: 15,
  pingCount: 8,
  pings: [],
};

const travel: TravelGap = {
  key: 'travel:billy',
  start: nightVisit.end,
  end: faVisit.start,
  durationMin: 661,
  from: nightVisit,
  to: faVisit,
  pings: [],
};

const billyPings = [
  // Telefonen är "tyst" mellan 02:03 och 13:10 — first signal = 13:10.
  { recorded_at: `${date}T13:10:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
  { recorded_at: `${date}T13:25:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
];

const baseInput: BuildActualStaffDayInput = {
  date,
  workday: {
    id: 'wd-billy',
    started_at: `${date}T13:10:00Z`,
    ended_at: null,
    started_by: 'server_auto_start',
    metadata: { auto_started: true },
  },
  timeReports: [],
  locationEntries: [],
  travelLogs: [],
  assistantEvents: [],
  flags: [],
  visits: [nightVisit, faVisit],
  travels: [travel],
  pings: billyPings,
  latestPing: { recorded_at: `${date}T13:25:00Z` },
  knownSites: [FA],
  privateZones: [],
  plannedAssignments: [],
  now: new Date(`${date}T13:30:00Z`),
};

describe('Billy-scenariot — utan assignment', () => {
  const m = buildActualStaffDayModel(baseInput);

  it('ingen huvudrad "02:03–13:10 Förflyttning" — travel demoteras', () => {
    const trv = m.actualEvents.find(e => e.kind === 'gps_travel');
    expect(trv).toBeDefined();
    const meta = (trv!.meta ?? {}) as any;
    expect(meta.workRelevant).toBe(false);
    expect(meta.travelClass).toBe('commute_or_background');
    expect(meta.preWorkdayLeadIn).toBe(true);
    // Ingen "Förflyttning: " i huvudjournals-label
    expect(trv!.label).not.toMatch(/^Förflyttning: /);
    expect(trv!.label).toMatch(/Bakgrunds-GPS före arbetsdagens start/);
  });

  it('02:03 visit hamnar i bakgrunds-GPS (private_or_background)', () => {
    const v = m.actualEvents.find(e => e.kind === 'gps_visit' && e.at === nightVisit.start);
    expect(v).toBeDefined();
    const meta = (v!.meta ?? {}) as any;
    expect(meta.workRelevant).toBe(false);
    expect(meta.workRelevance).toBe('private_or_background');
  });

  it('huvudjournalen börjar 13:10: Anlände + Vistelse pågår + Arbetsdag startad', () => {
    const arr = m.actualEvents.find(
      e => e.kind === 'gps_arrival' && e.place === 'FA Warehouse',
    );
    expect(arr?.at).toBe(`${date}T13:10:00Z`);

    const visit = m.actualEvents.find(
      e => e.kind === 'gps_visit' && e.place === 'FA Warehouse',
    );
    expect(visit?.at).toBe(`${date}T13:10:00Z`);
    // pågår eftersom inget timer-stopp och visit är "lastSeenOnly"/"ongoing"
    expect(visit!.label).toMatch(/pågår|Senast bekräftad/);

    const wd = m.actualEvents.find(e => e.kind === 'workday_started');
    expect(wd?.at).toBe(`${date}T13:10:00Z`);
  });

  it('Decision matrix = Case B (oplanerat), arbetsstart 13:10', () => {
    expect(m.workStartDecision.caseKind).toBe('B_known_site_no_assignment');
    expect(m.workStartDecision.effectiveWorkStartIso).toBe(faVisit.start);
    expect(m.workStartDecision.hidNightLeadIn).toBe(true);
    expect(m.workStartDecision.requiresReview).toBe(false);
  });
});

describe('Billy-scenariot — med assignment 08:00 utan signal förrän 13:10', () => {
  const m = buildActualStaffDayModel({
    ...baseInput,
    workday: null, // ingen workday öppnad ännu
    plannedAssignments: [{
      id: 'assign-billy',
      label: 'FA Warehouse',
      plannedStart: `${date}T08:00:00Z`,
      plannedEnd: `${date}T16:00:00Z`,
    }],
  });

  it('planerad start 08:00 visas', () => {
    const ps = m.actualEvents.find(e => e.kind === 'planned_start');
    expect(ps?.at).toBe(`${date}T08:00:00Z`);
    expect(ps!.label).toMatch(/Planerad start/);
  });

  it('"Ingen app/GPS-signal" 08:00 → 13:10', () => {
    const gap = m.actualEvents.find(e => e.kind === 'planned_signal_gap');
    expect(gap).toBeDefined();
    expect(gap!.at).toBe(`${date}T08:00:00Z`);
    expect(new Date(gap!.until!).toISOString()).toBe(new Date(`${date}T13:10:00Z`).toISOString());
    expect(gap!.durationMin).toBe(310);
  });

  it('föreslår skapa arbetsdag från 08:00 — utan auto-bekräftelse', () => {
    const a = m.proposedReport.anomalies.find(x => x.action?.kind === 'planned_time_without_signal');
    expect(a).toBeDefined();
    expect(a!.action!.plannedStartIso).toBe(`${date}T08:00:00Z`);
    expect(new Date(a!.action!.firstSignalIso!).toISOString()).toBe(new Date(`${date}T13:10:00Z`).toISOString());
    expect(a!.action!.noSignalGapMinutes).toBe(310);

    const gap = m.actualEvents.find(e => e.kind === 'planned_signal_gap');
    const actions = (gap!.meta as any).suggestedActions as Array<{ id: string }>;
    const ids = actions.map(a => a.id);
    expect(ids).toContain('create_workday_from_planned');
    expect(ids).toContain('start_from_first_signal');
    expect(ids).toContain('mark_absence');
  });

  it('Decision matrix = Case C, requiresReview = true (ingen lön 08:00 utan bekräftelse)', () => {
    expect(m.workStartDecision.caseKind).toBe('C_assignment_without_signal');
    expect(m.workStartDecision.requiresReview).toBe(true);
    expect(m.workStartDecision.effectiveWorkStartIso).toBe(faVisit.start);
  });
});
