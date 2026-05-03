// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildPlaceVisits, resolvePlaceAt, type KnownSite } from '../pingPlaceSegments';
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

  it('två Warehouse-besök med långt pingglapp slås inte ihop till en heldagsvistelse', () => {
    const pings: Ping[] = [];
    for (let i = 0; i < 10; i++) pings.push(at(i, FA.lat, FA.lng));
    for (let i = 40; i < 50; i++) pings.push(at(i, FA.lat, FA.lng));

    const visits = buildPlaceVisits(pings, [FA], { minDurationMin: 1, maxPingGapMin: 20 });

    expect(visits).toHaveLength(2);
    expect(visits[0].knownSite?.id).toBe('fa');
    expect(visits[1].knownSite?.id).toBe('fa');
    expect(visits[0].end).toBe(pings[9].recorded_at);
    expect(visits[1].start).toBe(pings[10].recorded_at);
  });
});

describe('resolvePlaceAt', () => {
  // Bygg en dag: 03:00–04:00 FA Warehouse, 05:00–08:00 okänd plats, 09:00–10:00 FA igen.
  const pings: Ping[] = [];
  for (let i = 0; i < 60; i++) pings.push(at(i, FA.lat, FA.lng));
  for (let i = 120; i < 300; i += 5) pings.push(at(i, 59.2947, 18.0796));
  for (let i = 360; i < 420; i++) pings.push(at(i, FA.lat, FA.lng));
  const visits = buildPlaceVisits(pings, [FA], { minDurationMin: 5 });

  it('iso mitt i en känd vistelse mappar till knownSite (inte Mapbox-text)', () => {
    const mid = new Date(Date.UTC(2026, 4, 3, 3, 30, 0)).toISOString();
    const v = resolvePlaceAt(visits, mid);
    expect(v?.knownSite?.id).toBe('fa');
  });

  it('iso vid exakt start/end matchar samma vistelse', () => {
    expect(resolvePlaceAt(visits, visits[0].start)?.knownSite?.id).toBe('fa');
    expect(resolvePlaceAt(visits, visits[0].end)?.knownSite?.id).toBe('fa');
  });

  it('iso i ett gap faller tillbaka till närmsta inom toleransen', () => {
    // Mellan vistelse 1 (slutar ~03:59) och vistelse 2 (start ~05:00) — fråga 04:05.
    const inGap = new Date(Date.UTC(2026, 4, 3, 4, 5, 0)).toISOString();
    const v = resolvePlaceAt(visits, inGap, 15);
    expect(v?.knownSite?.id).toBe('fa'); // närmsta är FA-vistelsen som slutade kl 03:59
  });

  it('iso helt utanför pingfönstret returnerar null', () => {
    const wayOff = new Date(Date.UTC(2026, 4, 3, 23, 0, 0)).toISOString();
    expect(resolvePlaceAt(visits, wayOff)).toBeNull();
  });
});

describe('PlaceVisit.pings exact membership', () => {
  const FA: KnownSite = { id: 'fa', name: 'Fixed A', lat: 59.3, lng: 18.0, radiusMeters: 80 };
  const FB: KnownSite = { id: 'fb', name: 'Fixed B', lat: 59.5, lng: 18.2, radiusMeters: 80 };

  function pingAt(lat: number, lng: number, isoMin: number) {
    return {
      lat, lng, accuracy: 10,
      recorded_at: new Date(Date.UTC(2026, 4, 3, 8, isoMin, 0)).toISOString(),
    };
  }

  it('pings.length === pingCount and centre is close to every ping', () => {
    const pings = [
      ...Array.from({ length: 6 }, (_, i) => pingAt(FA.lat, FA.lng, i * 5)),
      ...Array.from({ length: 6 }, (_, i) => pingAt(FB.lat, FB.lng, 60 + i * 5)),
    ];
    const visits = buildPlaceVisits(pings, [FA, FB], { minDurationMin: 1 });
    expect(visits.length).toBeGreaterThanOrEqual(2);
    for (const v of visits) {
      expect(v.pings.length).toBe(v.pingCount);
      // Each ping must be reasonably near visit.centre (no 20km mismatches).
      for (const p of v.pings) {
        const dx = Math.abs(p.lat - v.centre.lat) + Math.abs(p.lng - v.centre.lng);
        expect(dx).toBeLessThan(0.05); // <~5km in degrees, plenty of margin
      }
    }
  });

  it('merged visits keep all pings without duplication and chronological', () => {
    const pings = [
      ...Array.from({ length: 4 }, (_, i) => pingAt(FA.lat, FA.lng, i * 2)),
      // tiny gap, same place — should merge
      ...Array.from({ length: 4 }, (_, i) => pingAt(FA.lat, FA.lng, 12 + i * 2)),
    ];
    const visits = buildPlaceVisits(pings, [FA], { minDurationMin: 1, maxPingGapMin: 20 });
    expect(visits.length).toBe(1);
    expect(visits[0].pings.length).toBe(8);
    const stamps = visits[0].pings.map(p => new Date(p.recorded_at).getTime());
    const sorted = [...stamps].sort((a, b) => a - b);
    expect(stamps).toEqual(sorted);
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
