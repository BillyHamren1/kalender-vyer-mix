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
import type { ISODate, ISODateTime, UUID, WorkTarget } from './contracts.ts';
import {
  findCompanionRouteEvidence,
  type CompanionRouteEvidence,
  type PeerGpsTimeline,
} from './findCompanionRouteEvidence.ts';
import {
  classifyTransportSignalGap,
  type ClassifyTransportSignalGapResult,
} from './classifyTransportSignalGap.ts';
import { staffOwnDisplacementMeters } from './staffOwnDisplacement.ts';
import { TRANSPORT_MIN_DISTANCE_METERS } from './transportThreshold.ts';

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
    centerLat?: number | null;
    centerLng?: number | null;
    maxDistanceMeters?: number | null;
    /** Engine 4 — propagated from GpsTimelineSegment.targetDiagnostics.
     *  When true, this block originates from a private_residence / boende
     *  polygon and MUST be filtered out of reportCandidateBlocks. Kept here
     *  so Decision Trace can render it as "Dolt: Boende / privat plats". */
    privateResidence?: boolean;
    privateResidenceTargetId?: string | null;
    privateResidenceLabel?: string | null;
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
  /**
   * Optional peer (other staff) GPS timelines for the same org/day, used as
   * companion-route evidence to bridge short transport gaps. Read-only —
   * peer pings are NEVER copied into this staff's data; they are only
   * evaluated as evidence.
   */
  peerGpsTimelines?: PeerGpsTimeline[];
  /** Resolved targets for THIS staff today (for destination evidence). */
  targets?: WorkTarget[];
}

export interface SignalGapTransportDiagnostics {
  confirmedTransportGapCount: number;
  confirmedTransportGapMinutes: number;
  probableTransportGapCount: number;
  probableTransportGapMinutes: number;
  remainingUnknownTransportGapCount: number;
  remainingUnknownTransportGapMinutes: number;
  lowConfidenceCandidateCount: number;
  missingAnchorRejectedCount: number;
  transportAnchorsUsedCount: number;
  routeContinuationConfirmedCount: number;
  destinationConfirmedCount: number;
  companionBoostedCount: number;
  examples: any[];
}

export interface CompanionRouteDiagnostics {
  confirmedByCompanionRouteCount: number;
  confirmedByCompanionRouteMinutes: number;
  veryHighConfidenceCount: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCandidateCount: number;
  unbridgedGapCount: number;
  examples: any[];
}

export interface PresenceDayBlocksResult {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  computedAt: ISODateTime;
  /** Aggregated, semantically meaningful day blocks — UI/time-report layer. */
  blocks: PresenceDayBlock[];
  /** Per-segment raw evidence blocks (pre-aggregation) — debug/technical UI. */
  evidenceBlocks: PresenceDayBlock[];
  /** Aliases for callers that prefer the explicit name. */
  presenceDayBlocks: PresenceDayBlock[];
  presenceDayBlocksRawEvidence: PresenceDayBlock[];
  summary: PresenceDaySummary;
  /** Aggregation diagnostics (rawEvidence/aggregated counts + ratio). */
  aggregation: {
    rawEvidenceBlocksCount: number;
    presenceDayBlocksCount: number;
    compressionRatio: number;
    byKind: Record<string, { evidence: number; presence: number; compressionRatio: number }>;
  };
  signalGapTransportDiagnostics: SignalGapTransportDiagnostics;
  companionRouteDiagnostics: CompanionRouteDiagnostics;
}

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

const SHORT_GAP_MAX_MIN = 5;
const MEDIUM_GAP_MAX_MIN = 30;
const UNCERTAIN_DISTANCE_M = 5000;
const EARTH_R = 6_371_000;

// Aggregation thresholds — bridges allowed BETWEEN two same-target on-site
// anchors. Long bridges (signal_gap > MEDIUM, transport >= 3min, etc.) are
// NEVER absorbed; they remain as their own day-report blocks.
const BRIDGE_TRANSPORT_MAX_MIN = 3;
const BRIDGE_UNKNOWN_MAX_MIN = 3;
const BRIDGE_SIGNAL_GAP_MAX_MIN = 5; // hard ceiling, separate from same-target signal_gap > 30 = never bridge
const UNKNOWN_MERGE_DISTANCE_M = 250;
const STABLE_STOP_MIN_MIN = 5;

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

  // Diagnostics for transport-gap classification (companion + classifier).
  const sgDiag: SignalGapTransportDiagnostics = {
    confirmedTransportGapCount: 0,
    confirmedTransportGapMinutes: 0,
    probableTransportGapCount: 0,
    probableTransportGapMinutes: 0,
    remainingUnknownTransportGapCount: 0,
    remainingUnknownTransportGapMinutes: 0,
    lowConfidenceCandidateCount: 0,
    missingAnchorRejectedCount: 0,
    transportAnchorsUsedCount: 0,
    routeContinuationConfirmedCount: 0,
    destinationConfirmedCount: 0,
    companionBoostedCount: 0,
    examples: [],
  };
  const crDiag: CompanionRouteDiagnostics = {
    confirmedByCompanionRouteCount: 0,
    confirmedByCompanionRouteMinutes: 0,
    veryHighConfidenceCount: 0,
    highConfidenceCount: 0,
    mediumConfidenceCount: 0,
    lowConfidenceCandidateCount: 0,
    unbridgedGapCount: 0,
    examples: [],
  };

  const targetsById = new Map<string, WorkTarget>();
  for (const t of input.targets ?? []) {
    targetsById.set(`${t.kind}:${t.refId}`, t);
  }
  const findTargetForSeg = (seg: GpsTimelineSegment | null): WorkTarget | null => {
    if (!seg || !seg.matchedTargetId) return null;
    return targetsById.get(`${seg.matchedTargetType}:${seg.matchedTargetId}`) ?? null;
  };


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
      const recReason = (seg as any).reclassificationReason as string | null | undefined;
      const reclassified =
        recReason === 'movement_inside_geofence' ||
        recReason === 'sticky_primary_target_no_strong_exit';
      const stickyTd = (seg as any).targetDiagnostics ?? {};
      const stickyConfReason: string | null = stickyTd.confidenceReason ?? null;
      const stickyWarning: string | null = stickyTd.warningLabel ?? null;
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
        confidence: reclassified
          ? 'medium'
          : seg.confidence >= 0.8 ? 'high' : seg.confidence >= 0.5 ? 'medium' : 'low',
        confidenceReason: stickyConfReason
          ? stickyConfReason
          : reclassified
            ? (recReason as string)
            : 'GPS bekräftat innanför geofence',
        reviewState: reclassified ? 'ok' : seg.confidence >= 0.5 ? 'ok' : 'needs_review',
        evidence: {
          pingCount: seg.pingCount,
          ...(stickyWarning ? { partialOutsideStickyGeofence: true, warningLabel: stickyWarning } as any : {}),
        },
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

      // ── Try transport-gap classification (transport blocks are valid anchors) ──
      const pickPos = (s: GpsTimelineSegment | null, useEnd: boolean) => {
        if (!s) return null;
        const lat = useEnd ? (s.endLat ?? s.centerLat) : (s.startLat ?? s.centerLat);
        const lng = useEnd ? (s.endLng ?? s.centerLng) : (s.startLng ?? s.centerLng);
        return lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null;
      };
      // Walk back/forward past coordinate-less neighbours; transport segments
      // are accepted as anchors.
      let prevAny: GpsTimelineSegment | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (segs[j].kind === 'gps_gap') continue;
        if (pickPos(segs[j], true)) { prevAny = segs[j]; break; }
      }
      let nextAny: GpsTimelineSegment | null = null;
      for (let j = i + 1; j < segs.length; j++) {
        if (segs[j].kind === 'gps_gap') continue;
        if (pickPos(segs[j], false)) { nextAny = segs[j]; break; }
      }
      const previousKnownPosition = pickPos(prevAny, true);
      const nextKnownPosition = pickPos(nextAny, false);
      const previousIsTransport = !!prevAny && prevAny.kind === 'travel';
      const nextIsTransport = !!nextAny && nextAny.kind === 'travel';

      // Destination scan: prefer the immediate next stable known stay; if the
      // next segments are transport, walk further forward through the
      // transport chain to find a known_site/warehouse/project destination.
      let destinationCandidate: WorkTarget | null = findTargetForSeg(nextStable);
      if (!destinationCandidate) {
        for (let j = i + 1; j < segs.length; j++) {
          const s = segs[j];
          if (s.kind === 'stay' && s.matchedTargetId) {
            destinationCandidate = findTargetForSeg(s);
            if (destinationCandidate) break;
          }
          // Continue through transport / gps_gap / unknown stays.
          if (s.kind === 'stay' && s.type !== 'known_site') continue;
          if (s.kind === 'travel' || s.kind === 'gps_gap') continue;
        }
      }
      const previousTargetForCompanion = findTargetForSeg(prevStable);

      const companion = findCompanionRouteEvidence({
        gapStartIso: startAt,
        gapEndIso: endAt,
        previousKnownPosition,
        nextKnownPosition,
        previousTarget: previousTargetForCompanion,
        nextTarget: destinationCandidate,
        peerGpsTimelines: input.peerGpsTimelines ?? [],
      });

      // Tally companion-confidence regardless of classification outcome.
      if (companion.confidence === 'very_high') crDiag.veryHighConfidenceCount += 1;
      else if (companion.confidence === 'high') crDiag.highConfidenceCount += 1;
      else if (companion.confidence === 'medium') crDiag.mediumConfidenceCount += 1;
      else crDiag.lowConfidenceCandidateCount += 1;

      const classification: ClassifyTransportSignalGapResult = classifyTransportSignalGap({
        gapStartIso: startAt,
        gapEndIso: endAt,
        previousKnownPosition,
        nextKnownPosition,
        previousIsTransport,
        nextIsTransport,
        destinationCandidate,
        conflictingSignals: {
          anyHardGeoEntry: false,
          anyConfirmedStayAtOtherPlace: false,
          anyHomePrivate: false,
        },
        companionRouteEvidence: companion,
      });

      if (classification.transportAnchorsUsed) sgDiag.transportAnchorsUsedCount += 1;
      if (classification.routeContinuationConfirmed) sgDiag.routeContinuationConfirmedCount += 1;
      if (companion.matched) sgDiag.companionBoostedCount += 1;
      if (companion.confidence === 'low' && !companion.matched) {
        sgDiag.lowConfidenceCandidateCount += 1;
      }
      if (!previousKnownPosition || !nextKnownPosition) {
        if (!classification.countsAsTransport) sgDiag.missingAnchorRejectedCount += 1;
      }

      // ── Engine 4 hard gate ─────────────────────────────────────────────
      // Before any signal_gap is promoted to `transport` based on indirect
      // evidence (companion route / transport anchors / destination guess),
      // verify that THIS staff member's own GPS shows real displacement
      // around the gap. Standing still on the same coordinate must NEVER
      // become "Resa", regardless of what colleagues did.
      const ownDisplacementM = staffOwnDisplacementMeters(
        previousKnownPosition,
        nextKnownPosition,
      );
      const stationaryGate =
        ownDisplacementM != null && ownDisplacementM < TRANSPORT_MIN_DISTANCE_METERS;

      if (classification.countsAsTransport && stationaryGate) {
        // Demote to plain signal_gap — own GPS proves no movement.
        sgDiag.missingAnchorRejectedCount += 1;
        blocks.push(mkSignalGap(
          newId('signal_gap'),
          seg,
          prevStable,
          nextStable,
          `GPS tyst men personen flyttade sig endast ${Math.round(ownDisplacementM ?? 0)} m`,
        ));
        // Bubble own displacement onto the emitted block for downstream
        // diagnostics in buildReportCandidateBlocks.
        const last = blocks[blocks.length - 1] as any;
        if (last?.evidence) {
          last.evidence.staffOwnDisplacementMeters = ownDisplacementM;
          last.evidence.demotedFromTransportReason = 'staff_stationary_under_500m';
        }
        i += 1;
        continue;
      }

      if (classification.countsAsTransport) {
        const dur = gapMin;
        const isConfirmed = classification.classification === 'confirmed_transport_gap';
        if (isConfirmed) {
          sgDiag.confirmedTransportGapCount += 1;
          sgDiag.confirmedTransportGapMinutes += dur;
        } else {
          sgDiag.probableTransportGapCount += 1;
          sgDiag.probableTransportGapMinutes += dur;
        }
        if (classification.destinationEvidence?.isWorkRelated) {
          sgDiag.destinationConfirmedCount += 1;
        }
        if (companion.matched && isConfirmed) {
          crDiag.confirmedByCompanionRouteCount += 1;
          crDiag.confirmedByCompanionRouteMinutes += dur;
        }
        if (sgDiag.examples.length < 5) {
          sgDiag.examples.push({
            gapStart: startAt, gapEnd: endAt, gapMinutes: dur,
            classification: classification.classification,
            confidence: classification.confidence,
            confidenceScore: classification.confidenceScore,
            matchedStaffCount: companion.matchedStaffCount,
            previousBlockKind: prevAny?.kind ?? null,
            nextBlockKind: nextAny?.kind ?? null,
            transportAnchorsUsed: classification.transportAnchorsUsed,
            routeContinuationConfirmed: classification.routeContinuationConfirmed,
            destinationConfirmed: classification.destinationConfirmed,
            destinationLabel: classification.destinationEvidence?.label ?? null,
            impliedSpeedKmh: classification.impliedSpeedKmh,
            reasons: classification.reasons,
          });
        }
        if (companion.matched && crDiag.examples.length < 5) {
          crDiag.examples.push({
            gapStart: startAt, gapEnd: endAt, gapMinutes: dur,
            classification: classification.classification,
            confidence: companion.confidence,
            confidenceScore: companion.confidenceScore,
            matchedStaffCount: companion.matchedStaffCount,
            matchedCompanionNames: companion.matchedStaff.map((m) => m.staffName).filter(Boolean),
            coverageRatio: companion.matchedStaff[0]?.coverageRatio ?? 0,
            previousTargetLabel: prevStable?.matchedTargetName ?? prevStable?.label ?? null,
            nextTargetLabel: destinationCandidate?.label ?? null,
            reasons: companion.reasons,
          });
        }

        const isHigh = classification.confidence === 'high' || classification.confidence === 'very_high';
        const subtitleSuffix = destinationCandidate?.label
          ? ` · ${prevStable?.matchedTargetName ?? prevStable?.label ?? '?'} → ${destinationCandidate.label}`
          : '';
        const reviewReason = isHigh
          ? null
          : 'gps_gap_inside_probable_transport';

        blocks.push({
          id: newId('transport'),
          kind: 'transport',
          startAt,
          endAt,
          durationMinutes: dur,
          durationLabel: formatDurationLabel(dur),
          targetType: null,
          targetId: null,
          targetLabel: 'Transport',
          confidence: isHigh ? 'high' : 'medium',
          confidenceReason: companion.matched
            ? 'multi_staff_route_confirmation'
            : classification.routeContinuationConfirmed
              ? 'transport_anchors_both_sides'
              : 'short_signal_gap_inside_confirmed_route',
          reviewState: 'ok',
          evidence: {
            signalGapMinutes: dur,
            warningLabel: classification.warningLabel,
            transportSubtitleSuffix: subtitleSuffix,
            transportGapClassification: classification.classification,
            transportGapConfidence: classification.confidence,
            transportGapConfidenceScore: classification.confidenceScore,
            transportGapReasons: classification.reasons,
            transportGapReviewReason: reviewReason,
            transportAnchorsUsed: classification.transportAnchorsUsed,
            routeContinuationConfirmed: classification.routeContinuationConfirmed,
            destinationConfirmed: classification.destinationConfirmed,
            companionRouteEvidence: companion,
            destinationEvidence: classification.destinationEvidence,
            impliedSpeedKmh: classification.impliedSpeedKmh,
            previousBlockKind: prevAny?.kind ?? null,
            nextBlockKind: nextAny?.kind ?? null,
            staffOwnDisplacementMeters: ownDisplacementM,
            surroundingTargetLabels: {
              before: prevStable?.matchedTargetName ?? prevStable?.label ?? null,
              after: destinationCandidate?.label
                ?? nextStable?.matchedTargetName ?? nextStable?.label ?? null,
            },
          } as any,
          sourceSegmentIds: [seg.id],
          hiddenRawSegmentIds: [],
        });
        i += 1;
        continue;
      }

      // ── Different stable targets, or distance >= 5000 m → uncertain ──
      const distance = computeAnchorDistance(prevStable, nextStable);
      const differentTargets = !!prevKey && !!nextKey && prevKey !== nextKey;
      const farApart = distance != null && distance >= UNCERTAIN_DISTANCE_M;

      if (differentTargets || farApart) {
        sgDiag.remainingUnknownTransportGapCount += 1;
        sgDiag.remainingUnknownTransportGapMinutes += gapMin;
        crDiag.unbridgedGapCount += 1;
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
            staffOwnDisplacementMeters: distance ?? undefined,
            surroundingTargetLabels: {
              before: prevStable?.matchedTargetName ?? prevStable?.label ?? null,
              after: nextStable?.matchedTargetName ?? nextStable?.label ?? null,
            },
            companionRouteEvidence: companion,
            transportGapClassification: classification.classification,
            transportGapReasons: classification.reasons,
          } as any,
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
      const td = (seg as any).targetDiagnostics ?? {};
      const isPrivateResidence = td.privateResidence === true;
      blocks.push({
        id: newId('unknown_place'),
        kind: 'unknown_place',
        startAt: seg.startTs,
        endAt: seg.endTs,
        durationMinutes: dur,
        durationLabel: formatDurationLabel(dur),
        targetType: null,
        targetId: null,
        targetLabel: isPrivateResidence
          ? (td.privateResidenceLabel ? `Boende: ${td.privateResidenceLabel}` : 'Boende')
          : 'Okänd plats',
        confidence: seg.confidence >= 0.6 ? 'medium' : 'low',
        confidenceReason: isPrivateResidence
          ? 'GPS innanför privat boende-polygon (filtreras från huvudvyn)'
          : 'GPS visar stabil plats utan känd target',
        reviewState: isPrivateResidence ? 'ok' : 'needs_review',
        evidence: {
          pingCount: seg.pingCount,
          centerLat: seg.centerLat ?? null,
          centerLng: seg.centerLng ?? null,
          ...(isPrivateResidence
            ? {
                privateResidence: true,
                privateResidenceTargetId: td.privateResidenceTargetId ?? null,
                privateResidenceLabel: td.privateResidenceLabel ?? null,
              }
            : {}),
        },
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

  // Aggregate evidence → semantic day-report blocks. Timer markers are kept
  // as overlays in BOTH layers so the consumer can render them either way.
  const evidenceBlocks = blocks;
  const dayReportBlocks = aggregateEvidenceBlocks(evidenceBlocks);

  return {
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    computedAt: new Date().toISOString(),
    blocks: dayReportBlocks,
    evidenceBlocks,
    presenceDayBlocks: dayReportBlocks,
    presenceDayBlocksRawEvidence: evidenceBlocks,
    summary: summarise(dayReportBlocks),
    aggregation: buildAggregationMetrics(evidenceBlocks, dayReportBlocks),
    signalGapTransportDiagnostics: sgDiag,
    companionRouteDiagnostics: crDiag,
  };
}

function buildAggregationMetrics(
  evidence: PresenceDayBlock[],
  presence: PresenceDayBlock[],
) {
  const byKind: Record<string, { evidence: number; presence: number; compressionRatio: number }> = {};
  const kinds: PresenceBlockKind[] = [
    'confirmed_on_site', 'probable_on_site', 'signal_gap',
    'uncertain_transition', 'transport', 'unknown_place', 'timer_marker',
  ];
  for (const k of kinds) {
    const ev = evidence.filter((b) => b.kind === k).length;
    const pr = presence.filter((b) => b.kind === k).length;
    byKind[k] = {
      evidence: ev,
      presence: pr,
      compressionRatio: ev > 0 ? Math.round((pr / ev) * 1000) / 1000 : 1,
    };
  }
  return {
    rawEvidenceBlocksCount: evidence.length,
    presenceDayBlocksCount: presence.length,
    compressionRatio:
      evidence.length > 0
        ? Math.round((presence.length / evidence.length) * 1000) / 1000
        : 1,
    byKind,
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
      staffOwnDisplacementMeters:
        prev && next ? staffOwnDisplacementMeters(
          { lat: (prev as any).endLat ?? (prev as any).centerLat, lng: (prev as any).endLng ?? (prev as any).centerLng },
          { lat: (next as any).startLat ?? (next as any).centerLat, lng: (next as any).startLng ?? (next as any).centerLng },
        ) : null,
      surroundingTargetLabels: {
        before: prev?.matchedTargetName ?? prev?.label ?? null,
        after: next?.matchedTargetName ?? next?.label ?? null,
      },
    } as any,
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

// ───────────────────────────────────────────────────────────────────────────
// Aggregation: evidenceBlocks → dayReportBlocks
// ───────────────────────────────────────────────────────────────────────────

/**
 * Walk evidence blocks and produce semantically meaningful day-report blocks.
 *
 * Rules (mirrored from the spec):
 *   A) Same target on-site blocks merge across short bridges (transport <3min,
 *      unknown_place <3min, signal_gap <5min).
 *   B) signal_gap > 30 min is NEVER absorbed.
 *   C) signal_gap 5-30 min same target stays 'probable_on_site' (medium) and
 *      naturally merges with neighbouring same-target anchors via rule A's
 *      same-target loop (it carries the same targetId).
 *   D) Consecutive transport blocks with no stable stop between are merged.
 *   E) Consecutive unknown_place at same area are merged.
 *   F) uncertain_transition passes through unchanged.
 *   G) timer_marker passes through unchanged.
 */
function aggregateEvidenceBlocks(evidence: PresenceDayBlock[]): PresenceDayBlock[] {
  if (evidence.length === 0) return [];

  // Separate timer markers — they stay as overlays in their own positions.
  const markers = evidence.filter((b) => b.kind === 'timer_marker');
  const timeline = evidence
    .filter((b) => b.kind !== 'timer_marker')
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const out: PresenceDayBlock[] = [];
  let seq = 0;
  const newId = (kind: PresenceBlockKind) => `pdb-agg-${kind}-${seq++}`;

  let i = 0;
  while (i < timeline.length) {
    const b = timeline[i];

    // ── On-site anchor (confirmed or probable) → grow with bridges ────────
    if (b.kind === 'confirmed_on_site' || b.kind === 'probable_on_site') {
      const members: PresenceDayBlock[] = [b];
      const suppressed: PresenceDayBlock[] = [];
      let j = i + 1;

      while (j < timeline.length) {
        const nb = timeline[j];

        // Direct same-target on-site continuation (no bridge).
        if (
          (nb.kind === 'confirmed_on_site' || nb.kind === 'probable_on_site') &&
          sameTarget(b, nb)
        ) {
          members.push(nb);
          j += 1;
          continue;
        }

        // Bridge candidate: collect a *run* of bridge-eligible segments and
        // peek for a same-target anchor after the run.
        let k = j;
        const bridges: PresenceDayBlock[] = [];
        while (k < timeline.length && isBridgeAllowed(timeline[k])) {
          bridges.push(timeline[k]);
          k += 1;
        }
        const after = k < timeline.length ? timeline[k] : null;
        if (
          bridges.length > 0 &&
          after &&
          (after.kind === 'confirmed_on_site' || after.kind === 'probable_on_site') &&
          sameTarget(b, after)
        ) {
          for (const br of bridges) suppressed.push(br);
          members.push(after);
          j = k + 1;
          continue;
        }

        break;
      }

      out.push(mergeOnSite(newId, members, suppressed));
      i = j;
      continue;
    }

    // ── Transport run merge (chain across non-stable bridges) ────────────
    if (b.kind === 'transport') {
      const run: PresenceDayBlock[] = [b];
      const suppressed: PresenceDayBlock[] = [];
      let j = i + 1;
      while (j < timeline.length) {
        // Collect a run of non-stable interstitials, then test for next transport.
        let k = j;
        const interstitials: PresenceDayBlock[] = [];
        while (k < timeline.length && isTransportInterstitial(timeline[k])) {
          interstitials.push(timeline[k]);
          k += 1;
        }
        const after = k < timeline.length ? timeline[k] : null;
        if (after && after.kind === 'transport') {
          for (const it of interstitials) suppressed.push(it);
          run.push(after);
          j = k + 1;
          continue;
        }
        break;
      }
      out.push(mergeTransport(newId, run, suppressed));
      i = j;
      continue;
    }

    // ── Unknown_place merge by proximity (250 m + bridges) ────────────────
    if (b.kind === 'unknown_place') {
      const anchors: PresenceDayBlock[] = [b];
      const suppressed: PresenceDayBlock[] = [];
      let j = i + 1;
      while (j < timeline.length) {
        let k = j;
        const localBridges: PresenceDayBlock[] = [];
        while (k < timeline.length && isUnknownBridge(timeline[k])) {
          localBridges.push(timeline[k]);
          k += 1;
        }
        const after = k < timeline.length ? timeline[k] : null;
        if (
          after &&
          after.kind === 'unknown_place' &&
          unknownsWithin(anchors[anchors.length - 1], after, UNKNOWN_MERGE_DISTANCE_M)
        ) {
          for (const br of localBridges) suppressed.push(br);
          anchors.push(after);
          j = k + 1;
          continue;
        }
        break;
      }
      out.push(mergeUnknown(newId, anchors, suppressed));
      i = j;
      continue;
    }

    // ── signal_gap / uncertain_transition → passthrough (rebadge id) ──────
    out.push({ ...b, id: newId(b.kind) });
    i += 1;
  }

  // Re-insert timer markers and sort.
  for (const m of markers) out.push({ ...m, id: `pdb-agg-timer-${seq++}` });
  out.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  return out;
}

function sameTarget(a: PresenceDayBlock, b: PresenceDayBlock): boolean {
  return (
    !!a.targetId &&
    !!b.targetId &&
    a.targetId === b.targetId &&
    (a.targetType ?? '') === (b.targetType ?? '')
  );
}

function isBridgeAllowed(b: PresenceDayBlock): boolean {
  if (b.kind === 'transport') return b.durationMinutes < BRIDGE_TRANSPORT_MAX_MIN;
  if (b.kind === 'unknown_place') return b.durationMinutes < BRIDGE_UNKNOWN_MAX_MIN;
  if (b.kind === 'signal_gap') return b.durationMinutes < BRIDGE_SIGNAL_GAP_MAX_MIN;
  return false;
}

function isUnknownBridge(b: PresenceDayBlock): boolean {
  // Bridges allowed BETWEEN two unknown_place anchors (within 250 m). Must be
  // short and never represent a stable stop or actual stay elsewhere.
  if (b.kind === 'transport') return b.durationMinutes < BRIDGE_TRANSPORT_MAX_MIN;
  if (b.kind === 'signal_gap') return b.durationMinutes < BRIDGE_SIGNAL_GAP_MAX_MIN;
  if (b.kind === 'unknown_place' && b.confidence === 'low') return b.durationMinutes < BRIDGE_UNKNOWN_MAX_MIN;
  return false;
}

function isTransportInterstitial(b: PresenceDayBlock): boolean {
  // Non-stable junk between two real transport segments. NEVER absorbs a
  // stable stop (confirmed/probable_on_site > 5 min, unknown_place ≥ 5 min).
  if (b.kind === 'transport') return true; // chain naturally
  if (b.kind === 'unknown_place') return b.durationMinutes < STABLE_STOP_MIN_MIN;
  if (b.kind === 'signal_gap') return b.durationMinutes < BRIDGE_SIGNAL_GAP_MAX_MIN;
  return false;
}

function unknownsWithin(
  a: PresenceDayBlock,
  b: PresenceDayBlock,
  maxMeters: number,
): boolean {
  const aLat = a.evidence.centerLat;
  const aLng = a.evidence.centerLng;
  const bLat = b.evidence.centerLat;
  const bLng = b.evidence.centerLng;
  if (aLat == null || aLng == null || bLat == null || bLng == null) {
    // Fall back to time-adjacency only if no coords (legacy behaviour).
    const gapMin = Math.max(0, (Date.parse(b.startAt) - Date.parse(a.endAt)) / 60000);
    return gapMin <= 5;
  }
  return haversineM(aLat, aLng, bLat, bLng) <= maxMeters;
}

function mergeOnSite(
  newId: (k: PresenceBlockKind) => string,
  members: PresenceDayBlock[],
  suppressed: PresenceDayBlock[],
): PresenceDayBlock {
  const first = members[0];
  const last = members[members.length - 1];
  const startAt = first.startAt;
  const endAt = last.endAt;
  const dur = durationMinutes(startAt, endAt);
  const anyProbable = members.some((m) => m.kind === 'probable_on_site');
  const suppressedSignalGapMin = suppressed
    .filter((s) => s.kind === 'signal_gap')
    .reduce((acc, s) => acc + s.durationMinutes, 0);
  const suppressedSignalGapCount = suppressed.filter((s) => s.kind === 'signal_gap').length;
  const hasGapEvidence = anyProbable || suppressedSignalGapMin > 0;

  const kind: PresenceBlockKind = hasGapEvidence ? 'probable_on_site' : 'confirmed_on_site';
  const confidence: PresenceConfidence = hasGapEvidence ? 'medium' : 'high';

  const totalSignalGap =
    suppressedSignalGapMin +
    members.reduce((acc, m) => acc + (m.signalGapMinutes ?? m.evidence.signalGapMinutes ?? 0), 0);
  const totalSignalGapCount =
    suppressedSignalGapCount +
    members.reduce((acc, m) => acc + (m.signalGapCount ?? 0), 0);

  const suppressedKinds: Record<string, number> = {};
  for (const s of suppressed) suppressedKinds[s.kind] = (suppressedKinds[s.kind] ?? 0) + 1;

  const reviewState: PresenceReviewState =
    hasGapEvidence && totalSignalGap >= 15 ? 'needs_review' : 'ok';

  return {
    id: newId(kind),
    kind,
    startAt,
    endAt,
    durationMinutes: dur,
    durationLabel: formatDurationLabel(dur),
    targetType: first.targetType,
    targetId: first.targetId,
    targetLabel: first.targetLabel,
    confidence,
    confidenceReason: hasGapEvidence
      ? `Sammanslagen vistelse på samma plats (${members.length} delar, ${totalSignalGapCount} GPS-glapp ≈ ${totalSignalGap} min)`
      : `Bekräftad sammanhängande vistelse (${members.length} delar)`,
    reviewState,
    evidence: {
      pingCount: members.reduce((a, m) => a + (m.evidence.pingCount ?? 0), 0),
      signalGapMinutes: totalSignalGap || undefined,
      mergedBlockCount: members.length,
      suppressedKinds: Object.keys(suppressedKinds).length ? suppressedKinds : undefined,
      surroundingTargetLabels: {
        before: first.evidence.surroundingTargetLabels?.before ?? null,
        after: last.evidence.surroundingTargetLabels?.after ?? null,
      },
    },
    sourceSegmentIds: members.flatMap((m) => m.sourceSegmentIds),
    hiddenRawSegmentIds: [
      ...members.flatMap((m) => m.hiddenRawSegmentIds),
      ...suppressed.flatMap((s) => s.sourceSegmentIds),
    ],
    signalGapMinutes: totalSignalGap || 0,
    signalGapCount: totalSignalGapCount,
    suppressedSegments: suppressed.map((s) => s.id),
  };
}

function mergeTransport(
  newId: (k: PresenceBlockKind) => string,
  run: PresenceDayBlock[],
  suppressed: PresenceDayBlock[] = [],
): PresenceDayBlock {
  if (run.length === 1 && suppressed.length === 0) {
    return { ...run[0], id: newId('transport') };
  }
  const first = run[0];
  const last = run[run.length - 1];
  const startAt = first.startAt;
  const endAt = last.endAt;
  const dur = durationMinutes(startAt, endAt);
  // Distance/avgKmh come ONLY from real travel evidence — never from gap/jitter.
  const distance = run.reduce((a, m) => a + (m.evidence.distanceMeters ?? 0), 0);
  const pings = run.reduce((a, m) => a + (m.evidence.pingCount ?? 0), 0);
  const movementMin = run.reduce((a, m) => a + m.durationMinutes, 0);
  const avgKmh = movementMin > 0 ? Math.round((distance / 1000) / (movementMin / 60) * 10) / 10 : 0;
  const suppressedKinds: Record<string, number> = {};
  for (const s of suppressed) suppressedKinds[s.kind] = (suppressedKinds[s.kind] ?? 0) + 1;
  const suppressedSignalGapMin = suppressed
    .filter((s) => s.kind === 'signal_gap')
    .reduce((a, s) => a + s.durationMinutes, 0);
  return {
    id: newId('transport'),
    kind: 'transport',
    startAt,
    endAt,
    durationMinutes: dur,
    durationLabel: formatDurationLabel(dur),
    targetType: null,
    targetId: null,
    targetLabel: 'Transport',
    confidence: 'high',
    confidenceReason: `Sammanslagen rörelse (${run.length} segment${suppressed.length ? `, ${suppressed.length} broar` : ''})`,
    reviewState: 'ok',
    evidence: {
      pingCount: pings,
      distanceMeters: Math.round(distance),
      avgKmh,
      mergedBlockCount: run.length,
      signalGapMinutes: suppressedSignalGapMin || undefined,
      suppressedKinds: Object.keys(suppressedKinds).length ? suppressedKinds : undefined,
    },
    sourceSegmentIds: run.flatMap((m) => m.sourceSegmentIds),
    hiddenRawSegmentIds: [
      ...run.flatMap((m) => m.hiddenRawSegmentIds),
      ...suppressed.flatMap((s) => s.sourceSegmentIds),
    ],
    signalGapMinutes: suppressedSignalGapMin || 0,
    signalGapCount: suppressed.filter((s) => s.kind === 'signal_gap').length,
    suppressedSegments: suppressed.map((s) => s.id),
  };
}

function mergeUnknown(
  newId: (k: PresenceBlockKind) => string,
  anchors: PresenceDayBlock[],
  suppressed: PresenceDayBlock[] = [],
): PresenceDayBlock {
  if (anchors.length === 1 && suppressed.length === 0) {
    return { ...anchors[0], id: newId('unknown_place') };
  }
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const startAt = first.startAt;
  const endAt = last.endAt;
  const dur = durationMinutes(startAt, endAt);
  const pings = anchors.reduce((a, m) => a + (m.evidence.pingCount ?? 0), 0);

  const coords = anchors
    .map((a) => ({ lat: a.evidence.centerLat, lng: a.evidence.centerLng }))
    .filter((c): c is { lat: number; lng: number } => c.lat != null && c.lng != null);
  let centerLat: number | null = null;
  let centerLng: number | null = null;
  let maxDist = 0;
  if (coords.length > 0) {
    centerLat = coords.reduce((a, c) => a + c.lat, 0) / coords.length;
    centerLng = coords.reduce((a, c) => a + c.lng, 0) / coords.length;
    for (let a = 0; a < coords.length; a++) {
      for (let b = a + 1; b < coords.length; b++) {
        const d = haversineM(coords[a].lat, coords[a].lng, coords[b].lat, coords[b].lng);
        if (d > maxDist) maxDist = d;
      }
    }
  }

  const suppressedKinds: Record<string, number> = {};
  for (const s of suppressed) suppressedKinds[s.kind] = (suppressedKinds[s.kind] ?? 0) + 1;
  const suppressedSignalGapMin = suppressed
    .filter((s) => s.kind === 'signal_gap')
    .reduce((a, s) => a + s.durationMinutes, 0);

  // Engine 4 — preserve privateResidence flag if EVERY anchor is private.
  // (Mixed runs keep the default unknown_place treatment so a real "okänd
  // plats" never gets silently hidden by an adjacent boende anchor.)
  const allPrivate = anchors.length > 0 && anchors.every(
    (a) => (a.evidence as any)?.privateResidence === true,
  );
  const firstPrivateLabel = allPrivate
    ? ((anchors[0].evidence as any)?.privateResidenceLabel ?? null)
    : null;
  const firstPrivateTargetId = allPrivate
    ? ((anchors[0].evidence as any)?.privateResidenceTargetId ?? null)
    : null;

  return {
    id: newId('unknown_place'),
    kind: 'unknown_place',
    startAt,
    endAt,
    durationMinutes: dur,
    durationLabel: formatDurationLabel(dur),
    targetType: null,
    targetId: null,
    targetLabel: allPrivate
      ? (firstPrivateLabel ? `Boende: ${firstPrivateLabel}` : 'Boende')
      : 'Okänd plats',
    confidence: 'medium',
    confidenceReason: allPrivate
      ? `Sammanslagen privat boende-vistelse (${anchors.length} delar)`
      : `Sammanslagen okänd plats (${anchors.length} delar${suppressed.length ? `, ${suppressed.length} broar` : ''}, max ${Math.round(maxDist)} m)`,
    reviewState: allPrivate ? 'ok' : 'needs_review',
    evidence: {
      pingCount: pings,
      mergedBlockCount: anchors.length,
      centerLat,
      centerLng,
      maxDistanceMeters: Math.round(maxDist),
      signalGapMinutes: suppressedSignalGapMin || undefined,
      suppressedKinds: Object.keys(suppressedKinds).length ? suppressedKinds : undefined,
      ...(allPrivate
        ? {
            privateResidence: true,
            privateResidenceTargetId: firstPrivateTargetId,
            privateResidenceLabel: firstPrivateLabel,
          }
        : {}),
    },
    sourceSegmentIds: anchors.flatMap((m) => m.sourceSegmentIds),
    hiddenRawSegmentIds: [
      ...anchors.flatMap((m) => m.hiddenRawSegmentIds),
      ...suppressed.flatMap((s) => s.sourceSegmentIds),
    ],
    signalGapMinutes: suppressedSignalGapMin || 0,
    signalGapCount: suppressed.filter((s) => s.kind === 'signal_gap').length,
    suppressedSegments: suppressed.map((s) => s.id),
  };
}
