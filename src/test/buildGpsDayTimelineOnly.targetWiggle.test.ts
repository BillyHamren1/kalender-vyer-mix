import { describe, it, expect } from 'vitest';
import { buildGpsDayTimelineOnly } from '../../supabase/functions/_shared/timeline/buildGpsDayTimelineOnly.ts';

/**
 * Kontrakt: när pings ligger inom samma target-geofence ska algoritmen INTE
 * producera ett "transport"-segment + "gps_gap" bara för att personen rör sig
 * 100–200 m inom worksiten. Det ska bli ETT stay-segment på targeten.
 *
 * Reproducerar exakt skärmdumpen: 9 pings runt 59.330 / 18.07, alla inom
 * en projekt-target med 800 m radie. Tidsspann ~01:40 totalt med ett 95-min
 * "glapp" som ska absorberas eftersom båda sidor är samma target.
 */
describe('buildGpsDayTimelineOnly — target wiggle', () => {
  const project = {
    id: 'proj-1',
    type: 'project' as const,
    name: 'Mässhallen',
    lat: 59.33061,
    lng: 18.07,
    radiusM: 800,
  };

  const pings = [
    { recorded_at: '2026-05-17T20:25:01Z', lat: 59.33061, lng: 18.07398, accuracy: 35 },
    { recorded_at: '2026-05-17T21:59:44Z', lat: 59.32973, lng: 18.07354, accuracy: 14 },
    { recorded_at: '2026-05-17T22:00:19Z', lat: 59.32932, lng: 18.06818, accuracy: 14 },
    { recorded_at: '2026-05-17T22:00:55Z', lat: 59.33016, lng: 18.06722, accuracy: 8 },
    { recorded_at: '2026-05-17T22:01:34Z', lat: 59.33158, lng: 18.06664, accuracy: 26 },
    { recorded_at: '2026-05-17T22:02:18Z', lat: 59.33193, lng: 18.06620, accuracy: 15 },
    { recorded_at: '2026-05-17T22:02:53Z', lat: 59.33078, lng: 18.06501, accuracy: 17 },
    { recorded_at: '2026-05-17T22:03:46Z', lat: 59.33071, lng: 18.06076, accuracy: 16 },
    { recorded_at: '2026-05-17T22:04:30Z', lat: 59.33116, lng: 18.05881, accuracy: 9 },
  ];

  it('inga transport- eller gps_gap-segment när alla pings ligger inom samma target', () => {
    const out = buildGpsDayTimelineOnly({
      staffId: 's1',
      organizationId: 'o1',
      date: '2026-05-17',
      pings,
      knownTargets: [project],
    });
    const transports = out.segments.filter((s: any) => s.kind === 'travel' && s.type === 'transport');
    const gaps = out.segments.filter((s: any) => s.kind === 'gps_gap');
    expect(transports, JSON.stringify(transports, null, 2)).toHaveLength(0);
    expect(gaps, JSON.stringify(gaps, null, 2)).toHaveLength(0);
  });

  it('producerar minst ett stay-segment på targeten', () => {
    const out = buildGpsDayTimelineOnly({
      staffId: 's1',
      organizationId: 'o1',
      date: '2026-05-17',
      pings,
      knownTargets: [project],
    });
    const targetStays = out.segments.filter(
      (s: any) => s.kind === 'stay' && s.matchedSiteId === 'proj-1',
    );
    expect(targetStays.length).toBeGreaterThanOrEqual(1);
  });

  it('producerar fortfarande transport när pings faktiskt är utanför target', () => {
    const farProject = { ...project, lat: 60.0, lng: 18.0, radiusM: 200 };
    const out = buildGpsDayTimelineOnly({
      staffId: 's1',
      organizationId: 'o1',
      date: '2026-05-17',
      pings,
      knownTargets: [farProject],
    });
    const transports = out.segments.filter((s: any) => s.kind === 'travel' && s.type === 'transport');
    expect(transports.length).toBeGreaterThanOrEqual(1);
  });

  it('hem-target (type=home) blir ALDRIG ett known_site stay — hem är inte arbete', () => {
    const home = {
      id: 'home:billy',
      type: 'home' as const,
      name: 'Hemma',
      lat: 59.33061,
      lng: 18.07,
      radiusM: 500,
    };
    // Två pings strax efter midnatt nära hemmet — exakt Billys scenario.
    const nightPings = [
      { recorded_at: '2026-05-18T00:28:00Z', lat: 59.33061, lng: 18.07005, accuracy: 20 },
      { recorded_at: '2026-05-18T00:29:00Z', lat: 59.33062, lng: 18.07006, accuracy: 20 },
    ];
    const out = buildGpsDayTimelineOnly({
      staffId: 'billy',
      organizationId: 'o1',
      date: '2026-05-18',
      pings: nightPings,
      knownTargets: [home],
    });
    const knownSiteStays = out.segments.filter(
      (s: any) => s.kind === 'stay' && s.type === 'known_site',
    );
    expect(knownSiteStays, JSON.stringify(knownSiteStays, null, 2)).toHaveLength(0);
  });
});
