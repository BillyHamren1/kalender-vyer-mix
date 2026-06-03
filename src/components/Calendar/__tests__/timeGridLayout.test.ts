import { describe, it, expect } from 'vitest';
import { computeOverlapLayout } from '../timeGridLayout';
import type { CalendarEvent } from '../ResourceData';

const ev = (id: string, startH: number, endH: number): CalendarEvent => ({
  id,
  title: id,
  start: `2026-06-09T${String(startH).padStart(2, '0')}:00:00`,
  end: `2026-06-09T${String(endH).padStart(2, '0')}:00:00`,
  resourceId: 'team-2',
});

const pos = (e: CalendarEvent) => {
  const [sh] = e.start.split('T')[1].split(':').map(Number);
  const [eh] = e.end.split('T')[1].split(':').map(Number);
  return { top: sh * 36, height: (eh - sh) * 36 };
};

describe('computeOverlapLayout', () => {
  it('adjacent (non-overlapping) events share lane 0', () => {
    const events = [ev('a', 12, 14), ev('b', 14, 16), ev('c', 16, 18)];
    const map = computeOverlapLayout(events, pos);
    for (const e of events) {
      expect(map.get(e.id)).toEqual({ column: 0, totalColumns: 1 });
    }
  });

  it('two overlapping events split into 2 lanes', () => {
    const events = [ev('a', 8, 12), ev('b', 10, 14)];
    const map = computeOverlapLayout(events, pos);
    expect(map.get('a')!.totalColumns).toBe(2);
    expect(map.get('b')!.totalColumns).toBe(2);
    expect(new Set([map.get('a')!.column, map.get('b')!.column])).toEqual(new Set([0, 1]));
  });

  it('transitive overlap A↔B↔C produces shared totalColumns and unique lanes', () => {
    // A 07-11, B 09-13 (overlaps A and C), C 12-15
    // Without union-find: A,B could form one group and C separate, leaving B+C colliding.
    const events = [ev('a', 7, 11), ev('b', 9, 13), ev('c', 12, 15)];
    const map = computeOverlapLayout(events, pos);
    // B overlaps both A and C, so all three belong to same cluster (totalColumns >= 2)
    const totals = events.map((e) => map.get(e.id)!.totalColumns);
    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBeGreaterThanOrEqual(2);

    // B and C must not occupy the same lane (they overlap at 12-13)
    expect(map.get('b')!.column).not.toBe(map.get('c')!.column);
    // A and B must not occupy the same lane
    expect(map.get('a')!.column).not.toBe(map.get('b')!.column);
  });

  it('three simultaneous events produce 3 unique lanes', () => {
    const events = [ev('a', 8, 12), ev('b', 9, 11), ev('c', 10, 13)];
    const map = computeOverlapLayout(events, pos);
    const lanes = events.map((e) => map.get(e.id)!.column);
    expect(new Set(lanes).size).toBe(3);
    for (const e of events) expect(map.get(e.id)!.totalColumns).toBe(3);
  });

  it('exact touching boundary 14:00 does not count as overlap', () => {
    const events = [ev('a', 12, 14), ev('b', 14, 16)];
    const map = computeOverlapLayout(events, pos);
    expect(map.get('a')).toEqual({ column: 0, totalColumns: 1 });
    expect(map.get('b')).toEqual({ column: 0, totalColumns: 1 });
  });
});
