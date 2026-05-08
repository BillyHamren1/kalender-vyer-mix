// @ts-nocheck
/**
 * Time Engine — buildPresenceDayBlocks
 * ────────────────────────────────────
 *
 * Deterministic semantic interpretation of a single staff member's day.
 *
 * Input  : raw GpsDayTimelineResult (stay/travel/gps_gap segments) + optional
 *          active-timer markers.
 * Output : semantic PresenceDayBlocks consumed by admin presence UI.
 *
 * BLOCK KINDS:
 *   - confirmed_on_site       — GPS actually inside a known target/geofence
 *   - probable_on_site        — same target before/after a *short* signal gap
 *   - signal_gap              — GPS missing, engine cannot place the person
 *   - uncertain_transition    — GPS missing between two different stable places,
 *                               or distance before/after >= 5000 m
 *   - transport               — GPS actually shows movement
 *   - unknown_place           — stable GPS cluster but no target match
 *   - timer_marker            — active-timer started/stopped markers (passthrough)
 *
 * STRICT RULES:
 *   1. confirmed_on_site is created ONLY when GPS is inside a known target.
 *   2. probable_on_site requires the SAME target both before AND after a short
 *      signal_gap. Confidence is never 'high' if GPS is missing for the
 *      majority of the period.
 *   3. signal_gap is created when GPS is missing.
 *   4. uncertain_transition when gap is between two DIFFERENT stable targets,
 *      or when the geographic distance between the surrounding stable points
 *      is >= 5000 m.
 *   5. transport requires actual movement pings — gps_gap is NEVER promoted
 *      to transport.
 *   6. unknown_place requires a stable GPS cluster — gps_gap is NEVER
 *      promoted to unknown_place.
 *
 * GAP RULES:
 *   - gap < 5 min  between same target → absorbed into probable_on_site
 *                                         (with signalGap metadata).
 *   - gap 5-30 min between same target → probable_on_site, confidence medium,
 *                                         reviewState 'ok' or 'needs_review'.
 *   - gap > 30 min between same target → its own signal_gap block (still).
 *   - gap between different targets    → uncertain_transition or signal_gap,
 *                                         never on-site time.
 *   - a lone gps_gap NEVER creates a departure.
 *
 * This module does NOT touch the database. It is a pure transformation.
 * It MUST NOT create time_reports / workdays / location_time_entries /
 * travel_time_logs and MUST NOT change auto-start rules.
 */

import type { GpsDayTimelineResult, GpsTimelineSegment } from './buildGpsDayTimeline.ts';
import type { ISODate, ISODateTime, UUID } from './contracts.ts';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type PresenceBlockKind =
  | 'confirmed_on_site'
  | 'probable_on_site'
  | 'signal_gap'
  | 'uncertain_transition'
  | 'transport'
  | 'unknown_place'
  | 'timer_marker';

export type PresenceConfidence = 'high' | 'medium' | 'low';
export type PresenceReviewState = 'ok' | 'needs_review' | 'signal_issue' | 'ignored';

export interface PresenceDayBlock {
  id: string;
  kind: PresenceBlockKind;
  startAt: ISODateTime;
  endAt: ISODateTime;
  durationMinutes: number;
  durationLabel: string;
  targetType: string | null;
  targetId: UUID | null;
  targetLabel: string | null;
  confidence: PresenceConfidence;
  confidenceReason: string;
  reviewState: PresenceReviewState;
  evidence: {
    pingCount?: number;
    distanceMeters?: number;
    avgKmh?: number;
    signalGapMinutes?: number;
    distanceBetweenAnchorsMeters?: number;
    surroundingTargetLabels?: { before: string | null; after: string | null };
    timerSource?: string | null;
    registrationId?: UUID | null;
    mergedBlockCount?: number;
    suppressedKinds?: Record<string, number>;
  };
  sourceSegmentIds: string[];
  hiddenRawSegmentIds: string[];
  /** Aggregated-only: minutes of signal_gap absorbed inside this block. */
  signalGapMinutes?: number;
  /** Aggregated-only: number of signal_gap evidence blocks absorbed. */
  signalGapCount?: number;
  /** Aggregated-only: ids of evidence blocks suppressed (bridges + merged anchors). */
  suppressedSegments?: string[];
}

export interface PresenceDaySummary {
  blocksCount: number;
  confirmedOnSiteMinutes: number;
  probableOnSiteMinutes: number;
  signalGapMinutes: number;
  uncertainTransitionMinutes: number;
  transportMinutes: number;
  unknownMinutes: number;
  needsReviewCount: number;
}

export interface TimerMarkerInput {
  id: string;
  kind: 'started' | 'stopped';
  at: ISODateTime;
  label: string;
  targetType: string | null;
  targetId: UUID | null;
  registrationId: UUID | null;
  source: string | null;
}

export interface BuildPresenceDayBlocksInput {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  gpsTimeline: GpsDayTimelineResult;
  timerMarkers?: TimerMarkerInput[];
}

export interface PresenceDayBlocksResult {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  computedAt: ISODateTime;
  blocks: PresenceDayBlock[];
  summary: PresenceDaySummary;
}

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

const SHORT_GAP_MAX_MIN = 5;
const MEDIUM_GAP_MAX_MIN = 30;
const UNCERTAIN_DISTANCE_M = 5000;
const EARTH_R = 6_371_000;

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

function durationMinutes(startAt: ISODateTime, endAt: ISODateTime): number {
  return Math.max(0, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000));
}

function formatDurationLabel(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function targetKey(seg: GpsTimelineSegment | null): string | null {
  if (!seg || !seg.matchedTargetId) return null;
  return `${seg.matchedTargetType ?? ''}:${seg.matchedTargetId}`;
}

function isKnownStay(seg: GpsTimelineSegment): boolean {
  return seg.kind === 'stay' && seg.type === 'known_site' && !!seg.matchedTargetId;
}

function isUnknownStay(seg: GpsTimelineSegment): boolean {
  return seg.kind === 'stay' && seg.type === 'unknown_place';
}

// ───────────────────────────────────────────────────────────────────────────
// Builder
// ───────────────────────────────────────────────────────────────────────────

export function buildPresenceDayBlocks(
  input: BuildPresenceDayBlocksInput,
): PresenceDayBlocksResult {
  const segs = [...(input.gpsTimeline.segments ?? [])].sort(
    (a, b) => Date.parse(a.startTs) - Date.parse(b.startTs),
  );

  const blocks: PresenceDayBlock[] = [];
  let blockSeq = 0;
  const newId = (kind: PresenceBlockKind) => `pdb-${kind}-${blockSeq++}`;

  // Walk segments. We may absorb a gps_gap into an adjacent same-target stay
  // as 'probable_on_site' under the 5-min rule.
  let i = 0;
  while (i < segs.length) {
    const seg = segs[i];

    // ── Stay on a known site ────────────────────────────────────────────
    if (isKnownStay(seg)) {
      // Try to absorb a *short* gap that bridges back to the SAME target.
      const next = segs[i + 1];
      const nextNext = segs[i + 2];
      const isShortGapBridge =
        next?.kind === 'gps_gap' &&
        next.durationMin < SHORT_GAP_MAX_MIN &&
        nextNext &&
        isKnownStay(nextNext) &&
        targetKey(nextNext) === targetKey(seg);

      if (isShortGapBridge) {
        const startAt = seg.startTs;
        const endAt = nextNext.endTs;
        const dur = durationMinutes(startAt, endAt);
        const gapMin = next.durationMin;
        blocks.push({
          id: newId('probable_on_site'),
          kind: 'probable_on_site',
          startAt,
          endAt,
          durationMinutes: dur,
          durationLabel: formatDurationLabel(dur),
          targetType: seg.matchedTargetType,
          targetId: seg.matchedTargetId,
          targetLabel: seg.matchedTargetName ?? seg.label,
          confidence: 'high',
          confidenceReason: `Samma plats före/efter kort GPS-glapp (${gapMin} min)`,
          reviewState: 'ok',
          evidence: {
            pingCount: (seg.pingCount ?? 0) + (nextNext.pingCount ?? 0),
            signalGapMinutes: gapMin,
            surroundingTargetLabels: {
              before: seg.matchedTargetName ?? seg.label,
              after: nextNext.matchedTargetName ?? nextNext.label,
            },
          },
          sourceSegmentIds: [seg.id, nextNext.id],
          hiddenRawSegmentIds: [next.id],
        });
        i += 3;
        continue;
      }

      // Plain confirmed on-site block.
      const dur = durationMinutes(seg.startTs, seg.endTs);
      blocks.push({
        id: newId('confirmed_on_site'),
        kind: 'confirmed_on_site',
        startAt: seg.startTs,
        endAt: seg.endTs,
        durationMinutes: dur,
        durationLabel: formatDurationLabel(dur),
        targetType: seg.matchedTargetType,
        targetId: seg.matchedTargetId,
        targetLabel: seg.matchedTargetName ?? seg.label,
        confidence: seg.confidence >= 0.8 ? 'high' : seg.confidence >= 0.5 ? 'medium' : 'low',
        confidenceReason: 'GPS bekräftat innanför geofence',
        reviewState: seg.confidence >= 0.5 ? 'ok' : 'needs_review',
        evidence: { pingCount: seg.pingCount },
        sourceSegmentIds: [seg.id],
        hiddenRawSegmentIds: [],
      });
      i += 1;
      continue;
    }

    // ── GPS gap ─────────────────────────────────────────────────────────
    if (seg.kind === 'gps_gap') {
      // Look at neighbours that are stable stays (we ignore travel/unknown
      // when classifying gap context — see rule below).
      const prevStable = findPrevStableStay(segs, i);
      const nextStable = findNextStableStay(segs, i);
      const gapMin = seg.durationMin;
      const startAt = seg.startTs;
      const endAt = seg.endTs;

      const prevKey = targetKey(prevStable);
      const nextKey = targetKey(nextStable);
      const sameKnownTarget =
        !!prevKey && !!nextKey && prevKey === nextKey && isKnownStay(prevStable!) && isKnownStay(nextStable!);

      // ── Same known target on both sides ─────────────────────────────
      if (sameKnownTarget) {
        if (gapMin <= SHORT_GAP_MAX_MIN) {
          // Absorbed by the previous known-stay branch above; if we got here
          // it means the prev stay has *already* been emitted as a non-bridge
          // confirmed block (e.g. there was something in between). Emit a
          // probable_on_site for the gap itself with high confidence.
          blocks.push(
            mkProbable(newId('probable_on_site'), seg, prevStable!, nextStable!, gapMin, 'high', 'ok',
              `Kort GPS-glapp (${gapMin} min) mellan samma plats`),
          );
          i += 1;
          continue;
        }
        if (gapMin <= MEDIUM_GAP_MAX_MIN) {
          const review: PresenceReviewState = gapMin >= 15 ? 'needs_review' : 'ok';
          blocks.push(
            mkProbable(newId('probable_on_site'), seg, prevStable!, nextStable!, gapMin, 'medium', review,
              `Medium GPS-glapp (${gapMin} min) mellan samma plats`),
          );
          i += 1;
          continue;
        }
        // gap > 30 min: own signal_gap block, even if same target.
        blocks.push(mkSignalGap(newId('signal_gap'), seg, prevStable, nextStable, 'Långt GPS-glapp (>30 min)'));
        i += 1;
        continue;
      }

      // ── Different stable targets, or distance >= 5000 m → uncertain ──
      const distance = computeAnchorDistance(prevStable, nextStable);
      const differentTargets = !!prevKey && !!nextKey && prevKey !== nextKey;
      const farApart = distance != null && distance >= UNCERTAIN_DISTANCE_M;

      if (differentTargets || farApart) {
        blocks.push({
          id: newId('uncertain_transition'),
          kind: 'uncertain_transition',
          startAt,
          endAt,
          durationMinutes: gapMin,
          durationLabel: formatDurationLabel(gapMin),
          targetType: null,
          targetId: null,
          targetLabel: null,
          confidence: 'low',
          confidenceReason: farApart
            ? `GPS saknas mellan punkter >${Math.round((distance ?? 0) / 1000)} km isär`
            : 'GPS saknas mellan två olika platser',
          reviewState: 'needs_review',
          evidence: {
            signalGapMinutes: gapMin,
            distanceBetweenAnchorsMeters: distance ?? undefined,
            surroundingTargetLabels: {
              before: prevStable?.matchedTargetName ?? prevStable?.label ?? null,
              after: nextStable?.matchedTargetName ?? nextStable?.label ?? null,
            },
          },
          sourceSegmentIds: [seg.id],
          hiddenRawSegmentIds: [],
        });
        i += 1;
        continue;
      }

      // ── Plain signal gap ─────────────────────────────────────────────
      blocks.push(mkSignalGap(newId('signal_gap'), seg, prevStable, nextStable, 'GPS-signal saknas'));
      i += 1;
      continue;
    }

    // ── Travel ──────────────────────────────────────────────────────────
    if (seg.kind === 'travel') {
      const dur = durationMinutes(seg.startTs, seg.endTs);
      blocks.push({
        id: newId('transport'),
        kind: 'transport',
        startAt: seg.startTs,
        endAt: seg.endTs,
        durationMinutes: dur,
        durationLabel: formatDurationLabel(dur),
        targetType: null,
        targetId: null,
        targetLabel: 'Transport',
        confidence: seg.confidence >= 0.7 ? 'high' : seg.confidence >= 0.4 ? 'medium' : 'low',
        confidenceReason: 'GPS visar rörelse',
        reviewState: 'ok',
        evidence: {
          pingCount: seg.pingCount,
          distanceMeters: Math.round(seg.distanceMeters ?? 0),
          avgKmh: Math.round((seg.avgKmh ?? 0) * 10) / 10,
        },
        sourceSegmentIds: [seg.id],
        hiddenRawSegmentIds: [],
      });
      i += 1;
      continue;
    }

    // ── Unknown stable place ────────────────────────────────────────────
    if (isUnknownStay(seg)) {
      const dur = durationMinutes(seg.startTs, seg.endTs);
      blocks.push({
        id: newId('unknown_place'),
        kind: 'unknown_place',
        startAt: seg.startTs,
        endAt: seg.endTs,
        durationMinutes: dur,
        durationLabel: formatDurationLabel(dur),
        targetType: null,
        targetId: null,
        targetLabel: 'Okänd plats',
        confidence: seg.confidence >= 0.6 ? 'medium' : 'low',
        confidenceReason: 'GPS visar stabil plats utan känd target',
        reviewState: 'needs_review',
        evidence: { pingCount: seg.pingCount },
        sourceSegmentIds: [seg.id],
        hiddenRawSegmentIds: [],
      });
      i += 1;
      continue;
    }

    // Fallback — should not happen with current GpsTimelineSegment kinds.
    i += 1;
  }

  // ── Timer markers (overlay; not collapsed into blocks) ─────────────────
  for (const m of input.timerMarkers ?? []) {
    blocks.push({
      id: newId('timer_marker'),
      kind: 'timer_marker',
      startAt: m.at,
      endAt: m.at,
      durationMinutes: 0,
      durationLabel: '0 min',
      targetType: m.targetType,
      targetId: m.targetId,
      targetLabel: m.label,
      confidence: 'high',
      confidenceReason: m.kind === 'started' ? 'Timer startad' : 'Timer stoppad',
      reviewState: 'ok',
      evidence: { timerSource: m.source, registrationId: m.registrationId },
      sourceSegmentIds: [],
      hiddenRawSegmentIds: [],
    });
  }

  blocks.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  return {
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    computedAt: new Date().toISOString(),
    blocks,
    summary: summarise(blocks),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

function findPrevStableStay(segs: GpsTimelineSegment[], idx: number): GpsTimelineSegment | null {
  for (let j = idx - 1; j >= 0; j--) {
    const s = segs[j];
    if (s.kind === 'stay') return s;
    if (s.kind === 'travel') return null; // movement separates
  }
  return null;
}
function findNextStableStay(segs: GpsTimelineSegment[], idx: number): GpsTimelineSegment | null {
  for (let j = idx + 1; j < segs.length; j++) {
    const s = segs[j];
    if (s.kind === 'stay') return s;
    if (s.kind === 'travel') return null;
  }
  return null;
}

function computeAnchorDistance(
  a: GpsTimelineSegment | null,
  b: GpsTimelineSegment | null,
): number | null {
  if (!a || !b) return null;
  const aLat = a.endLat ?? a.centerLat;
  const aLng = a.endLng ?? a.centerLng;
  const bLat = b.startLat ?? b.centerLat;
  const bLng = b.startLng ?? b.centerLng;
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  return haversineM(aLat, aLng, bLat, bLng);
}

function mkProbable(
  id: string,
  gap: GpsTimelineSegment,
  prev: GpsTimelineSegment,
  next: GpsTimelineSegment,
  gapMin: number,
  confidence: PresenceConfidence,
  reviewState: PresenceReviewState,
  reason: string,
): PresenceDayBlock {
  const dur = durationMinutes(gap.startTs, gap.endTs);
  return {
    id,
    kind: 'probable_on_site',
    startAt: gap.startTs,
    endAt: gap.endTs,
    durationMinutes: dur,
    durationLabel: formatDurationLabel(dur),
    targetType: prev.matchedTargetType,
    targetId: prev.matchedTargetId,
    targetLabel: prev.matchedTargetName ?? prev.label,
    confidence,
    confidenceReason: reason,
    reviewState,
    evidence: {
      signalGapMinutes: gapMin,
      surroundingTargetLabels: {
        before: prev.matchedTargetName ?? prev.label,
        after: next.matchedTargetName ?? next.label,
      },
    },
    sourceSegmentIds: [prev.id, next.id],
    hiddenRawSegmentIds: [gap.id],
  };
}

function mkSignalGap(
  id: string,
  gap: GpsTimelineSegment,
  prev: GpsTimelineSegment | null,
  next: GpsTimelineSegment | null,
  reason: string,
): PresenceDayBlock {
  const dur = durationMinutes(gap.startTs, gap.endTs);
  return {
    id,
    kind: 'signal_gap',
    startAt: gap.startTs,
    endAt: gap.endTs,
    durationMinutes: dur,
    durationLabel: formatDurationLabel(dur),
    targetType: null,
    targetId: null,
    targetLabel: 'Signal saknas',
    confidence: 'low',
    confidenceReason: reason,
    reviewState: 'signal_issue',
    evidence: {
      signalGapMinutes: dur,
      surroundingTargetLabels: {
        before: prev?.matchedTargetName ?? prev?.label ?? null,
        after: next?.matchedTargetName ?? next?.label ?? null,
      },
    },
    sourceSegmentIds: [gap.id],
    hiddenRawSegmentIds: [],
  };
}

function summarise(blocks: PresenceDayBlock[]): PresenceDaySummary {
  const sum: PresenceDaySummary = {
    blocksCount: blocks.length,
    confirmedOnSiteMinutes: 0,
    probableOnSiteMinutes: 0,
    signalGapMinutes: 0,
    uncertainTransitionMinutes: 0,
    transportMinutes: 0,
    unknownMinutes: 0,
    needsReviewCount: 0,
  };
  for (const b of blocks) {
    if (b.reviewState === 'needs_review' || b.reviewState === 'signal_issue') {
      sum.needsReviewCount += 1;
    }
    switch (b.kind) {
      case 'confirmed_on_site': sum.confirmedOnSiteMinutes += b.durationMinutes; break;
      case 'probable_on_site': sum.probableOnSiteMinutes += b.durationMinutes; break;
      case 'signal_gap': sum.signalGapMinutes += b.durationMinutes; break;
      case 'uncertain_transition': sum.uncertainTransitionMinutes += b.durationMinutes; break;
      case 'transport': sum.transportMinutes += b.durationMinutes; break;
      case 'unknown_place': sum.unknownMinutes += b.durationMinutes; break;
      case 'timer_marker': break;
    }
  }
  return sum;
}
