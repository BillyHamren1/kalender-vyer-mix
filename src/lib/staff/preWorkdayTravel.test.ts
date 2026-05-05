import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from './actualStaffDayModel';
import type { PlaceVisit, TravelGap } from './pingPlaceSegments';

const date = '2026-05-05';
const FA = { id: 'site-fa', name: 'FA Warehouse', lat: 59.3, lng: 18.0, radiusMeters: 100 };

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

const travel: TravelGap = {
  key: 'travel:0',
  start: nightVisit.end,
  end: faVisit.start,
  durationMin: 660,
  from: nightVisit,
  to: faVisit,
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
  visits: [nightVisit, faVisit],
  travels: [travel],
  pings: [],
  latestPing: { recorded_at: faVisit.end },
  knownSites: [FA],
  privateZones: [],
  now: new Date(`${date}T16:00:00Z`),
};

describe('pre-workday lead-in travel', () => {
  it('demoterar nattlig okänd→FA Warehouse till private_or_background (inte huvudjournal)', () => {
    const model = buildActualStaffDayModel(baseInput);
    const trv = model.actualEvents.find(e => e.kind === 'gps_travel');
    expect(trv).toBeDefined();
    const meta = (trv!.meta ?? {}) as any;
    expect(meta.workRelevance).toBe('private_or_background');
    expect(meta.workRelevant).toBe(false);
    expect(meta.preWorkdayLeadIn).toBe(true);
    expect(trv!.label).toMatch(/Bakgrunds-GPS före arbetsdagens start/);
  });

  it('FA Warehouse-vistelsen visas som arbetsrelevant ankare', () => {
    const model = buildActualStaffDayModel(baseInput);
    const visit = model.actualEvents.find(
      e => e.kind === 'gps_visit' && e.place === 'FA Warehouse',
    );
    expect(visit).toBeDefined();
    const meta = (visit!.meta ?? {}) as any;
    expect(meta.workRelevance === 'work_confirmed' || meta.workRelevance === 'work_possible').toBe(true);
  });

  it('travel mellan TVÅ kända arbetsplatser klassas fortfarande som work_confirmed', () => {
    const SECOND = { id: 'site-w', name: 'Workman', lat: 59.32, lng: 18.02, radiusMeters: 100 };
    const v2: PlaceVisit = {
      ...faVisit,
      placeKey: `site:${SECOND.id}`,
      knownSite: { id: SECOND.id, name: SECOND.name },
      centre: { lat: SECOND.lat, lng: SECOND.lng },
      start: `${date}T15:30:00Z`,
      end: `${date}T17:00:00Z`,
    };
    const t2: TravelGap = { ...travel, key: 'travel:1', start: faVisit.end, end: v2.start, from: faVisit, to: v2 };
    const model = buildActualStaffDayModel({
      ...baseInput,
      visits: [faVisit, v2],
      travels: [t2],
      knownSites: [FA, SECOND],
    });
    const trv = model.actualEvents.find(e => e.kind === 'gps_travel');
    const meta = (trv!.meta ?? {}) as any;
    expect(meta.workRelevance).toBe('work_confirmed');
    expect(meta.preWorkdayLeadIn).toBe(false);
  });
});

describe('travel classification (work_travel / commute_or_background / uncertain_travel)', () => {
  const PROJ = { id: 'site-proj', name: 'Projekt A', lat: 59.4, lng: 18.1, radiusMeters: 100 };

  it('A. work_travel: båda ändarna kända arbetsplatser', () => {
    const v1: PlaceVisit = {
      ...faVisit,
      start: `${date}T08:00:00Z`,
      end: `${date}T08:30:00Z`,
      placeKey: `site:${PROJ.id}`,
      knownSite: { id: PROJ.id, name: PROJ.name },
      centre: { lat: PROJ.lat, lng: PROJ.lng },
    };
    const v2: PlaceVisit = { ...faVisit, start: `${date}T13:10:00Z`, end: `${date}T15:00:00Z` };
    const t: TravelGap = { ...travel, key: 'travel:work', start: v1.end, end: v2.start, from: v1, to: v2 };
    const model = buildActualStaffDayModel({
      ...baseInput,
      visits: [v1, v2],
      travels: [t],
      knownSites: [FA, PROJ],
    });
    const trv = model.actualEvents.find(e => e.kind === 'gps_travel')!;
    const meta = (trv.meta ?? {}) as any;
    expect(meta.travelClass).toBe('work_travel');
    expect(trv.label).toMatch(/^Förflyttning: /);
  });

  it('B. commute_or_background: nattlig okänd → första arbetsplats', () => {
    const model = buildActualStaffDayModel(baseInput);
    const trv = model.actualEvents.find(e => e.kind === 'gps_travel')!;
    const meta = (trv.meta ?? {}) as any;
    expect(meta.travelClass).toBe('commute_or_background');
    expect(meta.travelClassReason).toBe('pre_workday_lead_in');
  });

  it('C. uncertain_travel: en känd arbetsplats, en okänd dagtidsplats utan workday-overlap', () => {
    const unknownDay: PlaceVisit = {
      placeKey: 'unknown:mid',
      knownSite: null,
      centre: { lat: 59.5, lng: 18.5 },
      start: `${date}T14:30:00Z`,
      end: `${date}T14:40:00Z`,
      durationMin: 10,
      pingCount: 4,
      pings: [],
    };
    const t: TravelGap = {
      ...travel, key: 'travel:unc', start: faVisit.end, end: unknownDay.start, from: faVisit, to: unknownDay,
    };
    const model = buildActualStaffDayModel({
      ...baseInput,
      visits: [faVisit, unknownDay],
      travels: [t],
    });
    const trv = model.actualEvents.find(e => e.kind === 'gps_travel')!;
    const meta = (trv.meta ?? {}) as any;
    expect(meta.travelClass).toBe('uncertain_travel');
    expect(trv.label).toMatch(/^Möjlig förflyttning/);
  });
});
