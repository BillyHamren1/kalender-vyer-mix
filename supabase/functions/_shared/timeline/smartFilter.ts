// Smart filter for "unknown stops":
// - duration >= 15 min
// - during work hours (workday open OR within report start/end)
// - not close to a home location
// - not the very first/last stationary segment if it's plausibly home
//   (i.e., before workday started or after workday ended)

import type { KnownPlace, Segment, WorkdayRow } from "./types.ts";
import { distanceMeters } from "./geo.ts";

export interface SmartFilterContext {
  workdays: WorkdayRow[];
  homePlace: KnownPlace | null;
}

export function isUnknownStopReportable(
  seg: Segment,
  ctx: SmartFilterContext,
  minMin = 15,
): boolean {
  if (!seg.isStationary) return false;
  if (seg.matchedPlace) return false; // matched a known place — handled elsewhere
  if (seg.durationMin < minMin) return false;

  // Suppress if the stop is very close to home coords (e.g., 200m).
  if (ctx.homePlace) {
    const d = distanceMeters(
      seg.centerLat, seg.centerLng,
      ctx.homePlace.lat, ctx.homePlace.lng,
    );
    if (d <= 200) return false;
  }

  // Must overlap with at least one open workday (or workday window).
  const overlaps = ctx.workdays.some((wd) => {
    const wdStart = new Date(wd.started_at).getTime();
    const wdEnd = wd.ended_at ? new Date(wd.ended_at).getTime() : Date.now();
    const segStart = new Date(seg.startTs).getTime();
    const segEnd = new Date(seg.endTs).getTime();
    return segStart < wdEnd && segEnd > wdStart;
  });
  if (!overlaps) return false;

  return true;
}
