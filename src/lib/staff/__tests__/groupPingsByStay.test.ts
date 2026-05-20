import { describe, it, expect } from 'vitest';
import { groupPingsByStay } from '../groupPingsByStay';

const mk = (iso: string, lat: number, lng: number) => ({ recorded_at: iso, lat, lng });

describe('groupPingsByStay', () => {
  it('returns [] for empty', () => {
    expect(groupPingsByStay([])).toEqual([]);
  });

  it('keeps moving pings as individual point markers', () => {
    // ~1km apart each step → never same stay
    const pings = [
      mk('2026-05-20T09:00:00Z', 59.0, 17.0),
      mk('2026-05-20T09:05:00Z', 59.01, 17.0),
      mk('2026-05-20T09:10:00Z', 59.02, 17.0),
    ];
    const out = groupPingsByStay(pings);
    expect(out).toHaveLength(3);
    out.forEach((m) => expect(m.kind).toBe('point'));
  });

  it('collapses 30 min at same spot into one stay marker', () => {
    const pings = [
      mk('2026-05-20T09:00:00Z', 59.5, 17.5),
      mk('2026-05-20T09:05:00Z', 59.50001, 17.50001),
      mk('2026-05-20T09:15:00Z', 59.50002, 17.50001),
      mk('2026-05-20T09:25:00Z', 59.5, 17.5),
      mk('2026-05-20T09:30:00Z', 59.50001, 17.5),
    ];
    const out = groupPingsByStay(pings);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('stay');
    if (out[0].kind === 'stay') {
      expect(out[0].startIso).toBe('2026-05-20T09:00:00Z');
      expect(out[0].endIso).toBe('2026-05-20T09:30:00Z');
      expect(out[0].durationMs).toBe(30 * 60 * 1000);
      expect(out[0].pings).toHaveLength(5);
    }
  });

  it('does NOT collapse a short 10 min stay (default min 20 min)', () => {
    const pings = [
      mk('2026-05-20T09:00:00Z', 59.5, 17.5),
      mk('2026-05-20T09:05:00Z', 59.50001, 17.5),
      mk('2026-05-20T09:10:00Z', 59.5, 17.50001),
    ];
    const out = groupPingsByStay(pings);
    expect(out).toHaveLength(3);
    out.forEach((m) => expect(m.kind).toBe('point'));
  });

  it('mixed: stay → move → stay produces stay + points + stay', () => {
    const pings = [
      // stay A 09:00–09:30
      mk('2026-05-20T09:00:00Z', 59.5, 17.5),
      mk('2026-05-20T09:15:00Z', 59.50001, 17.5),
      mk('2026-05-20T09:30:00Z', 59.5, 17.50001),
      // transit
      mk('2026-05-20T09:45:00Z', 59.55, 17.55),
      mk('2026-05-20T10:00:00Z', 59.6, 17.6),
      // stay B 10:15–10:50
      mk('2026-05-20T10:15:00Z', 59.65, 17.65),
      mk('2026-05-20T10:30:00Z', 59.65001, 17.65),
      mk('2026-05-20T10:50:00Z', 59.65, 17.65001),
    ];
    const out = groupPingsByStay(pings);
    const kinds = out.map((m) => m.kind);
    expect(kinds).toEqual(['stay', 'point', 'point', 'stay']);
  });
});
