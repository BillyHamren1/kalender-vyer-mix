import { describe, it, expect } from 'vitest';
import { pickPingsByGlobalInterval, segmentPingsForDisplay } from '../segmentPingsForDisplay';

interface P {
  id: string;
  recorded_at: string;
  lat: number;
  lng: number;
}

function mk(id: string, minutesFromZero: number, lat: number, lng: number): P {
  const t = new Date(Date.UTC(2026, 0, 1, 8, 0, 0) + minutesFromZero * 60_000).toISOString();
  return { id, recorded_at: t, lat, lng };
}

describe('segmentPingsForDisplay', () => {
  it('returnerar [] för tomt input', () => {
    expect(segmentPingsForDisplay([])).toEqual([]);
  });

  it('rör sig hela tiden → ett move-segment, alla pings kvar', () => {
    const pings: P[] = [];
    for (let i = 0; i < 10; i++) {
      pings.push(mk(`p${i}`, i, 59.0 + i * 0.01, 18.0 + i * 0.01));
    }
    const segs = segmentPingsForDisplay(pings);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('move');
    if (segs[0].kind === 'move') {
      expect(segs[0].pings).toHaveLength(10);
    }
  });

  it('stillastående >= 5 min på samma punkt → ett stay-segment', () => {
    const pings: P[] = [];
    for (let i = 0; i < 7; i++) {
      pings.push(mk(`p${i}`, i, 59.0, 18.0)); // exakt samma punkt
    }
    const segs = segmentPingsForDisplay(pings);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('stay');
    if (segs[0].kind === 'stay') {
      expect(segs[0].pings).toHaveLength(7);
      expect(segs[0].lat).toBeCloseTo(59.0);
    }
  });

  it('move → stay → move ger tre segment med olika colorIndex', () => {
    const pings: P[] = [];
    // move 0-4 min
    for (let i = 0; i < 5; i++) pings.push(mk(`m1-${i}`, i, 59.0 + i * 0.01, 18.0 + i * 0.01));
    // stay 5-12 min på samma plats
    for (let i = 0; i < 8; i++) pings.push(mk(`s-${i}`, 5 + i, 59.05, 18.05));
    // move 13-17 min
    for (let i = 0; i < 5; i++) pings.push(mk(`m2-${i}`, 13 + i, 59.05 + i * 0.01, 18.05 + i * 0.01));
    const segs = segmentPingsForDisplay(pings);
    expect(segs.map((s) => s.kind)).toEqual(['move', 'stay', 'move']);
    // move-segment har egen trip-räknare: resa 1 = colorIndex 0, resa 2 = 1.
    const moves = segs.filter((s) => s.kind === 'move');
    expect(moves.map((s) => s.colorIndex)).toEqual([0, 1]);
    const total = segs.reduce((n, s) => n + s.pings.length, 0);
    expect(total).toBe(pings.length); // ingen ping försvinner
  });

  it('move-segment plockar label var ~5 min', () => {
    const pings: P[] = [];
    // 20 minuters resa, en ping per minut
    for (let i = 0; i < 21; i++) pings.push(mk(`p${i}`, i, 59.0 + i * 0.005, 18.0 + i * 0.005));
    const segs = segmentPingsForDisplay(pings, { labelEveryMs: 5 * 60_000 });
    expect(segs).toHaveLength(1);
    if (segs[0].kind === 'move') {
      // 0, 5, 10, 15, 20 → 5 labels
      expect(segs[0].labelPings.length).toBe(5);
    }
  });

  it('globalt 5-minutersfilter återstartar inte när resan delas i flera segment', () => {
    const pings: P[] = [
      mk('p0', 0, 59.0, 18.0),
      mk('p1', 1, 59.01, 18.01),
      mk('p2', 5, 59.05, 18.05),
      mk('p3', 6, 59.051, 18.051),
      mk('p4', 10, 59.10, 18.10),
      mk('p5', 11, 59.101, 18.101),
    ];

    const labels = pickPingsByGlobalInterval(pings, 5 * 60_000);
    expect(labels.map((p) => p.id)).toEqual(['p0', 'p2', 'p4']);
  });

  it('kort stopp <5 min smälter in i move-segmentet', () => {
    const pings: P[] = [];
    for (let i = 0; i < 5; i++) pings.push(mk(`a${i}`, i, 59.0 + i * 0.01, 18.0 + i * 0.01));
    // 3 minuters kort stopp
    for (let i = 0; i < 3; i++) pings.push(mk(`b${i}`, 5 + i, 59.05, 18.05));
    for (let i = 0; i < 5; i++) pings.push(mk(`c${i}`, 8 + i, 59.05 + i * 0.01, 18.05 + i * 0.01));
    const segs = segmentPingsForDisplay(pings);
    // Hela ska bli ett enda move-segment
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('move');
  });
});
