/**
 * Read-only diagnostics — "Why did Time Engine label this block as
 * 'Arbete – okänd plats' / 'Okänd plats'?"
 * ==========================================================================
 *
 * Pure function. Reads only data already loaded by `get-staff-presence-day`:
 *   - reportCandidate blocks (admin Tidrapport-pipelines visible blocks)
 *   - locationTruth blocks   (parallel pipeline)
 *   - gpsTimeline segments   (raw GPS engine output, with targetDiagnostics)
 *   - resolvedWorkTargets    (warehouses / projects / locations / bookings / large_projects)
 *   - private residence anchors
 *   - raw GPS pings
 *
 * NEVER mutates state. NEVER writes time_reports / location_time_entries /
 * workdays / active_time_registrations. NEVER calls auto-start.
 *
 * Output is attached to the day-report response under
 * `unknownLocationDiagnostics` and flows transparently into
 * `staff_day_report_cache.diagnostics_json` when the live engine result is
 * mirrored into the mobile cache row.
 */

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

// ───────────────────────── Input shapes (loose, read-only) ─────────────────

export interface UnknownDiagPing {
  ts: string;
  lat: number;
  lng: number;
  accuracyM?: number | null;
}

export interface UnknownDiagTarget {
  id: string;
  type: string;                // project | large_project | booking | warehouse | location | organization_location
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  targetSource?: string | null;
  targetValidity?: string | null;
  timeTrackingAllowed?: boolean | null;
  matchRole?: string | null;   // primary | secondary
  assignmentAnchor?: string | null;
  canAutoMatchAsWork?: boolean | null;
  isPrivateResidence?: boolean | null;
}

export interface UnknownDiagHomeAnchor {
  id: string;
  kind: string;
  lat: number;
  lng: number;
  radiusM: number;
  label?: string | null;
}

/** Loose block shape — covers reportCandidate AND locationTruth blocks. */
export interface UnknownDiagBlock {
  id?: string;
  kind?: string;            // 'work' | 'unknown' | 'unknown_place' | ...
  startAt?: string;
  endAt?: string;
  title?: string | null;
  targetLabel?: string | null;
  resolvedFrom?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  durationMinutes?: number | null;
}

/** Loose GPS segment shape — buildGpsDayTimeline.GpsTimelineSegment. */
export interface UnknownDiagGpsSegment {
  id: string;
  startTs: string;
  endTs: string;
  durationMin?: number | null;
  kind?: string;            // 'stay' | 'travel' | 'gps_gap'
  type?: string;            // 'known_site' | 'unknown_place' | 'transport' | 'gps_gap'
  label?: string | null;
  matchedTargetId?: string | null;
  matchedTargetType?: string | null;
  matchedTargetName?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  pingCount?: number | null;
  reason?: string | null;
  targetDiagnostics?: Record<string, unknown> | null;
}

export interface BuildUnknownLocationDiagnosticsInput {
  staffId: string;
  staffName: string | null;
  date: string;
  reportCandidateBlocks?: UnknownDiagBlock[] | null;
  locationTruthBlocks?: UnknownDiagBlock[] | null;
  gpsSegments?: UnknownDiagGpsSegment[] | null;
  resolvedTargets?: UnknownDiagTarget[] | null;
  pings?: UnknownDiagPing[] | null;
  homeAnchors?: UnknownDiagHomeAnchor[] | null;
  /** Cap on the number of detailed examples emitted (defaults to 8). */
  maxExamples?: number;
}

// ───────────────────────── Output shape (per task spec) ────────────────────

export interface UnknownLocationNearestTarget {
  targetType: string;
  targetId: string;
  label: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  radiusMeters: number | null;
  sourceTable: string | null;
  hasCoordinates: boolean;
  matchRejectedReason: string | null;
}

export interface UnknownLocationExample {
  staffId: string;
  staffName: string | null;
  date: string;
  blockId: string | null;
  blockKind: string | null;
  blockLabel: string | null;
  start: string;
  end: string;
  durationMinutes: number;
  rawLat: number | null;
  rawLng: number | null;
  rawAccuracy: number | null;
  rawPingCount: number;
  firstPingAt: string | null;
  lastPingAt: string | null;
  nearestKnownTargets: UnknownLocationNearestTarget[];
  selectedTargetBeforeUnknown: { type: string; id: string; label: string } | null;
  selectedTargetAfterUnknown: { type: string; id: string; label: string } | null;
  reasonWhyUnknown: string;
  matchingStageWhereUnknownWasAssigned:
    | 'gps_timeline'
    | 'location_truth'
    | 'report_candidate'
    | 'unknown';
  hadAssignmentForDay: boolean;
  nearestAssignment: UnknownLocationNearestTarget | null;
  assignmentDistanceMeters: number | null;
  hadWarehouseCandidate: boolean;
  nearestWarehouseDistanceMeters: number | null;
  hadProjectCandidate: boolean;
  nearestProjectDistanceMeters: number | null;
  hadPrivateResidenceCandidate: boolean;
  nearestPrivateResidenceDistanceMeters: number | null;
  competingTargets: UnknownLocationNearestTarget[];
  winningTarget: UnknownLocationNearestTarget | null;
  whyWinningTargetWasNotUsed: string | null;
}

export interface UnknownLocationDiagnostics {
  totalUnknownWorkBlocks: number;
  totalUnknownGpsSegments: number;
  totalReportBlocksScanned: number;
  totalLocationTruthBlocksScanned: number;
  countsByStage: {
    gps_timeline: number;
    location_truth: number;
    report_candidate: number;
  };
  examples: UnknownLocationExample[];
}

// ───────────────────────── Helpers ─────────────────────────────────────────

const UNKNOWN_TITLE_RE = /\b(arbete\s*[-–(]\s*okänd plats\)?|okänd plats|sammanslagen okänd plats)\b/i;

function isUnknownBlock(b: UnknownDiagBlock | null | undefined): boolean {
  if (!b) return false;
  if (b.kind === 'unknown' || b.kind === 'unknown_place') return true;
  const t = (b.title ?? b.targetLabel ?? '').toLowerCase();
  return UNKNOWN_TITLE_RE.test(t);
}

function blockMinutes(b: UnknownDiagBlock): number {
  if (typeof b.durationMinutes === 'number' && Number.isFinite(b.durationMinutes)) return b.durationMinutes;
  if (b.startAt && b.endAt) {
    const ms = Date.parse(b.endAt) - Date.parse(b.startAt);
    return Number.isFinite(ms) ? Math.round(ms / 60000) : 0;
  }
  return 0;
}

function rejectedReason(t: UnknownDiagTarget): string | null {
  if (t.latitude == null || t.longitude == null) return 'missing_coordinates';
  if (t.targetValidity && t.targetValidity !== 'valid') return t.targetValidity;
  if (t.timeTrackingAllowed === false) return 'not_allowed_for_time_tracking';
  if (t.canAutoMatchAsWork === false) return 'not_primary_for_staff_today';
  return null;
}

function toNearest(t: UnknownDiagTarget, distM: number | null): UnknownLocationNearestTarget {
  return {
    targetType: t.type,
    targetId: t.id,
    label: t.name,
    address: null, // optional — admin already exposes addresses elsewhere; keep payload small
    lat: t.latitude,
    lng: t.longitude,
    distanceMeters: distM,
    radiusMeters: t.radiusMeters,
    sourceTable: t.targetSource ?? null,
    hasCoordinates: t.latitude != null && t.longitude != null,
    matchRejectedReason: rejectedReason(t),
  };
}

function pingsInWindow(pings: UnknownDiagPing[], startTs: string, endTs: string): UnknownDiagPing[] {
  const s = Date.parse(startTs);
  const e = Date.parse(endTs);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return [];
  const out: UnknownDiagPing[] = [];
  for (const p of pings) {
    const t = Date.parse(p.ts);
    if (t >= s && t <= e) out.push(p);
  }
  return out;
}

function medianAccuracy(pings: UnknownDiagPing[]): number | null {
  const arr = pings.map((p) => p.accuracyM ?? null).filter((v): v is number => typeof v === 'number');
  if (arr.length === 0) return null;
  arr.sort((a, b) => a - b);
  return arr[Math.floor(arr.length / 2)];
}

function centroid(pings: UnknownDiagPing[]): { lat: number; lng: number } | null {
  if (pings.length === 0) return null;
  let sLat = 0;
  let sLng = 0;
  for (const p of pings) { sLat += p.lat; sLng += p.lng; }
  return { lat: sLat / pings.length, lng: sLng / pings.length };
}

function nearestByType(
  cLat: number | null,
  cLng: number | null,
  targets: UnknownDiagTarget[],
  pred: (t: UnknownDiagTarget) => boolean,
): { distance: number | null; target: UnknownDiagTarget | null } {
  if (cLat == null || cLng == null) return { distance: null, target: null };
  let best: UnknownDiagTarget | null = null;
  let bestD: number | null = null;
  for (const t of targets) {
    if (!pred(t)) continue;
    if (t.latitude == null || t.longitude == null) continue;
    const d = haversineM(cLat, cLng, t.latitude, t.longitude);
    if (bestD == null || d < bestD) { bestD = d; best = t; }
  }
  return { distance: bestD == null ? null : Math.round(bestD), target: best };
}

function classifyStage(
  startAt: string,
  endAt: string,
  reportCandidateUnknowns: UnknownDiagBlock[],
  locationTruthUnknowns: UnknownDiagBlock[],
  gpsUnknowns: UnknownDiagGpsSegment[],
): UnknownLocationExample['matchingStageWhereUnknownWasAssigned'] {
  const overlaps = (a1: string, a2: string, b1: string, b2: string) => {
    const sa = Date.parse(a1), ea = Date.parse(a2);
    const sb = Date.parse(b1), eb = Date.parse(b2);
    if (![sa, ea, sb, eb].every(Number.isFinite)) return false;
    return sa < eb && sb < ea;
  };
  if (gpsUnknowns.some((s) => overlaps(startAt, endAt, s.startTs, s.endTs))) return 'gps_timeline';
  if (locationTruthUnknowns.some((b) => b.startAt && b.endAt && overlaps(startAt, endAt, b.startAt, b.endAt))) return 'location_truth';
  if (reportCandidateUnknowns.some((b) => b.startAt && b.endAt && overlaps(startAt, endAt, b.startAt, b.endAt))) return 'report_candidate';
  return 'unknown';
}

function reasonFromGps(seg: UnknownDiagGpsSegment | null): string {
  if (!seg) return 'no_overlapping_gps_segment';
  const td = (seg.targetDiagnostics ?? {}) as Record<string, unknown>;
  const reason = (seg.reason ?? '').toString();
  const nearestDist = (td['nearestTargetDistanceMeters'] as number | null | undefined);
  const nearestRadius = (td['nearestTargetRadiusMeters'] as number | null | undefined);
  const inside = td['insideNearestTarget'] as boolean | undefined;
  if (reason === 'no_target_match' && typeof nearestDist === 'number' && typeof nearestRadius === 'number') {
    return `no_target_match · nearest ${Math.round(nearestDist)}m / radius ${nearestRadius}m`;
  }
  if (inside === false && typeof nearestDist === 'number') {
    return `outside_geofence · nearest ${Math.round(nearestDist)}m`;
  }
  return reason || 'no_target_match';
}

// ───────────────────────── Main builder ────────────────────────────────────

export function buildUnknownLocationDiagnostics(
  input: BuildUnknownLocationDiagnosticsInput,
): UnknownLocationDiagnostics {
  const cap = input.maxExamples ?? 8;
  const reportBlocks = input.reportCandidateBlocks ?? [];
  const ltBlocks = input.locationTruthBlocks ?? [];
  const gpsSegments = input.gpsSegments ?? [];
  const targets = input.resolvedTargets ?? [];
  const pings = input.pings ?? [];
  const homes = input.homeAnchors ?? [];

  const reportCandidateUnknowns = reportBlocks.filter(isUnknownBlock);
  const locationTruthUnknowns = ltBlocks.filter(isUnknownBlock);
  const gpsUnknowns = gpsSegments.filter((s) => s.type === 'unknown_place');

  // Prefer report-candidate (what the user actually sees). Fall back to LT
  // blocks. Fall back to raw GPS unknown segments (in case the report
  // pipeline absorbed them but we still want to know why GPS failed).
  const sourceList: { block: UnknownDiagBlock; from: 'report' | 'location_truth' | 'gps_segment' }[] = [];
  for (const b of reportCandidateUnknowns) sourceList.push({ block: b, from: 'report' });
  if (sourceList.length === 0) {
    for (const b of locationTruthUnknowns) sourceList.push({ block: b, from: 'location_truth' });
  }
  if (sourceList.length === 0) {
    for (const s of gpsUnknowns) {
      sourceList.push({
        block: {
          id: s.id,
          kind: 'unknown_place',
          startAt: s.startTs,
          endAt: s.endTs,
          title: s.label ?? 'Okänd plats',
          centerLat: s.centerLat ?? null,
          centerLng: s.centerLng ?? null,
          durationMinutes: s.durationMin ?? null,
        },
        from: 'gps_segment',
      });
    }
  }

  // Sort by duration desc — show worst offenders first.
  sourceList.sort((a, b) => blockMinutes(b.block) - blockMinutes(a.block));

  const hadAssignment = targets.some(
    (t) => t.canAutoMatchAsWork === true && t.matchRole === 'primary',
  );

  const examples: UnknownLocationExample[] = [];
  for (const item of sourceList) {
    if (examples.length >= cap) break;
    const b = item.block;
    if (!b.startAt || !b.endAt) continue;

    const blockPings = pingsInWindow(pings, b.startAt, b.endAt);
    const c = centroid(blockPings)
      ?? (b.centerLat != null && b.centerLng != null
        ? { lat: b.centerLat, lng: b.centerLng }
        : null);

    // Collect nearest targets (sorted by distance, top 5).
    const nearestList: UnknownLocationNearestTarget[] = [];
    if (c) {
      const ranked = targets.map((t) => {
        const d = (t.latitude != null && t.longitude != null)
          ? Math.round(haversineM(c.lat, c.lng, t.latitude, t.longitude))
          : null;
        return { t, d };
      }).sort((a, b) => {
        if (a.d == null && b.d == null) return 0;
        if (a.d == null) return 1;
        if (b.d == null) return -1;
        return a.d - b.d;
      });
      for (const r of ranked.slice(0, 5)) nearestList.push(toNearest(r.t, r.d));
    }

    // Per-type nearest (warehouse / project / large_project / booking / private residence).
    const isWarehouseLike = (t: UnknownDiagTarget) =>
      t.type === 'warehouse' || t.type === 'organization_location' || t.type === 'location';
    const isProjectLike = (t: UnknownDiagTarget) =>
      t.type === 'project' || t.type === 'large_project';
    const isBookingLike = (t: UnknownDiagTarget) => t.type === 'booking';
    const isAssigned = (t: UnknownDiagTarget) =>
      t.canAutoMatchAsWork === true && t.matchRole === 'primary';

    const wh = nearestByType(c?.lat ?? null, c?.lng ?? null, targets, isWarehouseLike);
    const pr = nearestByType(c?.lat ?? null, c?.lng ?? null, targets, isProjectLike);
    const bk = nearestByType(c?.lat ?? null, c?.lng ?? null, targets, isBookingLike);
    const asg = nearestByType(c?.lat ?? null, c?.lng ?? null, targets, isAssigned);

    let nearestPrivM: number | null = null;
    if (c) {
      for (const h of homes) {
        const d = haversineM(c.lat, c.lng, h.lat, h.lng);
        if (nearestPrivM == null || d < nearestPrivM) nearestPrivM = Math.round(d);
      }
    }

    // Find overlapping raw GPS segment (used for richer reason).
    const sb = Date.parse(b.startAt);
    const eb = Date.parse(b.endAt);
    const overlappingGps = gpsSegments.find((s) => {
      const ss = Date.parse(s.startTs);
      const se = Date.parse(s.endTs);
      return Number.isFinite(ss) && Number.isFinite(se) && ss < eb && sb < se;
    }) ?? null;

    // Locate selected-target before / after by scanning report blocks.
    const reportSorted = [...reportBlocks]
      .filter((rb) => rb.startAt && rb.endAt)
      .sort((a, b) => Date.parse(a.startAt!) - Date.parse(b.startAt!));
    const idx = reportSorted.findIndex((rb) =>
      rb.startAt === b.startAt && rb.endAt === b.endAt && isUnknownBlock(rb),
    );
    const before = idx > 0 ? reportSorted[idx - 1] : null;
    const after = idx >= 0 && idx < reportSorted.length - 1 ? reportSorted[idx + 1] : null;
    const labelOf = (rb: UnknownDiagBlock | null) =>
      rb && (rb.title || rb.targetLabel)
        ? { type: (rb.kind ?? 'unknown') as string, id: rb.id ?? '', label: (rb.title ?? rb.targetLabel ?? '') as string }
        : null;

    const stage = item.from === 'gps_segment'
      ? 'gps_timeline'
      : item.from === 'location_truth'
        ? 'location_truth'
        : classifyStage(b.startAt, b.endAt, reportCandidateUnknowns, locationTruthUnknowns, gpsUnknowns);

    examples.push({
      staffId: input.staffId,
      staffName: input.staffName,
      date: input.date,
      blockId: b.id ?? null,
      blockKind: b.kind ?? null,
      blockLabel: b.title ?? b.targetLabel ?? null,
      start: b.startAt,
      end: b.endAt,
      durationMinutes: blockMinutes(b),
      rawLat: c?.lat ?? null,
      rawLng: c?.lng ?? null,
      rawAccuracy: medianAccuracy(blockPings),
      rawPingCount: blockPings.length,
      firstPingAt: blockPings[0]?.ts ?? null,
      lastPingAt: blockPings[blockPings.length - 1]?.ts ?? null,
      nearestKnownTargets: nearestList,
      selectedTargetBeforeUnknown: labelOf(before),
      selectedTargetAfterUnknown: labelOf(after),
      reasonWhyUnknown: reasonFromGps(overlappingGps),
      matchingStageWhereUnknownWasAssigned: stage,
      hadAssignmentForDay: hadAssignment,
      nearestAssignment: asg.target ? toNearest(asg.target, asg.distance) : null,
      assignmentDistanceMeters: asg.distance,
      hadWarehouseCandidate: !!wh.target,
      nearestWarehouseDistanceMeters: wh.distance,
      hadProjectCandidate: !!pr.target,
      nearestProjectDistanceMeters: pr.distance,
      hadPrivateResidenceCandidate: nearestPrivM != null,
      nearestPrivateResidenceDistanceMeters: nearestPrivM,
      competingTargets: nearestList.filter((n) => n.matchRejectedReason !== null),
      winningTarget: nearestList.find((n) => n.matchRejectedReason === null) ?? null,
      whyWinningTargetWasNotUsed: (() => {
        const w = nearestList.find((n) => n.matchRejectedReason === null);
        if (!w) return 'no_eligible_target_with_coordinates_and_primary_role';
        if (w.distanceMeters == null || w.radiusMeters == null) return null;
        if (w.distanceMeters > w.radiusMeters) {
          return `gps_outside_radius_by_${w.distanceMeters - w.radiusMeters}m`;
        }
        return null;
      })(),
    });
  }

  return {
    totalUnknownWorkBlocks: reportCandidateUnknowns.length + locationTruthUnknowns.length,
    totalUnknownGpsSegments: gpsUnknowns.length,
    totalReportBlocksScanned: reportBlocks.length,
    totalLocationTruthBlocksScanned: ltBlocks.length,
    countsByStage: {
      gps_timeline: gpsUnknowns.length,
      location_truth: locationTruthUnknowns.length,
      report_candidate: reportCandidateUnknowns.length,
    },
    examples,
  };
}
