/**
 * Pure-logic tests for the inference cluster math. The full edge function
 * needs DB access, so we test the deterministic helpers separately.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const GRID_DEG = 0.001;

function snapKey(lat: number, lng: number) {
  const sLat = Math.round(lat / GRID_DEG) * GRID_DEG;
  const sLng = Math.round(lng / GRID_DEG) * GRID_DEG;
  return `${sLat.toFixed(4)}:${sLng.toFixed(4)}`;
}

Deno.test('snapKey is stable across nearby points (~50m drift)', () => {
  // ~50 m drift in latitude: 0.00045 deg
  const a = snapKey(59.32932, 18.06853);
  const b = snapKey(59.32935, 18.06856);
  assertEquals(a, b);
});

Deno.test('snapKey differentiates clusters > ~150m apart', () => {
  const a = snapKey(59.32900, 18.06800);
  const b = snapKey(59.33100, 18.07100);
  if (a === b) throw new Error('expected different cluster keys');
});

Deno.test('consecutive-night run detection', () => {
  // Mock the run-counting logic in the function: walking observations newest-first.
  const obs = [
    { date: '2026-04-20', key: 'A' },
    { date: '2026-04-19', key: 'A' },
    { date: '2026-04-18', key: 'A' },
    { date: '2026-04-17', key: 'B' },
  ];
  let prevDate: string | null = null;
  let prevKey: string | null = null;
  let runCount = 0;
  let bestA = 0;
  for (const o of obs) {
    if (prevKey === o.key && prevDate) {
      const diff = Math.round(
        (new Date(prevDate).getTime() - new Date(o.date).getTime()) / 86400000,
      );
      runCount = diff === 1 ? runCount + 1 : 1;
    } else {
      runCount = 1;
    }
    if (o.key === 'A' && runCount > bestA) bestA = runCount;
    prevDate = o.date;
    prevKey = o.key;
  }
  assertEquals(bestA, 3);
});
