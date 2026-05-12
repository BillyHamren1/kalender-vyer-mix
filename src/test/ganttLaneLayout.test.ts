import { describe, it, expect } from 'vitest';
import { assignGanttLanes } from '@/lib/staff/ganttLaneLayout';

describe('assignGanttLanes', () => {
  it('keeps every blocks true top — never shoves a later block downward in time', () => {
    // Block A: 07:08–08:02 (top=100, height=50)
    // Block B: 07:56–14:37 (top=148, height=400) — overlaps A
    const out = assignGanttLanes([
      { id: 'A', startMs: 1000, endMs: 2000, top: 100, height: 50 },
      { id: 'B', startMs: 1900, endMs: 8000, top: 148, height: 400 },
    ]);
    const a = out.find((x) => x.id === 'A')!;
    const b = out.find((x) => x.id === 'B')!;
    // Top must equal input top — no cursor-based shift.
    expect(a.top).toBe(100);
    expect(b.top).toBe(148);
    // Overlap → 2 lanes, different columns.
    expect(a.laneCount).toBe(2);
    expect(b.laneCount).toBe(2);
    expect(a.lane).not.toBe(b.lane);
  });

  it('non-overlapping blocks reuse the same lane', () => {
    const out = assignGanttLanes([
      { id: 'A', startMs: 0, endMs: 100, top: 0, height: 10 },
      { id: 'B', startMs: 200, endMs: 300, top: 50, height: 10 },
    ]);
    expect(out.every((r) => r.lane === 0)).toBe(true);
    expect(out.every((r) => r.laneCount === 1)).toBe(true);
  });

  it('three-way overlap produces three lanes', () => {
    const out = assignGanttLanes([
      { id: 'A', startMs: 0, endMs: 1000, top: 0, height: 100 },
      { id: 'B', startMs: 100, endMs: 1100, top: 10, height: 100 },
      { id: 'C', startMs: 200, endMs: 1200, top: 20, height: 100 },
    ]);
    expect(out.every((r) => r.laneCount === 3)).toBe(true);
    const lanes = new Set(out.map((r) => r.lane));
    expect(lanes.size).toBe(3);
  });
});
