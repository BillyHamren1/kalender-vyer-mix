// @vitest-environment node
/**
 * Locks the warehouse → lunch → Westers scenario described by the user.
 *
 * The bug being prevented: when a staff member moves between three places
 * during the day, the old `resolvePlaceAt` could return Westers for a timer
 * that started BEFORE the user actually arrived there — because the
 * tolerance fallback snapped to the nearest visit.
 *
 * The new `buildDayTimeline` returns:
 *   - 'visit'   when the timestamp is inside a real visit
 *   - 'travel'  when it falls between two visits (with from/to and pings)
 *   - 'unknown' otherwise (no silent guessing)
 */
import { describe, it, expect } from 'vitest';
import {
  buildPlaceVisits,
  buildDayTimeline,
  type KnownSite,
} from '../pingPlaceSegments';
import type { Ping } from '../movementDetection';

const FA: KnownSite = {
  id: 'fa', name: 'FA Warehouse',
  lat: 59.4914494330173, lng: 17.8553564370097,
  radiusMeters: 200,
};
const KONSUM: KnownSite = {
  id: 'k', name: 'Konsumentvägen Sollentuna',
  lat: 59.4280, lng: 17.9510,
  radiusMeters: 200,
};
const WESTERS: KnownSite = {
  id: 'w', name: 'Westers Catering',
  lat: 59.3380, lng: 17.9810,
  radiusMeters: 200,
};

const at = (offsetMin: number, lat: number, lng: number): Ping => ({
  lat, lng,
  recorded_at: new Date(Date.UTC(2026, 4, 3, 6, 0, 0) + offsetMin * 60_000).toISOString(),
  accuracy: 5,
});

describe('buildDayTimeline — warehouse → lunch → Westers', () => {
  // 06:00–11:00 FA Warehouse, 12:10–13:00 Konsumentvägen, 14:00–17:00 Westers.
  const pings: Ping[] = [];
  for (let i = 0; i < 60 * 5; i += 5) pings.push(at(i, FA.lat, FA.lng));               // 06:00–11:00
  // travel gap 11:00→12:10 (no pings)
  for (let i = 60 * 6 + 10; i < 60 * 7; i += 5) pings.push(at(i, KONSUM.lat, KONSUM.lng)); // 12:10–13:00
  // travel gap with two roadside pings 13:30 + 13:50
  pings.push(at(60 * 7 + 30, 59.38, 17.97));
  pings.push(at(60 * 7 + 50, 59.35, 17.98));
  for (let i = 60 * 8; i < 60 * 11; i += 5) pings.push(at(i, WESTERS.lat, WESTERS.lng));    // 14:00–17:00

  const visits = buildPlaceVisits(pings, [FA, KONSUM, WESTERS], { minDurationMin: 5 });
  const tl = buildDayTimeline(pings, visits);

  it('producerar tre vistelser i rätt ordning', () => {
    expect(visits.map(v => v.knownSite?.id)).toEqual(['fa', 'k', 'w']);
  });

  it('producerar två förflyttningar mellan dem', () => {
    expect(tl.travels).toHaveLength(2);
    expect(tl.travels[0].from.knownSite?.id).toBe('fa');
    expect(tl.travels[0].to.knownSite?.id).toBe('k');
    expect(tl.travels[1].from.knownSite?.id).toBe('k');
    expect(tl.travels[1].to.knownSite?.id).toBe('w');
  });

  it('andra förflyttningen plockar upp roadside-pings', () => {
    expect(tl.travels[1].pings.length).toBeGreaterThanOrEqual(2);
  });

  it('en timer som startas 13:30 (mitt i resa Konsum→Westers) returnerar travel — inte Westers', () => {
    const iso = new Date(Date.UTC(2026, 4, 3, 6, 0, 0) + (60 * 7 + 30) * 60_000).toISOString();
    const hit = tl.resolveAt(iso);
    expect(hit.kind).toBe('travel');
    if (hit.kind === 'travel') {
      expect(hit.travel.from.knownSite?.id).toBe('k');
      expect(hit.travel.to.knownSite?.id).toBe('w');
    }
  });

  it('en timer 11:30 (mellan FA och Konsum, utan ping) returnerar travel — inte närmaste vistelse', () => {
    const iso = new Date(Date.UTC(2026, 4, 3, 6, 0, 0) + (60 * 5 + 30) * 60_000).toISOString();
    const hit = tl.resolveAt(iso);
    expect(hit.kind).toBe('travel');
  });

  it('en timer 06:30 (inne på FA) returnerar visit fa', () => {
    const iso = new Date(Date.UTC(2026, 4, 3, 6, 0, 0) + 30 * 60_000).toISOString();
    const hit = tl.resolveAt(iso);
    expect(hit.kind).toBe('visit');
    if (hit.kind === 'visit') expect(hit.visit.knownSite?.id).toBe('fa');
  });

  it('en timer 23:00 (utanför pingfönstret) returnerar unknown — ingen falsk gissning', () => {
    const iso = new Date(Date.UTC(2026, 4, 3, 23, 0, 0)).toISOString();
    const hit = tl.resolveAt(iso);
    expect(hit.kind).toBe('unknown');
  });

  it('Konsumentvägen är en egen vistelse — inte en del av FA Warehouse', () => {
    const konsum = visits.find(v => v.knownSite?.id === 'k');
    expect(konsum).toBeDefined();
    expect(konsum!.pingCount).toBeGreaterThan(0);
  });

  it('Westers visas inte förrän första riktiga ping på Westers (14:00)', () => {
    const westers = visits.find(v => v.knownSite?.id === 'w');
    expect(westers).toBeDefined();
    const startMin = (new Date(westers!.start).getTime() - Date.UTC(2026, 4, 3, 6, 0, 0)) / 60_000;
    expect(startMin).toBeGreaterThanOrEqual(60 * 8); // ≥14:00
  });
});

describe('buildDayTimeline — edge cases', () => {
  it('inga visits → inga travels', () => {
    const tl = buildDayTimeline([], []);
    expect(tl.travels).toEqual([]);
    expect(tl.resolveAt(new Date().toISOString()).kind).toBe('unknown');
  });

  it('en enda visit → inga travels', () => {
    const pings: Ping[] = [];
    for (let i = 0; i < 60; i++) pings.push(at(i, FA.lat, FA.lng));
    const visits = buildPlaceVisits(pings, [FA]);
    const tl = buildDayTimeline(pings, visits);
    expect(tl.travels).toEqual([]);
  });

  it('null iso → unknown', () => {
    const tl = buildDayTimeline([], []);
    expect(tl.resolveAt(null).kind).toBe('unknown');
  });
});
