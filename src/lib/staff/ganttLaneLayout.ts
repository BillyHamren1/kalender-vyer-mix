/**
 * Pure helper for the Staff Gantt: assign overlapping rectangles to vertical
 * "lanes" so that every block keeps its TRUE time-position (top + height) and
 * overlapping blocks share the column horizontally instead of being shoved
 * downward in time.
 *
 * Spegelar StaffGanttView.tsx-logiken så att den kan kontraktstestas.
 */
export interface GanttRectInput {
  id: string;
  startMs: number;
  endMs: number;
  top: number;
  height: number;
}

export interface GanttRectPositioned extends GanttRectInput {
  lane: number;
  laneCount: number;
}

export function assignGanttLanes(rects: GanttRectInput[]): GanttRectPositioned[] {
  const sorted = [...rects].sort((a, b) =>
    a.startMs !== b.startMs
      ? a.startMs - b.startMs
      : (a.endMs - a.startMs) - (b.endMs - b.startMs),
  );
  const lanes: { endMs: number }[] = [];
  const laneByIdx: number[] = [];
  for (const r of sorted) {
    let placed = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].endMs <= r.startMs) {
        lanes[i].endMs = r.endMs;
        placed = i;
        break;
      }
    }
    if (placed === -1) {
      lanes.push({ endMs: r.endMs });
      placed = lanes.length - 1;
    }
    laneByIdx.push(placed);
  }
  const laneCount = Math.max(1, lanes.length);
  return sorted.map((r, idx) => ({ ...r, lane: laneByIdx[idx], laneCount }));
}
