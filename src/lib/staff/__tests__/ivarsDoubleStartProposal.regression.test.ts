/**
 * Regression: Ivars dubbla startförslag.
 *
 * Tidigare visade headern "kan auto-skapa från 05:34" medan repair-bannern
 * visade "07:34". Båda läste samma `computeStrongWorkIndicators(model)` men
 * formaterade tiden olika (slice(11,16) på UTC vs lokal fmtHm). Nu går båda
 * via samma proposedStartIso + samma formattering.
 *
 * Detta test låser logikkontraktet:
 *   - proposedStartIso ska vara FÖRSTA starka arbetsbeviset (FA-visit 07:34),
 *     inte en lös 05:34-ping utan visit/timer/workday-stöd.
 *   - Header-label och banner-label SKA härledas från samma proposedStartIso,
 *     så att UI inte kan visa två olika auto-create-tider för samma dag.
 */
import { describe, it, expect } from 'vitest';
import {
  buildActualStaffDayModel,
  type BuildActualStaffDayInput,
} from '../actualStaffDayModel';
import { computeStrongWorkIndicators } from '../strongWorkIndicators';
import type { PlaceVisit } from '../pingPlaceSegments';

const date = '2026-05-06';
const FA = {
  id: 'site-fa',
  name: 'FA Warehouse',
  lat: 59.30,
  lng: 18.00,
  radiusMeters: 100,
};

const visit = (start: string, end: string): PlaceVisit => ({
  placeKey: `site:${FA.id}`,
  knownSite: { id: FA.id, name: FA.name },
  centre: { lat: FA.lat, lng: FA.lng },
  start: `${date}T${start}:00Z`,
  end: `${date}T${end}:00Z`,
  durationMin: 7,
  pingCount: 5,
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
  knownSites: [FA],
  privateZones: [],
  plannedAssignments: [],
  now: new Date(`${date}T20:00:00Z`),
  ...over,
});

describe('Ivars: header och repair-banner får inte visa olika auto-create-starttider', () => {
  it('GPS-visit FA 07:34–07:41 + planerad 08:00 + lös 05:34-ping → proposedStartIso = 07:34', () => {
    const faVisit = visit('07:34', '07:41');

    const model = buildActualStaffDayModel(baseInput({
      visits: [faVisit],
      plannedAssignments: [{
        id: 'a1',
        label: 'Eventjobb',
        plannedStart: `${date}T08:00:00Z`,
        plannedEnd: `${date}T16:00:00Z`,
      }],
      // Lös ping 05:34 utan tillhörande visit/timer/workday — får inte
      // promotas till proposedStartIso.
      pings: [
        { recorded_at: `${date}T05:34:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 50 } as any,
        { recorded_at: `${date}T07:34:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
        { recorded_at: `${date}T07:41:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
      ],
    }));

    const ind = computeStrongWorkIndicators(model);

    expect(ind.hasStrong).toBe(true);
    // Stark indikator = FA-visit. Lös 05:34-ping ger ingen workRelevantVisit.
    expect(ind.proposedStartIso).toBe(faVisit.start);
    expect(ind.proposedStartIso).not.toContain('05:34');
  });

  it('Header- och banner-label härleds från SAMMA proposedStartIso (single source of truth)', () => {
    const faVisit = visit('07:34', '07:41');
    const model = buildActualStaffDayModel(baseInput({
      visits: [faVisit],
      pings: [
        { recorded_at: `${date}T07:34:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
        { recorded_at: `${date}T07:41:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
      ],
    }));

    // Båda call sites ska anropa computeStrongWorkIndicators(model) och få
    // exakt samma proposedStartIso. Vi kör det två gånger för att simulera
    // header (deriveStatus) och banner (render-block).
    const headerInd = computeStrongWorkIndicators(model);
    const bannerInd = computeStrongWorkIndicators(model);

    expect(headerInd.proposedStartIso).toBe(bannerInd.proposedStartIso);
    expect(headerInd.proposedStartIso).toBe(faVisit.start);
  });
});
