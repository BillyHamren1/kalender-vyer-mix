/**
 * Time Engine — absorbUnknownStayIntoOwner
 * =========================================
 *
 * Pure post-pass for `buildGpsDayTimeline`. Closes the long-standing gap
 * where a known stay (e.g. FA Warehouse) → short signal noise / micro-gap →
 * another known stay on the SAME target produced an `unknown_place` block
 * labelled "Arbete – okänd plats" between them.
 *
 * RULES (rule #6 — konsolidering):
 *   1. If an unknown_place stay is sandwiched between two known_site stays
 *      that share the SAME target, AND the unknown stay's centroid lies
 *      within `target.radius + ABSORB_TOLERANCE_M` of the target center,
 *      reclassify the unknown stay as known_site of that target.
 *   2. If an unknown_place stay directly follows a known_site stay AND
 *      its centroid is within `target.radius + ABSORB_TOLERANCE_M` of
 *      that target's center, absorb it into the same target.
 *
 * Confidence:
 *   - 'high'   when distanceFromCenter <= radius (inside the geofence)
 *   - 'medium' when within radius + tolerance (sandwich / sticky owner)
 *   - segments that don't qualify keep their original `unknown_place`
 *     classification and are tagged with diagnostics (`unknownReason`,
 *     `nearestKnownTargetLabel`, `nearestKnownTargetDistanceMeters`,
 *     `nearestKnownTargetRejectedReason`).
 *
 * NEVER:
 *   - touches `kind=travel` or `kind=gps_gap` segments
 *   - renames a known_site that already matches a target
 *   - creates new segments
 *   - reads workdays / time_reports / timers / DB
 *
 * Mirrored confidence label is also written so admin and mobile can render
 * the same `displayLabel` instead of guessing in the frontend.
 */
import type { GpsTimelineSegment, SegmentTargetDiagnostics } from "./buildGpsDayTimeline.ts";
import type { WorkTarget } from "./contracts.ts";

export const UNKNOWN_ABSORB_TOLERANCE_M = 150;

export type AbsorbReason =
  | "sandwiched_same_target"
  | "follows_same_target_sticky"
  | "preceded_by_same_target";

export interface AbsorbDiagnostics {
  absorbedUnknownStaysCount: number;
  absorbedUnknownStaysMinutes: number;
  absorbedExamples: Array<{
    segmentStart: string;
    segmentEnd: string;
    durationMinutes: number;
    targetLabel: string;
    targetId: string;
    distanceFromCenterMeters: number;
    radiusMeters: number;
    reason: AbsorbReason;
    confidence: "high" | "medium";
  }>;
  preservedUnknownCount: number;
  preservedUnknownMinutes: number;
}

const EARTH_M = 6_371_000;
function toRad(d: number) { return (d * Math.PI) / 180; }
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function findTargetForKnownSite(
  seg: GpsTimelineSegment,
  targets: WorkTarget[],
): WorkTarget | null {
  if (!seg.matchedTargetId) return null;
  return targets.find((t) => t.refId === seg.matchedTargetId) ?? null;
}

function nearestNonResidence(
  centerLat: number | null,
  centerLng: number | null,
  targets: WorkTarget[],
): { target: WorkTarget; distanceM: number } | null {
  if (centerLat == null || centerLng == null) return null;
  let best: { target: WorkTarget; distanceM: number } | null = null;
  for (const t of targets) {
    if (t.isPrivateResidence === true) continue;
    if (t.center?.lat == null || t.center?.lng == null) continue;
    const d = haversineM(centerLat, centerLng, t.center.lat, t.center.lng);
    if (!best || d < best.distanceM) best = { target: t, distanceM: d };
  }
  return best;
}

function withinAbsorbDistance(
  centerLat: number | null,
  centerLng: number | null,
  target: WorkTarget,
): { ok: boolean; distanceM: number; confidence: "high" | "medium" } {
  if (centerLat == null || centerLng == null) return { ok: false, distanceM: Infinity, confidence: "medium" };
  const d = haversineM(centerLat, centerLng, target.center.lat, target.center.lng);
  const radius = Math.max(0, target.radiusM ?? 0);
  if (d <= radius) return { ok: true, distanceM: d, confidence: "high" };
  if (d <= radius + UNKNOWN_ABSORB_TOLERANCE_M) return { ok: true, distanceM: d, confidence: "medium" };
  return { ok: false, distanceM: d, confidence: "medium" };
}

/**
 * Mutates `segments` in place. Returns aggregate diagnostics for the
 * builder to emit alongside `classificationDiagnostics`.
 */
export function absorbUnknownStayIntoOwner(
  segments: GpsTimelineSegment[],
  targets: WorkTarget[],
): AbsorbDiagnostics {
  const diag: AbsorbDiagnostics = {
    absorbedUnknownStaysCount: 0,
    absorbedUnknownStaysMinutes: 0,
    absorbedExamples: [],
    preservedUnknownCount: 0,
    preservedUnknownMinutes: 0,
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.kind !== "stay" || seg.type !== "unknown_place") continue;
    // Don't touch private_residence-tagged unknowns — those stay private.
    if (seg.targetDiagnostics?.privateResidence === true) {
      diag.preservedUnknownCount += 1;
      diag.preservedUnknownMinutes += seg.durationMin;
      continue;
    }

    // Find previous emitted non-gap segment, and next emitted non-gap segment.
    let prev: GpsTimelineSegment | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (segments[j].kind === "gps_gap") continue;
      prev = segments[j];
      break;
    }
    let next: GpsTimelineSegment | null = null;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j].kind === "gps_gap") continue;
      next = segments[j];
      break;
    }

    const prevTarget = prev && prev.kind === "stay" && prev.type === "known_site"
      ? findTargetForKnownSite(prev, targets) : null;
    const nextTarget = next && next.kind === "stay" && next.type === "known_site"
      ? findTargetForKnownSite(next, targets) : null;

    let owner: WorkTarget | null = null;
    let reason: AbsorbReason = "preceded_by_same_target";

    // Rule #6.1 — sandwich: same target on both sides.
    if (prevTarget && nextTarget && prevTarget.refId === nextTarget.refId) {
      owner = prevTarget;
      reason = "sandwiched_same_target";
    } else if (prevTarget) {
      owner = prevTarget;
      reason = "preceded_by_same_target";
    } else if (nextTarget) {
      owner = nextTarget;
      reason = "follows_same_target_sticky";
    }

    if (owner) {
      const check = withinAbsorbDistance(seg.centerLat, seg.centerLng, owner);
      if (check.ok) {
        seg.originalKind = seg.originalKind ?? seg.kind;
        seg.originalType = seg.originalType ?? seg.type;
        seg.kind = "stay";
        seg.type = "known_site";
        seg.label = owner.label;
        seg.matchedTargetId = owner.refId;
        seg.matchedTargetType = owner.kind;
        seg.matchedTargetName = owner.label;
        seg.reclassificationReason = "sticky_primary_target_no_strong_exit";
        seg.reason = "matched_valid_target";
        seg.confidence = check.confidence === "high" ? 0.85 : 0.6;

        const td = (seg.targetDiagnostics ??= {} as SegmentTargetDiagnostics);
        td.warningLabel =
          check.confidence === "medium"
            ? td.warningLabel ?? "GPS låg delvis utanför arbetsområdet"
            : td.warningLabel ?? null;

        diag.absorbedUnknownStaysCount += 1;
        diag.absorbedUnknownStaysMinutes += seg.durationMin;
        if (diag.absorbedExamples.length < 25) {
          diag.absorbedExamples.push({
            segmentStart: seg.startTs,
            segmentEnd: seg.endTs,
            durationMinutes: Math.round(seg.durationMin * 100) / 100,
            targetLabel: owner.label,
            targetId: owner.refId,
            distanceFromCenterMeters: Math.round(check.distanceM),
            radiusMeters: Math.max(0, owner.radiusM ?? 0),
            reason,
            confidence: check.confidence,
          });
        }
        continue;
      }
    }

    // Preserved unknown — surface nearest-known diagnostics so admin can see
    // why it stayed unknown.
    diag.preservedUnknownCount += 1;
    diag.preservedUnknownMinutes += seg.durationMin;
    const td = (seg.targetDiagnostics ??= {} as SegmentTargetDiagnostics);
    if (td.nearestTargetLabel == null) {
      const near = nearestNonResidence(seg.centerLat, seg.centerLng, targets);
      if (near) {
        td.nearestTargetLabel = near.target.label;
        td.nearestTargetId = near.target.refId;
        td.nearestTargetType = near.target.kind;
        td.nearestTargetDistanceMeters = Math.round(near.distanceM);
        td.nearestTargetRadiusMeters = Math.max(0, near.target.radiusM ?? 0);
        td.insideNearestTarget = near.distanceM <= (near.target.radiusM ?? 0);
      }
    }
  }

  return diag;
}
