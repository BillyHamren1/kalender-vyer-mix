import { describe, it, expect } from 'vitest';
import { downsamplePingsByBucket } from '../downsamplePingsByBucket';

const mk = (iso: string, accuracy: number | null) => ({ recorded_at: iso, accuracy });

describe('downsamplePingsByBucket', () => {
  it('returns [] for empty input', () => {
    expect(downsamplePingsByBucket([])).toEqual([]);
  });

  it('keeps pings already sparser than 5 min unchanged', () => {
    const input = [
      mk('2026-05-20T09:00:00Z', 10),
      mk('2026-05-20T09:06:00Z', 10),
      mk('2026-05-20T09:12:00Z', 10),
    ];
    const out = downsamplePingsByBucket(input);
    expect(out).toHaveLength(3);
  });

  it('collapses 12 pings over 30 min into 6 buckets, picking best accuracy', () => {
    const input: Array<{ recorded_at: string; accuracy: number | null }> = [];
    // 12 pings every ~2.5 min for 30 min, varying accuracy
    for (let i = 0; i < 12; i++) {
      const t = new Date(Date.UTC(2026, 4, 20, 9, 0, 0) + i * 150_000).toISOString();
      input.push(mk(t, (i % 4) * 10 + 5)); // accuracies 5,15,25,35,5,15,...
    }
    const out = downsamplePingsByBucket(input);
    expect(out).toHaveLength(6);
    // every bucket should contain the BEST (lowest) accuracy among its pings
    // pattern repeats every 4 (5,15,25,35), 2 pings per 5-min bucket →
    // bucket mins are 5, 25, 5, 25, 5, 25
    expect(out.map((p) => p.accuracy)).toEqual([5, 25, 5, 25, 5, 25]);

  it('5-min boundary: 09:05:00 belongs to the 09:05 bucket', () => {
    const input = [mk('2026-05-20T09:04:59.000Z', 30), mk('2026-05-20T09:05:00.000Z', 10)];
    const out = downsamplePingsByBucket(input);
    expect(out).toHaveLength(2);
    expect(out[0].recorded_at).toBe('2026-05-20T09:04:59.000Z');
    expect(out[1].recorded_at).toBe('2026-05-20T09:05:00.000Z');
  });

  it('handles null accuracy gracefully (still picks one per bucket)', () => {
    const input = [
      mk('2026-05-20T09:00:10Z', null),
      mk('2026-05-20T09:01:00Z', null),
      mk('2026-05-20T09:02:00Z', 25),
    ];
    const out = downsamplePingsByBucket(input);
    expect(out).toHaveLength(1);
    expect(out[0].accuracy).toBe(25);
  });
});
