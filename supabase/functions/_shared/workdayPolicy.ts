// Workday policy — canonical rules for what counts as work, what may
// auto-start the workday, and how segments are classified relative to
// an active workday window.
//
// PRINCIPLE: when the workday is running, time INSIDE the window counts
// as work until something explicitly proves otherwise. Unknown / travel
// segments are NEVER silently dropped from the workday duration — they
// are tagged for review.

export type PolicyStatus =
  | "confirmed_work"             // bekräftat projekt/booking/lager-location, avslutad
  | "active_work"                // pågående bekräftad aktivitet
  | "travel_within_workday"      // resa inom arbetsdagen
  | "other_place"                // okänd plats inom arbetsdagen — räknas som arbetstid, väntar på klassning
  | "unknown_needs_review"       // okänd plats utanför arbetsdagen
  | "travel_outside_workday"     // förflyttning utanför arbetsdagen — räknas inte
  | "break"                      // klassad rast
  | "private"                    // klassad privat (zon eller manuellt)
  | "approved"                   // godkänd rad (låst)
  | "locked";                    // dagen är låst

export interface PolicySegment {
  kind: "project" | "booking" | "travel" | "location" | "unknown" | "active";
  startedAt: string;
  endedAt: string | null;
  /** Backend-known classification: 'private' | 'break' | null */
  classification?: string | null;
  /** True only if the segment is tied to a confirmed worksite ref. */
  hasConfirmedRef?: boolean;
  approved?: boolean | null;
}

export interface PolicyWorkday {
  startedAt: string;
  endedAt: string | null;
  approved: boolean;
}

const MS = 60_000;
const tms = (iso: string | null | undefined) =>
  iso ? new Date(iso).getTime() : NaN;

/**
 * A segment represents presence at a confirmed worksite when:
 *   - it is a project / booking time-report row
 *   - OR a location_entry tied to booking / large_project / location_id
 *     with a real reference (not just an address ping)
 *
 * False for: unknown, raw GPS, travel logs, home/private zones.
 */
export function isConfirmedWorksitePresence(seg: PolicySegment): boolean {
  if (seg.classification === "private" || seg.classification === "break") return false;
  if (seg.kind === "project" || seg.kind === "booking" || seg.kind === "location") {
    return seg.hasConfirmedRef !== false;
  }
  if (seg.kind === "active") return seg.hasConfirmedRef === true;
  return false;
}

/**
 * Only confirmed worksite presence may auto-start (or back-date) the workday.
 * Travel / unknown / private segments must NEVER auto-open a workday.
 */
export function canStartWorkdayAutomatically(seg: PolicySegment): boolean {
  return isConfirmedWorksitePresence(seg);
}

/**
 * True if the segment overlaps the active workday window. Used to decide
 * whether unknown/travel segments should count INSIDE the workday total.
 *
 * If the workday is open (no ended_at), `now` is used as the end edge.
 */
export function countsWithinActiveWorkday(
  seg: PolicySegment,
  workday: PolicyWorkday | null,
  now: Date = new Date(),
): boolean {
  if (!workday) return false;
  const wdStart = tms(workday.startedAt);
  const wdEnd = workday.endedAt ? tms(workday.endedAt) : now.getTime();
  const sStart = tms(seg.startedAt);
  const sEnd = seg.endedAt ? tms(seg.endedAt) : now.getTime();
  if (!isFinite(sStart) || !isFinite(wdStart)) return false;
  // Overlap, not strict containment — travel that crosses the boundary is partial.
  return sEnd > wdStart && sStart < wdEnd;
}

/**
 * Resolve the canonical PolicyStatus for a single segment given the
 * workday context. UI/labels and totals derive from this enum.
 */
export function classifySegment(
  seg: PolicySegment,
  workday: PolicyWorkday | null,
  now: Date = new Date(),
): PolicyStatus {
  if (workday?.approved || seg.approved) {
    // Locked rows still report their semantic status, but flagged as approved
    // so consumers can disable edits. We bias toward approved here.
    return "approved";
  }
  if (seg.classification === "break") return "break";
  if (seg.classification === "private") return "private";

  const inside = countsWithinActiveWorkday(seg, workday, now);

  if (seg.kind === "active") return "active_work";
  if (seg.kind === "travel") {
    return inside ? "travel_within_workday" : "travel_outside_workday";
  }
  if (isConfirmedWorksitePresence(seg)) return "confirmed_work";
  // Unknown / unclassified
  return inside ? "other_place" : "unknown_needs_review";
}

/**
 * Decide if the workday's started_at should be back-dated based on an
 * earlier confirmed worksite presence. Returns the suggested ISO start
 * or null. NEVER suggests starting from unknown / travel.
 */
export function suggestedWorkdayStart(
  segments: PolicySegment[],
  workday: PolicyWorkday | null,
): string | null {
  // Only confirmed presence may move the start edge.
  const confirmed = segments
    .filter(canStartWorkdayAutomatically)
    .map((s) => s.startedAt)
    .filter(Boolean)
    .sort();
  const earliest = confirmed[0] ?? null;
  if (!earliest) return null;
  if (!workday) return earliest;
  return earliest < workday.startedAt ? earliest : null;
}

/**
 * True if a segment must be counted inside the workday's payable total
 * even though it has no project/booking allocation. Used to ensure
 * unknown vistelser inside the workday don't silently shrink the day.
 */
export function countsAsPayableUnallocated(
  seg: PolicySegment,
  workday: PolicyWorkday | null,
  now: Date = new Date(),
): boolean {
  if (!workday) return false;
  if (seg.classification === "private" || seg.classification === "break") return false;
  return countsWithinActiveWorkday(seg, workday, now);
}
