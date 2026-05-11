// @ts-nocheck
/**
 * Time Engine — findCompanionRouteEvidence
 * ────────────────────────────────────────
 *
 * Pure helper. Given a GPS gap on one staff member's day, look at OTHER staff
 * members' (peer) GPS pings during the gap window. If a peer's pings bridge
 * the same start→end position (and the peer is project/team-related), the gap
 * is treated as evidence-confirmed continued transport.
 *
 * NEVER copies peer pings into the staff's raw data. Output is evidence only.
 * Does NOT touch the database, does NOT call AI, does NOT write anything.
 */

import type { ISODateTime, UUID, WorkTarget } from './contracts.ts';
import type { GpsPing } from './buildGpsDayTimeline.ts';

const EARTH_R = 6_371_000;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export interface PeerGpsTimeline {
  staffId: UUID;
  staffName: string | null;
  pings: GpsPing[];
  /** Optional set of target keys ("kind:id") this peer is assigned to today. */
  assignedTargetKeys?: string[];
}

export interface CompanionRouteInput {
  gapStartIso: ISODateTime;
  gapEndIso: ISODateTime;
  previousKnownPosition: { lat: number; lng: number } | null;
  nextKnownPosition: { lat: number; lng: number } | null;
  previousTarget: WorkTarget | null;
  nextTarget: WorkTarget | null;
  peerGpsTimelines: PeerGpsTimeline[];
}

export interface CompanionMatchedStaff {
  staffId: UUID;
  staffName: string | null;
  overlapMinutes: number;
  coverageRatio: number;
  pingCountDuringGap: number;
  routeStartDistanceMeters: number;
  routeEndDistanceMeters: number;
  sameProjectOrTeam: boolean;
  sameDirectionLikely: boolean;
  averageSpeedKmh: number;
  matched: boolean;
}

export interface CompanionRouteEvidence {
  matched: boolean;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  confidenceScore: number;
  matchedStaffCount: number;
  matchedStaff: CompanionMatchedStaff[];
  evaluatedStaffCount: number;
  reasons: string[];
}

const ROUTE_RADIUS_M = 1000;
const MIN_COVERAGE = 0.5;
const MIN_AVG_KMH = 5;
const MAX_AVG_KMH = 130;

function targetKey(t: WorkTarget | null): string | null {
  if (!t) return null;
  return `${t.kind}:${t.refId}`;
}

function evaluatePeer(
  peer: PeerGpsTimeline,
  gapStartMs: number,
  gapEndMs: number,
  previousKnownPosition: { lat: number; lng: number } | null,
  nextKnownPosition: { lat: number; lng: number } | null,
  prevKey: string | null,
  nextKey: string | null,
): CompanionMatchedStaff {
  const gapMin = Math.max(0, (gapEndMs - gapStartMs) / 60000);
  const inGap: GpsPing[] = [];
  for (const p of peer.pings) {
    const t = Date.parse(p.ts);
    if (Number.isFinite(t) && t >= gapStartMs && t <= gapEndMs) inGap.push(p);
  }

  if (inGap.length === 0) {
    return {
      staffId: peer.staffId,
      staffName: peer.staffName,
      overlapMinutes: 0,
      coverageRatio: 0,
      pingCountDuringGap: 0,
      routeStartDistanceMeters: Number.POSITIVE_INFINITY,
      routeEndDistanceMeters: Number.POSITIVE_INFINITY,
      sameProjectOrTeam: false,
      sameDirectionLikely: false,
      averageSpeedKmh: 0,
      matched: false,
    };
  }

  // Coverage: split gap into 5-minute buckets, count buckets with at least one ping.
  const bucketMs = 5 * 60_000;
  const bucketCount = Math.max(1, Math.ceil((gapEndMs - gapStartMs) / bucketMs));
  const buckets = new Set<number>();
  for (const p of inGap) {
    const idx = Math.floor((Date.parse(p.ts) - gapStartMs) / bucketMs);
    buckets.add(idx);
  }
  const coverageRatio = Math.min(1, buckets.size / bucketCount);
  const overlapMinutes = Math.round(coverageRatio * gapMin);

  const first = inGap[0];
  const last = inGap[inGap.length - 1];
  const routeStartDistanceMeters = previousKnownPosition
    ? haversineM(previousKnownPosition.lat, previousKnownPosition.lng, first.lat, first.lng)
    : Number.POSITIVE_INFINITY;
  const routeEndDistanceMeters = nextKnownPosition
    ? haversineM(nextKnownPosition.lat, nextKnownPosition.lng, last.lat, last.lng)
    : Number.POSITIVE_INFINITY;

  // Direction check: peer end should be CLOSER to nextKnownPosition than peer start.
  let sameDirectionLikely = false;
  if (previousKnownPosition && nextKnownPosition) {
    const startToNext = haversineM(first.lat, first.lng, nextKnownPosition.lat, nextKnownPosition.lng);
    const endToNext = haversineM(last.lat, last.lng, nextKnownPosition.lat, nextKnownPosition.lng);
    sameDirectionLikely = endToNext < startToNext * 0.85;
  }

  // Distance traveled by peer in window.
  let dist = 0;
  for (let k = 1; k < inGap.length; k++) {
    dist += haversineM(inGap[k - 1].lat, inGap[k - 1].lng, inGap[k].lat, inGap[k].lng);
  }
  const peerSpanMin = Math.max(1, (Date.parse(last.ts) - Date.parse(first.ts)) / 60000);
  const averageSpeedKmh = (dist / 1000) / (peerSpanMin / 60);

  const sameProjectOrTeam =
    !!peer.assignedTargetKeys &&
    !!(prevKey && peer.assignedTargetKeys.includes(prevKey)
      || nextKey && peer.assignedTargetKeys.includes(nextKey));

  const matched =
    coverageRatio >= MIN_COVERAGE &&
    routeStartDistanceMeters <= ROUTE_RADIUS_M &&
    routeEndDistanceMeters <= ROUTE_RADIUS_M &&
    sameDirectionLikely &&
    averageSpeedKmh >= MIN_AVG_KMH &&
    averageSpeedKmh <= MAX_AVG_KMH;

  return {
    staffId: peer.staffId,
    staffName: peer.staffName,
    overlapMinutes,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    pingCountDuringGap: inGap.length,
    routeStartDistanceMeters: Math.round(routeStartDistanceMeters),
    routeEndDistanceMeters: Math.round(routeEndDistanceMeters),
    sameProjectOrTeam,
    sameDirectionLikely,
    averageSpeedKmh: Math.round(averageSpeedKmh * 10) / 10,
    matched,
  };
}

export function findCompanionRouteEvidence(input: CompanionRouteInput): CompanionRouteEvidence {
  const gapStartMs = Date.parse(input.gapStartIso);
  const gapEndMs = Date.parse(input.gapEndIso);
  const prevKey = targetKey(input.previousTarget);
  const nextKey = targetKey(input.nextTarget);

  const evaluated: CompanionMatchedStaff[] = [];
  for (const peer of input.peerGpsTimelines ?? []) {
    if (!peer.pings || peer.pings.length === 0) continue;
    evaluated.push(
      evaluatePeer(peer, gapStartMs, gapEndMs, input.previousKnownPosition, input.nextKnownPosition, prevKey, nextKey),
    );
  }

  const matched = evaluated.filter((e) => e.matched);
  const matchedCount = matched.length;
  const reasons: string[] = [];

  if (matchedCount === 0) {
    return {
      matched: false,
      confidence: 'low',
      confidenceScore: 0,
      matchedStaffCount: 0,
      matchedStaff: [],
      evaluatedStaffCount: evaluated.length,
      reasons: ['no_companion_pings_in_gap_window'],
    };
  }

  const anyProjectTeam = matched.some((m) => m.sameProjectOrTeam);
  const destinationIsWorkRelated =
    !!input.nextTarget && (input.nextTarget.kind === 'organization_location'
      || input.nextTarget.kind === 'project'
      
      || input.nextTarget.kind === 'booking');

  let confidence: CompanionRouteEvidence['confidence'] = 'medium';
  let confidenceScore = 0.7;

  if (matchedCount >= 2) {
    confidence = 'very_high';
    confidenceScore = 0.95;
    reasons.push('multi_staff_route_confirmation');
  } else if (matchedCount === 1 && destinationIsWorkRelated) {
    confidence = 'very_high';
    confidenceScore = 0.95;
    reasons.push('single_companion_plus_work_destination');
  } else if (matchedCount >= 1 && anyProjectTeam) {
    confidence = 'high';
    confidenceScore = 0.9;
    reasons.push('companion_with_project_or_team_link');
  } else {
    confidence = 'medium';
    confidenceScore = 0.7;
    reasons.push('companion_geographic_only');
  }

  return {
    matched: true,
    confidence,
    confidenceScore,
    matchedStaffCount: matchedCount,
    matchedStaff: matched,
    evaluatedStaffCount: evaluated.length,
    reasons,
  };
}
