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
