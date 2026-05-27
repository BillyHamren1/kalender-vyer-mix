/**
 * Contract test for src/services/locationBatchCompressor.ts
 *
 * Locks the rules som hindrar GPS-DDoS mot vår egen Supabase:
 *   1. Stillastående (≤50m mellan punkter) → mest första + sista
 *   2. Lång stay → heartbeat ungefär var 10 min
 *   3. Rörelse → representant var ~5 min + start/slut
 *   4. Användardrivna källor (manual/foreground/geofence) behålls alltid
 *   5. Tomt input → tomt output
 */
import { describe, it, expect } from 'vitest';
import {
  compressLocationBatch,
  type CompressInput,
} from '@/services/locationBatchCompressor';

function mk(
  i: number,
  lat: number,
  lng: number,
  offsetMs: number,
  source = 'background',
): CompressInput {
  return {
    id: `p${i}`,
    recordedAt: new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + offsetMs).toISOString(),
    latitude: lat,
    longitude: lng,
    accuracy: 10,
    speed: 0,
    source,
  };
}

describe('locationBatchCompressor', () => {
  it('komprimerar stillastående 2h → max några få punkter (start + slut + ~10-min heartbeat)', () => {
    // 120 punkter, en per minut, alla inom 5m från ankaret
    const points: CompressInput[] = [];
    for (let i = 0; i < 120; i++) {
      points.push(mk(i, 59.3300, 18.0600, i * 60_000));
    }
    const res = compressLocationBatch(points);

    // Bör vara ungefär: start + slut + heartbeat var ~10 min ≈ ≤ 14 punkter
    expect(res.stats.outputCount).toBeLessThanOrEqual(15);
    expect(res.stats.outputCount).toBeGreaterThanOrEqual(2);
    expect(res.coveredIds.size).toBe(120);
    expect(res.stats.stayGroups).toBeGreaterThanOrEqual(1);
  });

  it('rörelse 45 min → representant ungefär var 5 min', () => {
    // 45 punkter, en per minut, ~150m mellan varje (resa)
    const points: CompressInput[] = [];
    for (let i = 0; i < 45; i++) {
      // ~150m per minut i lat-led (~6 km/h promenad)
      points.push(mk(i, 59.3300 + i * 0.00135, 18.0600, i * 60_000));
    }
    const res = compressLocationBatch(points);

    // Ungefär 9–12 punkter (start, slut, var 5:e min, ev. stora hopp)
    expect(res.stats.outputCount).toBeLessThanOrEqual(15);
    expect(res.stats.outputCount).toBeGreaterThanOrEqual(5);
    expect(res.stats.moveGroups).toBeGreaterThanOrEqual(1);
  });

  it('användardrivna källor (manual/foreground/geofence) behålls alltid', () => {
    const points = [
      mk(0, 59.33, 18.06, 0, 'manual'),
      mk(1, 59.33, 18.06, 60_000, 'background'),
      mk(2, 59.33, 18.06, 120_000, 'foreground'),
      mk(3, 59.33, 18.06, 180_000, 'background'),
      mk(4, 59.33, 18.06, 240_000, 'geofence'),
    ];
    const res = compressLocationBatch(points);
    expect(res.selectedIds.has('p0')).toBe(true);
    expect(res.selectedIds.has('p2')).toBe(true);
    expect(res.selectedIds.has('p4')).toBe(true);
  });

  it('tomt input ger tomt output', () => {
    const res = compressLocationBatch([]);
    expect(res.stats.inputCount).toBe(0);
    expect(res.selectedIds.size).toBe(0);
    expect(res.coveredIds.size).toBe(0);
  });

  it('alla covered ids täcks även när bara ett urval skickas', () => {
    const points: CompressInput[] = [];
    for (let i = 0; i < 30; i++) {
      points.push(mk(i, 59.3300, 18.0600, i * 60_000));
    }
    const res = compressLocationBatch(points);
    expect(res.coveredIds.size).toBe(30);
    // Komprimering ska faktiskt minska antalet skickade punkter
    expect(res.stats.outputCount).toBeLessThan(30);
  });
});
