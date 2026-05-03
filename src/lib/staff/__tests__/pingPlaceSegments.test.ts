// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildPlaceVisits, type KnownSite } from '../pingPlaceSegments';
import type { Ping } from '../movementDetection';

const FA: KnownSite = {
  id: 'fa', name: 'FA Warehouse',
  lat: 59.4914494330173, lng: 17.8553564370097,
  radiusMeters: 200,
};

const at = (offsetMin: number, lat: number, lng: number): Ping => ({
  lat, lng,
  recorded_at: new Date(Date.UTC(2026, 4, 3, 3, 0, 0) + offsetMin * 60_000).toISOString(),
  accuracy: 5,
});

describe('buildPlaceVisits', () => {
  it('hela dagen vid FA Warehouse blir EN känd vistelse', () => {
    const pings: Ping[] = [];
    for (let i = 0; i < 60; i++) {
      // Drift inom ~50m
      pings.push(at(i, FA.lat + 0.0003, FA.lng + 0.0001));
    }
    const visits = buildPlaceVisits(pings, [FA]);
    expect(visits).toHaveLength(1);
    expect(visits[0].knownSite?.id).toBe('fa');
    expect(visits[0].pingCount).toBe(60);
  });

  it('Väsby → Johanneshov → Väsby blir tre block med rätt IN/UT', () => {
    const pings: Ping[] = [];
    for (let i = 0; i < 20; i++) pings.push(at(i, FA.lat, FA.lng));
    // Drift mellan — vi simulerar inte hela resan, bara ankomst.
    for (let i = 30; i < 60; i++) pings.push(at(i, 59.2947, 18.0796));
    for (let i = 90; i < 110; i++) pings.push(at(i, FA.lat, FA.lng));
    const visits = buildPlaceVisits(pings, [FA], { minDurationMin: 5 });
    expect(visits.length).toBe(3);
    expect(visits[0].knownSite?.id).toBe('fa');
    expect(visits[1].knownSite).toBeNull();
    expect(visits[2].knownSite?.id).toBe('fa');
    // IN = första ping, UT = sista ping
    expect(visits[0].start).toBe(pings[0].recorded_at);
    expect(visits[2].end).toBe(pings[pings.length - 1].recorded_at);
  });

  it('enstaka GPS-spike bryter inte vistelsen', () => {
    const pings: Ping[] = [];
    for (let i = 0; i < 30; i++) pings.push(at(i, FA.lat, FA.lng));
    // En spike 1 km bort
    pings.push(at(15, FA.lat + 0.01, FA.lng + 0.01));
    pings.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const visits = buildPlaceVisits(pings, [FA]);
    expect(visits).toHaveLength(1);
    expect(visits[0].knownSite?.id).toBe('fa');
  });

  it('två separata okända områden slås inte ihop bara för att text matchar', () => {
    const pings: Ping[] = [];
    for (let i = 0; i < 20; i++) pings.push(at(i, 59.30, 18.07));
    for (let i = 30; i < 50; i++) pings.push(at(i, 59.40, 18.20));
    const visits = buildPlaceVisits(pings, []);
    expect(visits.length).toBe(2);
    expect(visits[0].placeKey).not.toBe(visits[1].placeKey);
  });
});
