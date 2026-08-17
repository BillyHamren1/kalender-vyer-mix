import { describe, it, expect } from 'vitest';
import { toMap, containsNonJsonSafeData } from '@/lib/query/mapCache';

describe('persisterad Map-cache', () => {
  it('behåller ett riktigt Map', () => {
    const m = new Map([['a', 1]]);
    expect(toMap<number>(m)).toBe(m);
  });

  it('normaliserar JSON-rehydrerat objekt till Map', () => {
    const rehydrated = JSON.parse(JSON.stringify({ 'booking-1': { totalItems: 3 } }));
    const map = toMap<{ totalItems: number }>(rehydrated);
    expect(typeof map.get).toBe('function');
    expect(map.get('booking-1')?.totalItems).toBe(3);
  });

  it('ger tomt Map för undefined/null (ingen krasch)', () => {
    expect(toMap(undefined).size).toBe(0);
    expect(toMap(null).size).toBe(0);
    expect(typeof toMap(undefined).get).toBe('function');
  });

  it('hanterar array av par', () => {
    const map = toMap<number>([['x', 5]]);
    expect(map.get('x')).toBe(5);
  });

  it('flaggar Map/Set som icke JSON-säker data', () => {
    expect(containsNonJsonSafeData(new Map())).toBe(true);
    expect(containsNonJsonSafeData(new Set())).toBe(true);
    expect(containsNonJsonSafeData({ nested: { m: new Map() } })).toBe(true);
    expect(containsNonJsonSafeData([{ m: new Map() }])).toBe(true);
  });

  it('tillåter vanlig JSON-data', () => {
    expect(containsNonJsonSafeData({ a: 1, b: [1, 2], c: 'x', d: null })).toBe(false);
  });
});
