/**
 * Acceptance: confirmed-worksite-only auto-start för arbetsdag.
 *
 * Endast bekräftad arbetsplatsnärvaro får starta/tidigarelägga arbetsdagen.
 * Okänd plats, hem och bakgrund får ALDRIG göra det.
 *
 * Scenarier:
 *   A) Tiomila 2026 07:55 + Mjölbyvägen okänd 12:04 + Tiomila 12:48 +
 *      workday.started_at = 11:16 → workday justeras till 07:55, Mjölbyvägen
 *      visas som okänd vistelse inom dagen och påverkar inte starten.
 *   B) Bara okänd adress 07:55–08:30 + workday 09:00 → ingen justering.
 *   C) Hem/privat 07:55–08:30 + workday 09:00 → ingen justering.
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from '../actualStaffDayModel';
import {
  isConfirmedWorksiteVisit,
  isConfirmedSiteId,
} from '../isConfirmedWorksitePresence';
import type { PlaceVisit } from '../pingPlaceSegments';

const date = '2026-05-05';
const TIOMILA = { id: 'site-tiomila', name: 'Tiomila 2026', lat: 58.50, lng: 15.20, radiusMeters: 200 };

const knownVisit = (start: string, end: string): PlaceVisit => ({
  placeKey: `site:${TIOMILA.id}`,
  knownSite: { id: TIOMILA.id, name: TIOMILA.name },
  centre: { lat: TIOMILA.lat, lng: TIOMILA.lng },
  start: `${date}T${start}:00Z`,
  end: `${date}T${end}:00Z`,
  durationMin: 60,
  pingCount: 20,
  pings: [],
});

const unknownVisit = (start: string, end: string): PlaceVisit => ({
  placeKey: `unknown:mjolby`,
  knownSite: null,
  centre: { lat: 58.32, lng: 15.13 }, // ~20km från TIOMILA → inte 'work_possible'
  start: `${date}T${start}:00Z`,
  end: `${date}T${end}:00Z`,
  durationMin: 41,
  pingCount: 8,
  pings: [],
});

const homeVisit = (start: string, end: string): PlaceVisit => ({
  placeKey: `home:s1`,
  knownSite: null,
  centre: { lat: 58.10, lng: 15.00 },
  start: `${date}T${start}:00Z`,
  end: `${date}T${end}:00Z`,
  durationMin: 35,
  pingCount: 6,
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
  knownSites: [TIOMILA],
  privateZones: [],
  plannedAssignments: [],
  now: new Date(`${date}T20:00:00Z`),
  ...over,
});

describe('Confirmed-worksite-only auto-start för workday', () => {
  it('helper accepterar bara id-prefix för bekräftade arbetsplatser', () => {
    expect(isConfirmedSiteId('booking:abc')).toBe(true);
    expect(isConfirmedSiteId('large:xyz')).toBe(true);
    expect(isConfirmedSiteId('warehouse:1')).toBe(true);
    expect(isConfirmedSiteId('location:42')).toBe(true);
    expect(isConfirmedSiteId(null)).toBe(false);
    expect(isConfirmedSiteId('unknown:mjolby')).toBe(false);
  });

  it('helper visit: known_site work_confirmed → true; okänd → false', () => {
    expect(isConfirmedWorksiteVisit({
      knownSiteId: 'booking:abc', workRelevance: 'work_confirmed',
    })).toBe(true);
    expect(isConfirmedWorksiteVisit({
      knownSiteId: null, workRelevance: 'work_possible',
    })).toBe(false);
    expect(isConfirmedWorksiteVisit({
      knownSiteId: null, workRelevance: 'unknown_requires_lookup',
    })).toBe(false);
    expect(isConfirmedWorksiteVisit({
      knownSiteId: 'home:1', workRelevance: 'private_or_background',
      privateZone: { kind: 'home' },
    })).toBe(false);
  });

  it('Scenario A: Tiomila 07:55 + Mjölby okänd 12:04 + Tiomila 12:48 + workday 11:16 → start justeras till 07:55', () => {
    const tio1 = knownVisit('07:55', '12:01');
    const mjolby = unknownVisit('12:04', '12:45');
    const tio2 = knownVisit('12:48', '17:44');
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'wd1', started_at: `${date}T11:16:00Z`, ended_at: null } as any,
      visits: [tio1, mjolby, tio2],
      // Hård evidens: time_report som överlappar pre-workday-fönstret
      timeReports: [{
        id: 'tr1',
        start_iso: `${date}T07:55:00Z`,
        end_iso: `${date}T12:01:00Z`,
        hours: 4.1,
        booking_id: 'tio-booking',
        project_id: null,
      } as any],
    }));

    expect(m.proposedReport.proposedWorkdayStart).toBe(`${date}T07:55:00Z`);
    // Mjölbyvägen ska INTE påverka workday-starten
    expect(m.proposedReport.proposedWorkdayStart).not.toBe(`${date}T12:04:00Z`);
  });

  it('Scenario B: bara okänd adress före workday → ingen justering', () => {
    const unk = unknownVisit('07:55', '08:30');
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'wd1', started_at: `${date}T09:00:00Z`, ended_at: null } as any,
      visits: [unk],
    }));

    expect(m.proposedReport.proposedWorkdayStart).toBe(`${date}T09:00:00Z`);
  });

  it('Scenario C: privat/hemma-visit före workday → ingen justering', () => {
    const home = homeVisit('07:55', '08:30');
    const m = buildActualStaffDayModel(baseInput({
      workday: { id: 'wd1', started_at: `${date}T09:00:00Z`, ended_at: null } as any,
      visits: [home],
      privateZones: [{
        id: 'pz1',
        kind: 'home',
        centre: { lat: 58.10, lng: 15.00 },
        radiusMeters: 200,
      } as any],
    }));

    expect(m.proposedReport.proposedWorkdayStart).toBe(`${date}T09:00:00Z`);
  });
});
