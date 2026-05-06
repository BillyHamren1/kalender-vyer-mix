/**
 * Regression: när knownSites-poolen innehåller flera projekt, ska
 * findNearestSite returnera det GEOGRAFISKT närmaste och rapportera
 * candidatesWithinRadius — inte ett random projekt som råkar finnas i poolen.
 *
 * Bakgrund: visit på Skoklostervägen 98 (≈ Westmans 59.7032,17.6212) gav
 * felaktigt "Swedish Game Fair" (≈ 7 km bort) som närmsta projekt eftersom
 * Westmans saknades i poolen (rigday 12 dagar bort filtrerades bort).
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from '../actualStaffDayModel';
import type { PlaceVisit, KnownSite } from '../pingPlaceSegments';

const visit = (centre: { lat: number; lng: number }, startIso: string, endIso: string): PlaceVisit => ({
  placeKey: 'unknown:0',
  knownSite: null,
  centre,
  start: startIso,
  end: endIso,
  durationMin: Math.round((+new Date(endIso) - +new Date(startIso)) / 60_000),
  pingCount: 10,
  pings: [],
});

const baseInput = (overrides: Partial<BuildActualStaffDayInput> = {}): BuildActualStaffDayInput => ({
  date: '2026-05-06',
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
  now: new Date('2026-05-06T15:00:00Z'),
  ...overrides,
});

describe('findNearestSite — Skokloster regression', () => {
  const westmans: KnownSite = {
    id: 'booking:westmans',
    name: 'Westmans Uthyrning',
    lat: 59.703171,
    lng: 17.62119,
    radiusMeters: 200,
    autoLoginEligible: false, // visit 6/5, rigday 18/5 → utanför ±2d
    daysFromActiveWindow: 10,
    activeWindowLabel: 'Rig 18/5 – Rigdown 31/5',
  };
  const gameFair: KnownSite = {
    id: 'large:gamefair',
    name: 'Swedish game fair',
    lat: 59.6475864072468,
    lng: 17.717899212919,
    radiusMeters: 210,
    autoLoginEligible: false,
    daysFromActiveWindow: 9,
    activeWindowLabel: 'Rig 15/5 – Rigdown 7/6',
  };

  it('väljer Westmans (0 m) framför Swedish Game Fair (~7 km) när bägge finns i poolen', () => {
    const m = buildActualStaffDayModel(baseInput({
      visits: [visit({ lat: 59.703171, lng: 17.62119 }, '2026-05-06T08:13:00Z', '2026-05-06T09:14:00Z')],
      knownSites: [gameFair, westmans], // ordningen ska inte spela roll
    }));
    const v = m.actualVisits[0];
    expect(v.nearestKnownSite?.id).toBe('booking:westmans');
    expect(v.nearestKnownSite?.distanceMeters).toBeLessThan(50);
    expect(v.candidatesWithinRadius?.map(c => c.id)).toEqual(['booking:westmans']);
  });

  it('flaggar inte Westmans som autoLoginEligible utanför ±2d-fönstret', () => {
    const m = buildActualStaffDayModel(baseInput({
      visits: [visit({ lat: 59.703171, lng: 17.62119 }, '2026-05-06T08:13:00Z', '2026-05-06T09:14:00Z')],
      knownSites: [westmans],
    }));
    expect(m.actualVisits[0].nearestKnownSite?.autoLoginEligible).toBe(false);
    expect(m.actualVisits[0].nearestKnownSite?.activeWindowLabel).toContain('Rig 18/5');
  });

  it('flera projekt på samma adress → båda i candidatesWithinRadius', () => {
    const twin: KnownSite = { ...westmans, id: 'booking:westmans-twin', name: 'Annan bokning' };
    const m = buildActualStaffDayModel(baseInput({
      visits: [visit({ lat: 59.703171, lng: 17.62119 }, '2026-05-06T08:13:00Z', '2026-05-06T09:14:00Z')],
      knownSites: [westmans, twin, gameFair],
    }));
    expect(m.actualVisits[0].candidatesWithinRadius?.length).toBe(2);
  });
});
