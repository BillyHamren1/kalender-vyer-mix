/**
 * Time Engine — buildLocationTruthTimeline (Location Truth 1.2)
 * =============================================================
 *
 * Pure builder that answers ONE question: "Where was the person over time?"
 *
 * This layer is INTENTIONALLY ignorant of:
 *   - work / payable time
 *   - active timers (active_time_registrations)
 *   - workdays / time_reports / location_time_entries / travel_time_logs
 *   - day_attestations / submissions / approvals
 *   - AI / review / corrections
 *
 * It only matches GPS evidence against known places. Output is a sequence of
 * `LocationTruthSegment`s describing the person's physical location through
 * the day.
 *
 * STRICT INPUT POLICY — only:
 *   - gpsPings
 *   - resolvedTargets (work targets — projects/bookings/warehouses/locations)
 *   - locations (extra org locations not necessarily PRIMARY)
 *   - privateResidenceLocations (boende polygons / circles)
 *   - assignments (date-relevant project/booking/large_project anchors)
 *   - stockholmDayWindow (UTC day boundaries)
 *
 * It MUST NOT read or write the database. It is a pure transform.
 *
 * Per-ping priority order (Location Truth):
 *   1. private_residence (inside polygon/radius — wins always)
 *   2. exact polygon/radius match against project/booking/location/warehouse
 *   3. assigned/date-relevant project/booking/large_project (when overlapping)
 *   4. 150 m tolerance for the currently active session's target
 *      (sticky continuation — never originates a new place)
 *   5. nearest work-related target (debug only — match.matchReason='nearest_debug')
 *   6. unknown_place
 *
 * Team labels are NEVER used as a place name. `targetLabel` is taken from
 * project/booking/location source — not from team_calendar_event titles.
 */

import { isInsideGeofence, distanceToGeofenceEdge, haversine, type GeofenceTarget } from '../geofenceEval.ts';
import type { Confidence, ISODate, ISODateTime, UUID, WorkTarget } from './contracts.ts';

/**
 * Location Truth 1.3 — work-area tolerance constant.
 * A person may drift up to this many meters outside an *already active*
 * project/warehouse session and still count as inside the same work area.
 *
 * STRICT USAGE — tolerance MAY:
 *   - continue an existing session (sticky)
 *   - absorb GPS jitter
 *   - cover small movement around the project/warehouse
 *
 * Tolerance MUST NOT:
 *   - start a new workday
 *   - originate a new place
 *   - turn private_residence into work
 *   - extend a session past dayEnd
 *   - merge private_residence and warehouse
 *   - replace the correct project/booking name
 */
export const WORK_AREA_TOLERANCE_METERS = 150;

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

export interface LocationTruthGpsPing {
  /** Stable id for the ping. If absent, the index is used. */
  id?: string;
  ts: ISODateTime;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedMps?: number | null;
}

export interface LocationTruthAssignment {
  /** Anchor type — drives match priority bump. */
  targetType: 'project' | 'booking' | 'large_project' | 'location' | 'warehouse';
  targetId: UUID;
  /** Optional id of the assignment row (booking_staff_assignments / staff_assignments). */
  assignmentId?: UUID | null;
  /** Date-relevance window. When omitted, assignment is assumed to apply to the day. */
  validFrom?: ISODateTime | null;
  validUntil?: ISODateTime | null;
}

export interface LocationTruthExtraLocation {
  /** organization_locations.id. */
  id: UUID;
  label: string;
  kind: 'warehouse' | 'organization_location';
  center: { lat: number; lng: number };
  radiusM: number;
  polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
}

export interface LocationTruthPrivateResidence {
  /** staff_inferred_home_locations.id or staff_private_zones.id. */
  id: UUID;
  label: string | null;
  center: { lat: number; lng: number };
  radiusM: number;
  polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
}

export interface LocationTruthDayWindow {
  startUtc: ISODateTime;
  endUtc: ISODateTime;
}

export interface BuildLocationTruthTimelineInput {
  staffId: UUID;
  organizationId?: UUID;
  date: ISODate;
  gpsPings: LocationTruthGpsPing[];
  resolvedTargets: WorkTarget[];
  locations?: LocationTruthExtraLocation[];
  privateResidenceLocations?: LocationTruthPrivateResidence[];
  assignments?: LocationTruthAssignment[];
  stockholmDayWindow: LocationTruthDayWindow;
  policy?: BuildLocationTruthPolicy;
}

export interface BuildLocationTruthPolicy {
  /** Max gap between pings before a `signal_gap` segment is emitted (default 600 s). */
  maxPingIntervalSeconds?: number;
  /** Max ping-to-ping displacement to remain in the same stationary cluster (default 75 m). */
  stayClusterRadiusM?: number;
  /** Min consecutive pings to declare a stationary segment (default 2). */
  minStayPings?: number;
  /** Tolerance outside a primary target's geofence edge for a sticky continuation (default 150 m). */
  stickyToleranceM?: number;
  /** Min displacement between two stays before we count it as movement (default 100 m). */
  movementMinDisplacementM?: number;
  /** Speed (km/h) above which a ping is movement (default 4). */
  movementSpeedKmh?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────────────────────────────────────────

export type LocationTruthSegmentKind =
  | 'known_location'
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'private_residence'
  | 'unknown_place'
  | 'movement'
  | 'signal_gap';

export interface LocationTruthSegment {
  id: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  kind: LocationTruthSegmentKind;
  label: string;
  targetId: UUID | null;
  targetType: string | null;
  locationId: UUID | null;
  projectId: UUID | null;
  bookingId: UUID | null;
  largeProjectId: UUID | null;
  assignmentId: UUID | null;
  confidence: Confidence;
  confidenceReasons: string[];
  sourcePingIds: string[];
  centerLat: number | null;
  centerLng: number | null;
  distanceToTargetMeters: number | null;
  insidePolygon: boolean | null;
  withinTolerance: boolean;
  signalGapMinutes: number;
  signalGapCount: number;
  rawEvidence: {
    pingCount: number;
    matchReason: PingMatchReason | null;
    matchedByTolerance: boolean;
  };
}

export type PingMatchReason =
  | 'private_residence_inside'
  | 'work_target_inside'
  | 'assigned_target_inside'
  | 'sticky_tolerance'
  | 'nearest_debug'
  | 'unknown';

export interface PingMatch {
  pingId: string;
  ts: ISODateTime;
  matchedPlaceKind: LocationTruthSegmentKind;
  matchedPlaceLabel: string;
  matchedTargetId: UUID | null;
  matchedTargetType: string | null;
  matchConfidence: Confidence;
  matchReason: PingMatchReason;
  matchedByTolerance: boolean;
  insidePolygon: boolean;
  distanceToTargetMeters: number | null;
}

export interface LocationPingMatchDiagnostics {
  totalPings: number;
  matchedPrivateResidenceCount: number;
  matchedWarehouseCount: number;
  matchedProjectCount: number;
  matchedBookingCount: number;
  matchedLocationCount: number;
  matchedByToleranceCount: number;
  unknownPingCount: number;
  examples: Array<{
    ts: ISODateTime;
    matchedPlaceKind: LocationTruthSegmentKind;
    matchedPlaceLabel: string;
    matchReason: PingMatchReason;
    matchedByTolerance: boolean;
    distanceToTargetMeters: number | null;
  }>;
}

/**
 * Location Truth 1.3 — private_residence override accounting.
 * Counts how often the boende rule shadowed a would-have-matched warehouse,
 * project, or 150 m tolerance hit.
 */
export interface PrivateResidenceMatchDiagnostics {
  pingsInsideResidence: number;
  residenceOverrodeWarehouseCount: number;
  residenceOverrodeProjectCount: number;
  residenceBlockedToleranceCount: number;
  examples: Array<{
    ts: ISODateTime;
    residenceLabel: string;
    overrode: Array<'warehouse' | 'project' | 'booking' | 'location' | 'tolerance'>;
  }>;
}

/**
 * Location Truth 1.3 — 150 m work-area tolerance accounting.
 * Tracks where tolerance fired vs. where it was deliberately suppressed.
 */
export interface WorkAreaToleranceDiagnostics {
  toleranceMeters: number;
  continuedSessionByToleranceCount: number;
  blockedByPrivateResidenceCount: number;
  blockedBecauseNoActiveSessionCount: number;
  blockedAfterDayEndCount: number;
  examples: Array<{
    ts: ISODateTime;
    outcome: 'continued' | 'blocked_private_residence' | 'blocked_no_active_session' | 'blocked_after_day_end';
    candidateLabel: string | null;
    candidateTargetType: string | null;
    distanceToEdgeM: number | null;
  }>;
}

export interface LocationTruthDiagnostics {
  staffId: UUID;
  date: ISODate;
  inputPingCount: number;
  segmentCount: number;
  signalGapSegmentCount: number;
  movementSegmentCount: number;
  unknownPlaceSegmentCount: number;
  knownPlaceSegmentCount: number;
  privateResidenceSegmentCount: number;
  policy: Required<BuildLocationTruthPolicy>;
  pingMatch: LocationPingMatchDiagnostics;
  privateResidenceMatch: PrivateResidenceMatchDiagnostics;
  workAreaTolerance: WorkAreaToleranceDiagnostics;
}

export interface BuildLocationTruthTimelineResult {
  locationTruthSegments: LocationTruthSegment[];
  diagnostics: LocationTruthDiagnostics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_POLICY: Required<BuildLocationTruthPolicy> = {
  maxPingIntervalSeconds: 600,
  stayClusterRadiusM: 75,
  minStayPings: 2,
  stickyToleranceM: 150,
  movementMinDisplacementM: 100,
  movementSpeedKmh: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal candidate (unifies WorkTarget / extra location / private residence)
// ─────────────────────────────────────────────────────────────────────────────

interface PlaceCandidate {
  /** Stable engine key. */
  key: string;
  /** Canonical kind for the OUTPUT segment. */
  segmentKind: LocationTruthSegmentKind;
  /** Source target type string (mirror of WorkTargetKind / 'private_residence' / 'organization_location'). */
  targetType: string;
  refId: UUID;
  label: string;
  center: { lat: number; lng: number };
  radiusM: number;
  polygon: { type: 'Polygon'; coordinates: number[][][] } | null;
  isPrivateResidence: boolean;
  /** True when this candidate is also among the staff's date-relevant assignments. */
  isAssigned: boolean;
  assignmentId: UUID | null;
  validFrom: number | null;
  validUntil: number | null;
}

function asGeofenceTarget(c: PlaceCandidate): GeofenceTarget {
  return {
    latitude: c.center.lat,
    longitude: c.center.lng,
    radius_meters: c.radiusM,
    geofence_mode: c.polygon ? 'polygon' : 'circle',
    geofence_polygon: c.polygon ?? null,
  };
}

/**
 * Determine the OUTPUT segment kind from a WorkTarget.
 * Team labels are NEVER segment kinds — only project/booking/warehouse/location.
 */
function workTargetSegmentKind(t: WorkTarget): LocationTruthSegmentKind {
  if (t.isPrivateResidence) return 'private_residence';
  switch (t.kind) {
    case 'project':
      return 'project';
    case 'booking':
      return 'booking';
    case 'warehouse':
      return 'warehouse';
    case 'organization_location':
      return 'known_location';
    default:
      return 'known_location';
  }
}

function buildCandidates(input: BuildLocationTruthTimelineInput): PlaceCandidate[] {
  const out: PlaceCandidate[] = [];
  const seen = new Set<string>();

  const assignmentByKey = new Map<string, LocationTruthAssignment>();
  for (const a of input.assignments ?? []) {
    assignmentByKey.set(`${a.targetType}:${a.targetId}`, a);
  }

  // 1. resolvedTargets — drives both place matching AND label resolution.
  for (const t of input.resolvedTargets ?? []) {
    const key = `wt:${t.kind}:${t.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const assignKey = `${t.kind}:${t.refId}`;
    const assignment = assignmentByKey.get(assignKey) ?? null;
    out.push({
      key,
      segmentKind: workTargetSegmentKind(t),
      targetType: t.isPrivateResidence ? 'private_residence' : t.kind,
      refId: t.refId,
      label: t.label,
      center: t.center,
      radiusM: t.radiusM,
      polygon: t.polygon ?? null,
      isPrivateResidence: !!t.isPrivateResidence,
      isAssigned: !!assignment,
      assignmentId: assignment?.assignmentId ?? null,
      validFrom: t.validFrom ? Date.parse(t.validFrom) : null,
      validUntil: t.validUntil ? Date.parse(t.validUntil) : null,
    });
  }

  // 2. extra locations — only added if not already covered by a resolvedTarget.
  for (const l of input.locations ?? []) {
    const key = `loc:${l.id}`;
    if (seen.has(key) || seen.has(`wt:organization_location:${l.id}`) || seen.has(`wt:warehouse:${l.id}`)) continue;
    seen.add(key);
    out.push({
      key,
      segmentKind: l.kind === 'warehouse' ? 'warehouse' : 'known_location',
      targetType: l.kind,
      refId: l.id,
      label: l.label,
      center: l.center,
      radiusM: l.radiusM,
      polygon: l.polygon ?? null,
      isPrivateResidence: false,
      isAssigned: false,
      assignmentId: null,
      validFrom: null,
      validUntil: null,
    });
  }

  // 3. private residences — always present, always WIN over work targets.
  for (const r of input.privateResidenceLocations ?? []) {
    const key = `pr:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      segmentKind: 'private_residence',
      targetType: 'private_residence',
      refId: r.id,
      label: r.label ?? 'Boende',
      center: r.center,
      radiusM: r.radiusM,
      polygon: r.polygon ?? null,
      isPrivateResidence: true,
      isAssigned: false,
      assignmentId: null,
      validFrom: null,
      validUntil: null,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-ping matching
// ─────────────────────────────────────────────────────────────────────────────

interface MatchOptions {
  candidates: PlaceCandidate[];
  stickyKey: string | null;
  stickyToleranceM: number;
}

/**
 * Match a single ping against candidates using the Location Truth priority.
 * `stickyKey` is the previous segment's place key (used for tolerance bonus).
 */
function matchPing(
  pingId: string,
  ts: ISODateTime,
  lat: number,
  lng: number,
  opts: MatchOptions,
): PingMatch {
  const at = Date.parse(ts);

  // Filter candidates to those valid at `at`.
  const valid = opts.candidates.filter((c) => {
    if (c.validFrom != null && c.validFrom > at) return false;
    if (c.validUntil != null && c.validUntil < at) return false;
    return true;
  });

  // 1) private_residence — inside ONLY (never tolerance).
  for (const c of valid) {
    if (!c.isPrivateResidence) continue;
    const inside = isInsideGeofence(lat, lng, asGeofenceTarget(c));
    if (inside) {
      return {
        pingId,
        ts,
        matchedPlaceKind: 'private_residence',
        matchedPlaceLabel: c.label,
        matchedTargetId: c.refId,
        matchedTargetType: 'private_residence',
        matchConfidence: 1,
        matchReason: 'private_residence_inside',
        matchedByTolerance: false,
        insidePolygon: true,
        distanceToTargetMeters: 0,
      };
    }
  }

  // 2) exact polygon/radius match — pick nearest center among work targets where ping is inside.
  let bestInside: { c: PlaceCandidate; d: number } | null = null;
  // 3) assigned target inside — promoted over plain work-target inside via priority bump.
  let bestInsideAssigned: { c: PlaceCandidate; d: number } | null = null;
  // 4) sticky tolerance candidate (only the prior session's target).
  let stickyCandidate: { c: PlaceCandidate; outsideM: number; insideEdge: boolean } | null = null;
  // 5) nearest work-related target (debug fallback).
  let nearestWork: { c: PlaceCandidate; d: number } | null = null;

  for (const c of valid) {
    if (c.isPrivateResidence) continue;
    const gf = asGeofenceTarget(c);
    const inside = isInsideGeofence(lat, lng, gf);
    const centerD = haversine(lat, lng, c.center.lat, c.center.lng);

    if (nearestWork == null || centerD < nearestWork.d) {
      nearestWork = { c, d: centerD };
    }

    if (inside) {
      if (c.isAssigned) {
        if (bestInsideAssigned == null || centerD < bestInsideAssigned.d) {
          bestInsideAssigned = { c, d: centerD };
        }
      }
      if (bestInside == null || centerD < bestInside.d) {
        bestInside = { c, d: centerD };
      }
      continue;
    }

    // Sticky tolerance — only when this candidate IS the previous segment's place.
    // stickyKey uses the same shape as pingMatchKey: `${targetType}:${refId}`.
    if (opts.stickyKey && `${c.targetType}:${c.refId}` === opts.stickyKey) {
      const signed = distanceToGeofenceEdge(lat, lng, gf);
      const outsideM = -signed;
      if (outsideM <= opts.stickyToleranceM) {
        stickyCandidate = { c, outsideM, insideEdge: false };
      }
    }
  }

  // Priority resolution.
  const winnerInside = bestInsideAssigned ?? bestInside;
  if (winnerInside) {
    const c = winnerInside.c;
    return {
      pingId,
      ts,
      matchedPlaceKind: c.segmentKind,
      matchedPlaceLabel: c.label,
      matchedTargetId: c.refId,
      matchedTargetType: c.targetType,
      matchConfidence: c.isAssigned ? 1 : 0.9,
      matchReason: c.isAssigned ? 'assigned_target_inside' : 'work_target_inside',
      matchedByTolerance: false,
      insidePolygon: true,
      distanceToTargetMeters: Math.round(winnerInside.d),
    };
  }

  if (stickyCandidate) {
    const c = stickyCandidate.c;
    return {
      pingId,
      ts,
      matchedPlaceKind: c.segmentKind,
      matchedPlaceLabel: c.label,
      matchedTargetId: c.refId,
      matchedTargetType: c.targetType,
      matchConfidence: 0.6,
      matchReason: 'sticky_tolerance',
      matchedByTolerance: true,
      insidePolygon: false,
      distanceToTargetMeters: Math.round(haversine(lat, lng, c.center.lat, c.center.lng)),
    };
  }

  // 5) nearest_debug — kept ONLY as diagnostic on the ping match. Does NOT
  //    by itself promote the ping into a known place segment; the ping is
  //    classified as 'unknown' below. Callers can inspect rawEvidence.
  if (nearestWork) {
    return {
      pingId,
      ts,
      matchedPlaceKind: 'unknown_place',
      matchedPlaceLabel: 'Okänd plats',
      matchedTargetId: null,
      matchedTargetType: null,
      matchConfidence: 0.2,
      matchReason: 'nearest_debug',
      matchedByTolerance: false,
      insidePolygon: false,
      distanceToTargetMeters: Math.round(nearestWork.d),
    };
  }

  return {
    pingId,
    ts,
    matchedPlaceKind: 'unknown_place',
    matchedPlaceLabel: 'Okänd plats',
    matchedTargetId: null,
    matchedTargetType: null,
    matchConfidence: 0.1,
    matchReason: 'unknown',
    matchedByTolerance: false,
    insidePolygon: false,
    distanceToTargetMeters: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

interface PingRow {
  id: string;
  ts: string;
  tsMs: number;
  lat: number;
  lng: number;
  speedMps: number | null;
  match: PingMatch;
}

function uid(prefix: string, i: number): string {
  return `${prefix}_${i.toString(36)}`;
}

function pingMatchKey(m: PingMatch): string | null {
  // Ping group key: same place id+kind, OR null for unknown/movement-likely.
  if (m.matchReason === 'unknown' || m.matchReason === 'nearest_debug') return null;
  if (!m.matchedTargetId) return null;
  return `${m.matchedTargetType}:${m.matchedTargetId}`;
}

export function buildLocationTruthTimeline(
  input: BuildLocationTruthTimelineInput,
): BuildLocationTruthTimelineResult {
  const policy: Required<BuildLocationTruthPolicy> = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  const candidates = buildCandidates(input);

  const dayStartMs = Date.parse(input.stockholmDayWindow.startUtc);
  const dayEndMs = Date.parse(input.stockholmDayWindow.endUtc);

  // Sort + clamp pings to day window.
  const pings: PingRow[] = (input.gpsPings ?? [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p, idx) => {
      const id = p.id ?? `p${idx}`;
      const tsMs = Date.parse(p.ts);
      return { id, ts: p.ts, tsMs, lat: Number(p.lat), lng: Number(p.lng), speedMps: p.speedMps ?? null, match: null as unknown as PingMatch };
    })
    .filter((p) => Number.isFinite(p.tsMs) && p.tsMs >= dayStartMs && p.tsMs <= dayEndMs)
    .sort((a, b) => a.tsMs - b.tsMs);

  // Sticky-aware matching: walk pings forward, carrying the previous "place key".
  let stickyKey: string | null = null;
  for (const p of pings) {
    p.match = matchPing(p.id, p.ts, p.lat, p.lng, {
      candidates,
      stickyKey,
      stickyToleranceM: policy.stickyToleranceM,
    });
    const k = pingMatchKey(p.match);
    if (k) stickyKey = k;
    // Note: unknown/nearest_debug doesn't reset sticky — caller may have lost
    // signal momentarily. Sticky is reset only when a NEW non-null key wins.
  }

  // Diagnostics (per-ping).
  const pingDiag: LocationPingMatchDiagnostics = {
    totalPings: pings.length,
    matchedPrivateResidenceCount: 0,
    matchedWarehouseCount: 0,
    matchedProjectCount: 0,
    matchedBookingCount: 0,
    matchedLocationCount: 0,
    matchedByToleranceCount: 0,
    unknownPingCount: 0,
    examples: [],
  };
  for (const p of pings) {
    const m = p.match;
    if (m.matchedByTolerance) pingDiag.matchedByToleranceCount += 1;
    switch (m.matchedPlaceKind) {
      case 'private_residence': pingDiag.matchedPrivateResidenceCount += 1; break;
      case 'warehouse': pingDiag.matchedWarehouseCount += 1; break;
      case 'project': pingDiag.matchedProjectCount += 1; break;
      case 'booking': pingDiag.matchedBookingCount += 1; break;
      case 'known_location': pingDiag.matchedLocationCount += 1; break;
      case 'unknown_place': pingDiag.unknownPingCount += 1; break;
      default: break;
    }
    if (pingDiag.examples.length < 20) {
      pingDiag.examples.push({
        ts: m.ts,
        matchedPlaceKind: m.matchedPlaceKind,
        matchedPlaceLabel: m.matchedPlaceLabel,
        matchReason: m.matchReason,
        matchedByTolerance: m.matchedByTolerance,
        distanceToTargetMeters: m.distanceToTargetMeters,
      });
    }
  }

  // Build segments.
  const segments: LocationTruthSegment[] = [];
  let segIdx = 0;

  if (pings.length === 0) {
    return {
      locationTruthSegments: [],
      diagnostics: makeDiag(input, policy, segments, pingDiag),
    };
  }

  // Helper: emit signal_gap between two timestamps when delta exceeds policy.
  const tryEmitGap = (fromMs: number, toMs: number) => {
    const dt = (toMs - fromMs) / 1000;
    if (dt <= policy.maxPingIntervalSeconds) return;
    segments.push({
      id: uid('gap', segIdx++),
      startAt: new Date(fromMs).toISOString(),
      endAt: new Date(toMs).toISOString(),
      kind: 'signal_gap',
      label: 'GPS-signal saknas',
      targetId: null, targetType: null, locationId: null, projectId: null, bookingId: null,
      largeProjectId: null, assignmentId: null,
      confidence: 0.2,
      confidenceReasons: ['gps_gap_exceeded_policy'],
      sourcePingIds: [],
      centerLat: null, centerLng: null, distanceToTargetMeters: null,
      insidePolygon: null, withinTolerance: false,
      signalGapMinutes: Math.round((toMs - fromMs) / 60000),
      signalGapCount: 1,
      rawEvidence: { pingCount: 0, matchReason: null, matchedByTolerance: false },
    });
  };

  // Group consecutive pings into runs by `pingMatchKey` (or 'unknown' / 'movement').
  type RunKind = 'place' | 'unknown' | 'movement';
  interface Run {
    kind: RunKind;
    placeKey: string | null;
    placeCandidate: PlaceCandidate | null;
    pings: PingRow[];
  }
  const runs: Run[] = [];

  function classifyRun(p: PingRow, prev: PingRow | null): { kind: RunKind; placeKey: string | null; placeCandidate: PlaceCandidate | null } {
    const k = pingMatchKey(p.match);
    if (k) {
      const cand = candidates.find((c) => `${c.targetType}:${c.refId}` === k) ?? null;
      return { kind: 'place', placeKey: k, placeCandidate: cand };
    }
    // Unknown — decide if it's movement or stationary unknown.
    const speedKmh = p.speedMps != null ? p.speedMps * 3.6 : null;
    if (speedKmh != null && speedKmh >= policy.movementSpeedKmh) {
      return { kind: 'movement', placeKey: null, placeCandidate: null };
    }
    if (prev) {
      const d = haversine(prev.lat, prev.lng, p.lat, p.lng);
      const dt = (p.tsMs - prev.tsMs) / 1000;
      const inferredSpeed = dt > 0 ? d / dt * 3.6 : 0;
      if (d >= policy.movementMinDisplacementM && inferredSpeed >= policy.movementSpeedKmh) {
        return { kind: 'movement', placeKey: null, placeCandidate: null };
      }
    }
    return { kind: 'unknown', placeKey: null, placeCandidate: null };
  }

  let prevPing: PingRow | null = null;
  for (const p of pings) {
    if (prevPing) tryEmitGap(prevPing.tsMs, p.tsMs);
    const { kind, placeKey, placeCandidate } = classifyRun(p, prevPing);
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.kind === kind && lastRun.placeKey === placeKey) {
      lastRun.pings.push(p);
    } else {
      runs.push({ kind, placeKey, placeCandidate, pings: [p] });
    }
    prevPing = p;
  }

  // Convert runs → segments.
  for (const r of runs) {
    if (r.pings.length === 0) continue;
    const first = r.pings[0];
    const last = r.pings[r.pings.length - 1];
    // Endpoint when a single-ping run: use its own timestamp.
    const startAt = first.ts;
    const endAt = last.ts === first.ts ? new Date(first.tsMs + 1000).toISOString() : last.ts;

    const sourcePingIds = r.pings.map((p) => p.id);
    const centerLat = r.pings.reduce((s, p) => s + p.lat, 0) / r.pings.length;
    const centerLng = r.pings.reduce((s, p) => s + p.lng, 0) / r.pings.length;

    if (r.kind === 'movement') {
      segments.push({
        id: uid('mov', segIdx++),
        startAt, endAt,
        kind: 'movement',
        label: 'Förflyttning',
        targetId: null, targetType: null, locationId: null, projectId: null, bookingId: null,
        largeProjectId: null, assignmentId: null,
        confidence: 0.5,
        confidenceReasons: ['speed_or_displacement_exceeded'],
        sourcePingIds,
        centerLat, centerLng,
        distanceToTargetMeters: null,
        insidePolygon: null,
        withinTolerance: false,
        signalGapMinutes: 0, signalGapCount: 0,
        rawEvidence: {
          pingCount: r.pings.length,
          matchReason: r.pings[0].match.matchReason,
          matchedByTolerance: false,
        },
      });
      continue;
    }

    if (r.kind === 'unknown') {
      // Require min stay pings for unknown_place; below that it's still
      // emitted but with low confidence (we never drop pings — Location Truth
      // is a sequence over the entire day window for the supplied pings).
      const tooShort = r.pings.length < policy.minStayPings;
      segments.push({
        id: uid('unk', segIdx++),
        startAt, endAt,
        kind: 'unknown_place',
        label: 'Okänd plats',
        targetId: null, targetType: null, locationId: null, projectId: null, bookingId: null,
        largeProjectId: null, assignmentId: null,
        confidence: tooShort ? 0.2 : 0.4,
        confidenceReasons: tooShort ? ['below_min_stay_pings'] : ['stationary_unknown'],
        sourcePingIds,
        centerLat, centerLng,
        distanceToTargetMeters: r.pings[0].match.distanceToTargetMeters,
        insidePolygon: false,
        withinTolerance: false,
        signalGapMinutes: 0, signalGapCount: 0,
        rawEvidence: {
          pingCount: r.pings.length,
          matchReason: r.pings[0].match.matchReason,
          matchedByTolerance: false,
        },
      });
      continue;
    }

    // r.kind === 'place'
    const cand = r.placeCandidate;
    if (!cand) continue; // defensive
    const matchedByTolerance = r.pings.every((p) => p.match.matchedByTolerance);
    const anyTolerance = r.pings.some((p) => p.match.matchedByTolerance);
    const distance = Math.round(haversine(centerLat, centerLng, cand.center.lat, cand.center.lng));
    const insidePolygon = !matchedByTolerance && r.pings.some((p) => p.match.insidePolygon === true);
    const reasons: string[] = [];
    if (cand.isAssigned) reasons.push('assigned_target');
    if (insidePolygon) reasons.push('inside_geofence');
    if (anyTolerance && !insidePolygon) reasons.push('sticky_tolerance');
    if (cand.isPrivateResidence) reasons.push('private_residence');

    const confidence: Confidence = cand.isPrivateResidence
      ? 1
      : insidePolygon
        ? cand.isAssigned ? 1 : 0.9
        : 0.6;

    segments.push({
      id: uid('plc', segIdx++),
      startAt, endAt,
      kind: cand.segmentKind,
      label: cand.label,
      targetId: cand.refId,
      targetType: cand.targetType,
      locationId: cand.targetType === 'organization_location' || cand.targetType === 'warehouse' || cand.targetType === 'location' ? cand.refId : null,
      projectId: cand.targetType === 'project' ? cand.refId : null,
      bookingId: cand.targetType === 'booking' ? cand.refId : null,
      largeProjectId: cand.targetType === 'large_project' ? cand.refId : null,
      assignmentId: cand.assignmentId,
      confidence,
      confidenceReasons: reasons,
      sourcePingIds,
      centerLat, centerLng,
      distanceToTargetMeters: distance,
      insidePolygon,
      withinTolerance: anyTolerance,
      signalGapMinutes: 0,
      signalGapCount: 0,
      rawEvidence: {
        pingCount: r.pings.length,
        matchReason: r.pings[0].match.matchReason,
        matchedByTolerance: anyTolerance,
      },
    });
  }

  return {
    locationTruthSegments: segments,
    diagnostics: makeDiag(input, policy, segments, pingDiag),
  };
}

function makeDiag(
  input: BuildLocationTruthTimelineInput,
  policy: Required<BuildLocationTruthPolicy>,
  segments: LocationTruthSegment[],
  pingMatch: LocationPingMatchDiagnostics,
): LocationTruthDiagnostics {
  let signalGapSegmentCount = 0;
  let movementSegmentCount = 0;
  let unknownPlaceSegmentCount = 0;
  let knownPlaceSegmentCount = 0;
  let privateResidenceSegmentCount = 0;
  for (const s of segments) {
    switch (s.kind) {
      case 'signal_gap': signalGapSegmentCount += 1; break;
      case 'movement': movementSegmentCount += 1; break;
      case 'unknown_place': unknownPlaceSegmentCount += 1; break;
      case 'private_residence': privateResidenceSegmentCount += 1; break;
      case 'project':
      case 'booking':
      case 'warehouse':
      case 'known_location':
        knownPlaceSegmentCount += 1; break;
    }
  }
  return {
    staffId: input.staffId,
    date: input.date,
    inputPingCount: input.gpsPings?.length ?? 0,
    segmentCount: segments.length,
    signalGapSegmentCount,
    movementSegmentCount,
    unknownPlaceSegmentCount,
    knownPlaceSegmentCount,
    privateResidenceSegmentCount,
    policy,
    pingMatch,
  };
}
