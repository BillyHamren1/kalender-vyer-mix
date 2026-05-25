import type { DaySegment, SegmentType } from "./dayPartition.ts";

export interface VisibleWindowSummary {
  windowMin: number;
  workMin: number;
  privateMin: number;
  travelMin: number;
  unknownMin: number;
  gapMin: number;
  idleMin: number;
  visitsCount: number;
  segments: DaySegment[];
  placeMinutes: Array<{ id: string; name: string; minutes: number }>;
  placeNames: string[];
}

function toMs(iso: string): number { return new Date(iso).getTime(); }
function toIso(ms: number): string { return new Date(ms).toISOString(); }

export function summarizeVisibleWindow(
  segments: DaySegment[],
  firstIso: string | null,
  lastIso: string | null,
): VisibleWindowSummary {
  if (!firstIso || !lastIso) {
    return {
      windowMin: 0,
      workMin: 0,
      privateMin: 0,
      travelMin: 0,
      unknownMin: 0,
      gapMin: 0,
      idleMin: 0,
      visitsCount: 0,
      segments: [],
      placeMinutes: [],
      placeNames: [],
    };
  }

  const windowStart = toMs(firstIso);
  const windowEnd = toMs(lastIso);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
    return {
      windowMin: 0,
      workMin: 0,
      privateMin: 0,
      travelMin: 0,
      unknownMin: 0,
      gapMin: 0,
      idleMin: 0,
      visitsCount: 0,
      segments: [],
      placeMinutes: [],
      placeNames: [],
    };
  }

  const clipped = segments
    .map((segment) => {
      const start = Math.max(windowStart, toMs(segment.start));
      const end = Math.min(windowEnd, toMs(segment.end));
      if (end <= start) return null;
      return {
        ...segment,
        start: toIso(start),
        end: toIso(end),
        minutes: 0,
        _rawMinutes: (end - start) / 60_000,
      };
    })
    .filter((segment): segment is DaySegment & { _rawMinutes: number } => Boolean(segment));

  const windowMin = Math.max(0, Math.round((windowEnd - windowStart) / 60_000));
  const floors = clipped.map((segment) => Math.floor(segment._rawMinutes));
  let used = floors.reduce((sum, minutes) => sum + minutes, 0);
  const remainders = clipped
    .map((segment, index) => ({ index, frac: segment._rawMinutes - Math.floor(segment._rawMinutes) }))
    .sort((a, b) => b.frac - a.frac);

  let cursor = 0;
  while (used < windowMin && cursor < remainders.length) {
    floors[remainders[cursor].index] += 1;
    used += 1;
    cursor += 1;
  }

  clipped.forEach((segment, index) => {
    segment.minutes = floors[index];
    delete (segment as DaySegment & { _rawMinutes?: number })._rawMinutes;
  });

  let workMin = 0;
  let privateMin = 0;
  let travelMin = 0;
  let unknownMin = 0;
  let gapMin = 0;
  let idleMin = 0;
  const byPlace = new Map<string, { id: string; name: string; minutes: number }>();
  const placeNames: string[] = [];
  const seenPlaceNames = new Set<string>();

  const addBucket = (type: SegmentType, minutes: number) => {
    switch (type) {
      case "work": workMin += minutes; break;
      case "private": privateMin += minutes; break;
      case "travel": travelMin += minutes; break;
      case "unknown_place": unknownMin += minutes; break;
      case "gps_gap": gapMin += minutes; break;
      case "idle": idleMin += minutes; break;
    }
  };

  for (const segment of clipped) {
    addBucket(segment.type, segment.minutes);
    if (segment.type === "work" && segment.knownSiteId) {
      if (!seenPlaceNames.has(segment.label)) {
        seenPlaceNames.add(segment.label);
        placeNames.push(segment.label);
      }
      const current = byPlace.get(segment.knownSiteId);
      if (current) current.minutes += segment.minutes;
      else byPlace.set(segment.knownSiteId, { id: segment.knownSiteId, name: segment.label, minutes: segment.minutes });
    }
  }

  return {
    windowMin,
    workMin,
    privateMin,
    travelMin,
    unknownMin,
    gapMin,
    idleMin,
    visitsCount: clipped.filter((segment) => segment.type === "work").length,
    segments: clipped,
    placeMinutes: Array.from(byPlace.values()).sort((a, b) => b.minutes - a.minutes),
    placeNames,
  };
}