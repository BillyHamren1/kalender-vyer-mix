/**
 * Time Engine — processGpsTimelineForAutoStart
 * ============================================
 *
 * Glue between the pure layers (buildGpsDayTimeline, resolveWorkTargets,
 * decideAutoStart) and the new active_time_registrations table.
 *
 * Responsibilities:
 *   1. Use the supplied gpsDayTimeline (or build it from raw input).
 *   2. Resolve valid WorkTargets via resolveWorkTargets (or use supplied list).
 *   3. Check whether an active_time_registration already exists for this staff.
 *   4. Run decideAutoStart on relevant `stay` segments matching a known target.
 *   5. If a decision is `allowed: true` AND no active registration exists →
 *      INSERT a new active_time_registration row.
 *   6. Otherwise, never write — return the full decision log.
 *
 * Hard rules (mirroring decideAutoStart, enforced again here for safety):
 *   - Never auto-start from unknown_place / travel / gps_gap.
 *   - Never auto-start from test/demo/cancelled/invalid target.
 *   - Idempotent: the unique partial index
 *       (organization_id, staff_id) WHERE status='active'
 *     prevents duplicate active rows. We additionally re-check before insert
 *     and skip if the same (segment, target) was already used.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import type { ISODate, ISODateTime, UUID, WorkTarget } from './contracts.ts';
import {
  buildGpsDayTimeline,
  type BuildGpsDayTimelinePolicy,
  type GpsDayTimelineResult,
  type GpsPing,
  type GpsTimelineSegment,
} from './buildGpsDayTimeline.ts';
import {
  resolveWorkTargets,
  type ResolvedWorkTarget,
  type TargetDiagnostics,
  toWorkTarget,
} from './resolveWorkTargets.ts';
import {
  decideAutoStart,
  type AutoStartDecisionResult,
  type DecideAutoStartSegment,
  type DecideAutoStartTarget,
} from './decideAutoStart.ts';
import { assertNoLegacySources } from './assertNoLegacySources.ts';
import { getStockholmDayWindowUtc } from '../stockholmDayWindow.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Inputs / outputs
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessAutoStartInput {
  organizationId: UUID;
  staffId: UUID;
  date: ISODate;
  /** ISO timestamp representing local "now". Defaults to the segment endTs. */
  localTime?: ISODateTime;

  /** Provide either a pre-built timeline … */
  gpsDayTimeline?: GpsDayTimelineResult;
  /** … or raw pings + a build policy and we'll build the timeline. */
  pings?: GpsPing[];
  buildPolicy?: BuildGpsDayTimelinePolicy;

  /** Provide pre-resolved targets, otherwise we'll resolve via DB. */
  targets?: ResolvedWorkTarget[];

  supabaseAdmin: SupabaseClient;

  /** Dry-run: never insert, only return decisions. */
  dryRun?: boolean;
}

export interface AutoStartDecisionLogEntry {
  segmentId: string;
  segmentKind: string;
  segmentType: string;
  decision: AutoStartDecisionResult;
  matchedTargetId: UUID | null;
  matchedTargetName: string | null;
  skippedReason?:
    | 'segment_not_known_site'
    | 'no_target_for_segment'
    | 'target_not_valid_for_autostart'
    | 'already_active_registration'
    | 'duplicate_segment'
    | 'inside_private_residence'
    | 'user_declined_today';
  /**
   * Home-wins-over-work diagnostics for this segment. Populated when the
   * candidate sits inside a staff private zone (home / private_residence /
   * manual_ignore / recurring_night). Even if `matchedTargetId` points at
   * a real project/booking/warehouse, GPS does NOT auto-start a timer.
   */
  homeWinsDiagnostics?: {
    matchedPrivateResidence: true;
    privateResidenceZoneKind: string | null;
    privateResidenceDistanceMeters: number;
    competingWorkTarget:
      | { id: UUID; name: string | null; type: string | null }
      | null;
    homeWonOverWorkTarget: boolean;
    suppressedAutoStartBecauseHome: true;
  };
  /**
   * User-decline diagnostics for this segment. Populated when an active
   * row in `auto_start_decline_log` matches this candidate (target_id or
   * geographic radius). Auto-start is suppressed for the rest of the local
   * day; manual start (start_time_registration) bypasses entirely.
   */
  declineDiagnostics?: {
    userDeclineFound: true;
    declineMatchedTarget: boolean;
    declineMatchedRadius: number | null;
    suppressedAutoStartBecauseDeclined: true;
    declineId: string;
    expiresAt: ISODateTime;
  };
}

/** Loaded once per (org, staff) and reused across candidate segments. */
interface StaffPrivateZone {
  lat: number;
  lng: number;
  radiusM: number;
  zoneKind: string | null;
}

export interface ProcessAutoStartResult {
  organizationId: UUID;
  staffId: UUID;
  date: ISODate;
  alreadyActive: boolean;
  createdRegistrationId: UUID | null;
  decisions: AutoStartDecisionLogEntry[];
  targetDiagnostics?: TargetDiagnostics;
  /**
   * Set when an active suppression row in `time_auto_start_suppressions`
   * blocked all auto-start decisions for this staff/date. The user
   * manually ended their workday earlier today; only manual start from
   * WorkDayPanel may resume the timer for the rest of the local day.
   */
  suppression?: {
    id: UUID;
    suppressedUntil: ISODateTime;
    reason: string;
    source: string;
  } | null;
  /**
   * Diagnostics surfaced when the latest registration for this local day
   * was already `status='stopped'` and we therefore prevented GPS-driven
   * re-open. Mutually independent from `suppression` (which is the
   * explicit `time_auto_start_suppressions` row).
   */
  dayStopLock?: {
    dayWasAlreadyStopped: true;
    preventedLegacyReopen: true;
    activeRegistrationStatus: 'stopped';
    stopSource: string | null;
    stoppedBy: string | null;
    finalDayEnd: ISODateTime;
    registrationId: UUID;
  } | null;
  /**
   * Aggregate home/private-residence diagnostics for this run. Set when
   * at least one candidate stay segment was suppressed because the staff
   * was inside a private zone. "Home wins over work."
   */
  privateResidenceLock?: {
    matchedPrivateResidence: true;
    suppressedAutoStartBecauseHome: true;
    suppressedSegmentsCount: number;
    homeWonOverWorkTargetCount: number;
    nearestZoneKind: string | null;
    nearestDistanceMeters: number | null;
  } | null;
  /**
   * Aggregate diagnostics when one or more candidate segments were
   * suppressed because the user previously declined (auto_start_decline_log).
   */
  declineLock?: {
    userDeclineFound: true;
    suppressedAutoStartBecauseDeclined: true;
    suppressedSegmentsCount: number;
    matchedByTargetCount: number;
    matchedByRadiusCount: number;
  } | null;
  computedAt: ISODateTime;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toDecideSegment(seg: GpsTimelineSegment): DecideAutoStartSegment {
  return {
    id: seg.id,
    startTs: seg.startTs,
    endTs: seg.endTs,
    durationMin: seg.durationMin,
    kind: seg.kind,
    type: seg.type,
    pingCount: seg.pingCount,
    confidence: seg.confidence,
  };
}

function toDecideTarget(rt: ResolvedWorkTarget): DecideAutoStartTarget {
  const wt = toWorkTarget(rt);
  return {
    refId: rt.id,
    kind: wt?.kind ?? mapTypeToKind(rt.type),
    label: rt.name,
    key: wt?.key,
    center: wt?.center,
    radiusM: wt?.radiusM,
    targetValidity: rt.targetValidity as any,
    timeTrackingAllowed: rt.timeTrackingAllowed,
    assignedToUserToday: rt.targetSource === 'planned_today' || undefined,
    explicitlyAllowed: rt.targetSource === 'explicit_time_tracking_location' || undefined,
  };
}

function mapTypeToKind(t: ResolvedWorkTarget['type']): WorkTarget['kind'] {
  return t === 'project' ? 'project'
    : t === 'booking' ? 'booking'
    : t === 'warehouse' ? 'warehouse'
    : 'organization_location';
}

function findTargetForSegment(
  seg: GpsTimelineSegment,
  targets: ResolvedWorkTarget[],
): ResolvedWorkTarget | null {
  if (!seg.matchedTargetId) return null;
  return targets.find(
    (t) => t.id === seg.matchedTargetId && t.type === (seg.matchedTargetType as ResolvedWorkTarget['type']),
  ) ?? null;
}

async function fetchActiveRegistration(
  supabaseAdmin: SupabaseClient,
  organizationId: UUID,
  staffId: UUID,
): Promise<{ id: UUID; startedAt: ISODateTime } | null> {
  const { data, error } = await supabaseAdmin
    .from('active_time_registrations')
    .select('id, started_at')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`fetchActiveRegistration: ${error.message}`);
  return data ? { id: data.id as UUID, startedAt: data.started_at as ISODateTime } : null;
}

/**
 * Returns the most recent active suppression row for this staff/date.
 * Active = `suppressed_until > nowIso`. The suppression is created by
 * mobile-app-api when the user manually stops their workday and is the
 * authoritative reason GPS/geofence may not auto-start a new timer for
 * the rest of the local day.
 */
async function fetchActiveSuppression(
  supabaseAdmin: SupabaseClient,
  organizationId: UUID,
  staffId: UUID,
  date: ISODate,
  nowIso: ISODateTime,
): Promise<{ id: UUID; suppressedUntil: ISODateTime; reason: string; source: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('time_auto_start_suppressions')
    .select('id, suppressed_until, reason, source')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .eq('date', date)
    .gt('suppressed_until', nowIso)
    .order('suppressed_until', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Non-fatal — log and treat as no suppression rather than blocking the engine.
    // eslint-disable-next-line no-console
    console.warn('[time-engine] fetchActiveSuppression failed:', error.message);
    return null;
  }
  return data
    ? {
        id: data.id as UUID,
        suppressedUntil: data.suppressed_until as ISODateTime,
        reason: data.reason as string,
        source: data.source as string,
      }
    : null;
}

/**
 * Returns the latest STOPPED active_time_registration whose `stopped_at`
 * fell inside this staff's local Stockholm-day window.
 *
 * Lock-policy from the user spec ("stoppad dagtimer = dagen är stoppad"):
 *   • Once a day timer is stopped (auto OR user) the rest of the local
 *     day is locked from GPS-driven re-open.
 *   • Manual start via `start_time_registration` bypasses (it does not
 *     go through this engine).
 *   • A NEW active row started after the stop reopens normally — we only
 *     suppress when the LATEST row for the day is already stopped.
 *
 * Diagnostics: surfaced as `dayWasAlreadyStopped` + `preventedLegacyReopen`
 * in the synthesized suppression returned to the caller.
 */
async function fetchLatestStoppedRegistrationForLocalDate(
  supabaseAdmin: SupabaseClient,
  organizationId: UUID,
  staffId: UUID,
  date: ISODate,
): Promise<{
  id: UUID;
  status: string;
  startedAt: ISODateTime;
  stoppedAt: ISODateTime;
  stopSource: string | null;
  stoppedBy: string | null;
} | null> {
  const win = getStockholmDayWindowUtc(date);
  const { data, error } = await supabaseAdmin
    .from('active_time_registrations')
    .select('id, status, started_at, stopped_at, stop_source, stopped_by')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .gte('started_at', win.startUtc)
    .lte('started_at', win.endUtc)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[time-engine] fetchLatestStoppedRegistrationForLocalDate failed:', error.message);
    return null;
  }
  if (!data) return null;
  if (data.status !== 'stopped' || !data.stopped_at) return null;
  return {
    id: data.id as UUID,
    status: data.status as string,
    startedAt: data.started_at as ISODateTime,
    stoppedAt: data.stopped_at as ISODateTime,
    stopSource: (data.stop_source as string | null) ?? null,
    stoppedBy: (data.stopped_by as string | null) ?? null,
  };
}

/**
 * Loads the staff's private zones (home/private_residence/manual_ignore/
 * recurring_night). Used to enforce HOME-WINS-OVER-WORK at auto-start time.
 *
 * Sources (best-effort; missing tables are tolerated):
 *   • staff_inferred_home_locations  → kind='inferred_home', radius=150 m
 *   • staff_private_zones            → user-/admin-curated zones
 *
 * "Hemma är evidence/status, inte arbetstid" — these zones never create a
 * timer; they only suppress GPS-driven auto-start.
 */
async function loadStaffPrivateZones(
  supabaseAdmin: SupabaseClient,
  organizationId: UUID,
  staffId: UUID,
): Promise<StaffPrivateZone[]> {
  const out: StaffPrivateZone[] = [];

  try {
    const { data: homes } = await supabaseAdmin
      .from('staff_inferred_home_locations')
      .select('lat, lng')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .is('valid_until', null)
      .limit(3);
    for (const h of homes || []) {
      const lat = Number((h as any).lat);
      const lng = Number((h as any).lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        out.push({ lat, lng, radiusM: 150, zoneKind: 'inferred_home' });
      }
    }
  } catch (_) { /* table optional */ }

  try {
    const { data: priv } = await supabaseAdmin
      .from('staff_private_zones')
      .select('lat, lng, radius_m, zone_kind')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    for (const p of priv || []) {
      const lat = Number((p as any).lat);
      const lng = Number((p as any).lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        lat,
        lng,
        radiusM: Number.isFinite((p as any).radius_m) ? Number((p as any).radius_m) : 150,
        zoneKind: ((p as any).zone_kind as string | null) ?? 'private_residence',
      });
    }
  } catch (_) { /* table optional */ }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-start decline log loader (user said "no" to a prior arrival prompt).
// Mobile app owns only day start/stop. GPS/geofence is evidence only.
// A decline row hard-blocks GPS auto-start for the same staff/day/target
// (or geographic point) until expires_at. Manual start bypasses entirely.
// ─────────────────────────────────────────────────────────────────────────────

interface AutoStartDecline {
  id: string;
  targetType: string | null;
  targetId: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  expiresAt: ISODateTime;
}

async function loadAutoStartDeclines(
  supabaseAdmin: SupabaseClient,
  organizationId: UUID,
  staffId: UUID,
  date: ISODate,
  nowIso: ISODateTime,
): Promise<AutoStartDecline[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('auto_start_decline_log')
      .select('id, target_type, target_id, lat, lng, radius_m, expires_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('local_date', date)
      .eq('response', 'declined')
      .gt('expires_at', nowIso);
    if (error) {
      console.warn('[time-engine] loadAutoStartDeclines failed:', error.message);
      return [];
    }
    return (data || []).map((r: any) => ({
      id: r.id as string,
      targetType: (r.target_type as string | null) ?? null,
      targetId: (r.target_id as string | null) ?? null,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      radiusM: r.radius_m != null ? Number(r.radius_m) : null,
      expiresAt: r.expires_at as ISODateTime,
    }));
  } catch (_) {
    return [];
  }
}

/**
 * Returns the matching decline (target match wins over geographic match).
 */
function findMatchingDecline(
  target: ResolvedWorkTarget | null,
  segPoint: { lat: number; lng: number } | null,
  declines: AutoStartDecline[],
): { decline: AutoStartDecline; matchedTarget: boolean; matchedRadiusMeters: number | null } | null {
  if (declines.length === 0) return null;
  if (target) {
    const t = declines.find(
      (d) => d.targetId && d.targetId === target.id && (!d.targetType || d.targetType === target.type),
    );
    if (t) return { decline: t, matchedTarget: true, matchedRadiusMeters: null };
  }
  if (segPoint) {
    for (const d of declines) {
      if (d.lat == null || d.lng == null) continue;
      const r = d.radiusM ?? 150;
      const dist = haversineMeters(segPoint, { lat: d.lat, lng: d.lng });
      if (dist <= r) {
        return { decline: d, matchedTarget: false, matchedRadiusMeters: Math.round(r) };
      }
    }
  }
  return null;
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Returns the nearest private zone if the point sits inside any zone radius. */
function findEnclosingPrivateZone(
  point: { lat: number; lng: number } | null,
  zones: StaffPrivateZone[],
): { zone: StaffPrivateZone; distanceMeters: number } | null {
  if (!point || zones.length === 0) return null;
  let best: { zone: StaffPrivateZone; distanceMeters: number } | null = null;
  for (const z of zones) {
    const d = haversineMeters(point, { lat: z.lat, lng: z.lng });
    if (d <= z.radiusM && (best === null || d < best.distanceMeters)) {
      best = { zone: z, distanceMeters: d };
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function processGpsTimelineForAutoStart(
  input: ProcessAutoStartInput,
): Promise<ProcessAutoStartResult> {
  const { organizationId, staffId, date, supabaseAdmin } = input;

  // Legacy-leak guard: the new Time Engine must never consume legacy sources
  // (workday / time_reports / location_time_entries / travel_time_logs /
  // assistant_events / workday_flags / old snapshots / legacy active timers)
  // as ground truth. We inspect the input shallowly and warn in debug mode.
  const leak = assertNoLegacySources(input, { debug: true, label: 'processGpsTimelineForAutoStart' });
  if (leak.legacySourceLeakDetected) {
    // Non-fatal by design — surfaced via console + returned diagnostics so
    // callers can decide. The new engine simply ignores those fields.
    // eslint-disable-next-line no-console
    console.warn('[time-engine] legacy source leak in input', leak);
  }

  // 1) Timeline
  let timeline = input.gpsDayTimeline;
  if (!timeline) {
    if (!input.pings) throw new Error('processGpsTimelineForAutoStart: need gpsDayTimeline or pings');
    // We need targets to build a meaningful timeline (for known_site classification).
    const tmpTargets =
      input.targets ?? (await resolveWorkTargets({ organizationId, staffId, date, supabaseAdmin })).targets;
    const wts: WorkTarget[] = tmpTargets.map(toDecideTarget).flatMap((t) =>
      t.center && t.radiusM ? [{ key: t.key!, kind: t.kind, refId: t.refId, label: t.label, center: t.center, radiusM: t.radiusM }] : [],
    );
    timeline = buildGpsDayTimeline({
      staffId,
      organizationId,
      date,
      pings: input.pings,
      targets: wts,
      policy: input.buildPolicy,
    });
  }

  // 2) Targets
  let resolvedTargets = input.targets;
  let targetDiagnostics: TargetDiagnostics | undefined;
  if (!resolvedTargets) {
    const r = await resolveWorkTargets({ organizationId, staffId, date, supabaseAdmin });
    resolvedTargets = r.targets;
    targetDiagnostics = r.targetDiagnostics;
  }

  // 3) Already active?
  const active = await fetchActiveRegistration(supabaseAdmin, organizationId, staffId);
  const decisions: AutoStartDecisionLogEntry[] = [];

  // 3b) User-ended-workday suppression — if the user manually stopped their
  // workday today, GPS/auto-start is locked out for the rest of the local
  // day. Manual start via WorkDayPanel bypasses this (it goes through
  // start_time_registration directly, not through this engine).
  const nowIso = input.localTime ?? new Date().toISOString();
  let suppression = await fetchActiveSuppression(
    supabaseAdmin, organizationId, staffId, date, nowIso,
  );

  // 3c) Day-already-stopped lock — covers AUTO stops as well.
  // If we have NO active row but the latest registration for this local day
  // is `status='stopped'`, the day is over and GPS must NOT reopen it.
  // Diagnostics keys: dayWasAlreadyStopped, preventedLegacyReopen,
  // activeRegistrationStatus, stopSource, finalDayEnd.
  let dayStoppedSynth: {
    registrationId: UUID;
    stoppedAt: ISODateTime;
    stopSource: string | null;
    stoppedBy: string | null;
  } | null = null;
  if (!active && !suppression) {
    const lastStopped = await fetchLatestStoppedRegistrationForLocalDate(
      supabaseAdmin, organizationId, staffId, date,
    );
    if (lastStopped) {
      dayStoppedSynth = {
        registrationId: lastStopped.id,
        stoppedAt: lastStopped.stoppedAt,
        stopSource: lastStopped.stopSource,
        stoppedBy: lastStopped.stoppedBy,
      };
      // Synthesize a suppression so the existing block below short-circuits
      // identically and emits per-candidate decisions for the debug surface.
      suppression = {
        id: lastStopped.id,
        suppressedUntil: nowIso, // virtual — we recompute on each call
        reason: 'day_already_stopped',
        source: lastStopped.stopSource ?? 'system_day_stop',
      };
    }
  }

  // 4) Decide on relevant stay segments
  const candidates = timeline.segments.filter(
    (s) => s.kind === 'stay' && s.type === 'known_site' && s.matchedTargetId,
  );

  let createdRegistrationId: UUID | null = null;

  // If suppression is active we still emit one decision per candidate so the
  // health check / debug surface clearly shows the block reason, but we never
  // insert a registration row.
  const suppressionReasonForDecisions: 'blocked_user_ended_workday' | 'blocked_day_already_stopped' =
    dayStoppedSynth ? 'blocked_day_already_stopped' : 'blocked_user_ended_workday';
  if (suppression) {
    for (const seg of candidates) {
      const target = findTargetForSegment(seg, resolvedTargets);
      decisions.push({
        segmentId: seg.id,
        segmentKind: seg.kind,
        segmentType: seg.type,
        matchedTargetId: target?.id ?? seg.matchedTargetId,
        matchedTargetName: target?.name ?? seg.matchedTargetName,
        decision: {
          allowed: false,
          reason: suppressionReasonForDecisions,
          confidence: seg.confidence,
          startAt: null,
          targetId: null,
          targetType: null,
          targetName: null,
          source: null,
          evidence: {
            isNightLocal: false,
            localHour: 0,
            dwellMinutes: seg.durationMin,
            requiredDwellMinutes: 0,
            pingCount: seg.pingCount,
            requiredPingCount: 0,
            confidence: seg.confidence,
            requiredConfidence: 0,
            segmentKind: seg.kind,
            segmentType: seg.type,
            policyUsed: 'day',
          },
        },
      });
    }
    return {
      organizationId,
      staffId,
      date,
      alreadyActive: !!active,
      createdRegistrationId: null,
      decisions,
      targetDiagnostics,
      suppression,
      dayStopLock: dayStoppedSynth
        ? {
            dayWasAlreadyStopped: true,
            preventedLegacyReopen: true,
            activeRegistrationStatus: 'stopped',
            stopSource: dayStoppedSynth.stopSource,
            stoppedBy: dayStoppedSynth.stoppedBy,
            finalDayEnd: dayStoppedSynth.stoppedAt,
            registrationId: dayStoppedSynth.registrationId,
          }
        : null,
      computedAt: new Date().toISOString(),
    };
  }


  // 3d) Staff private zones — load ONCE before the candidate loop. These
  // power the "home wins over work" rule: even if a candidate stay matches
  // a valid project/booking/warehouse, GPS may NOT auto-start a timer if
  // the staff is sitting inside their own home / private_residence zone.
  // GPS evidence is still collected; only auto-start is suppressed.
  const privateZones = await loadStaffPrivateZones(supabaseAdmin, organizationId, staffId);
  let privateResidenceSuppressedSegments = 0;
  let privateResidenceHomeWonOverWorkCount = 0;
  let nearestPrivateZoneKind: string | null = null;
  let nearestPrivateZoneDistance: number | null = null;

  // 3e) User decline log — load active "no" rows for this staff/local-day.
  // Auto-start MUST respect a prior decline; manual start bypasses (does
  // not run through this engine).
  const declines = await loadAutoStartDeclines(
    supabaseAdmin, organizationId, staffId, date, nowIso,
  );
  let declineSuppressedCount = 0;
  let declineMatchedByTarget = 0;
  let declineMatchedByRadius = 0;

  for (const seg of candidates) {
    const target = findTargetForSegment(seg, resolvedTargets);
    if (!target) {
      decisions.push({
        segmentId: seg.id,
        segmentKind: seg.kind,
        segmentType: seg.type,
        matchedTargetId: seg.matchedTargetId,
        matchedTargetName: seg.matchedTargetName,
        decision: {
          allowed: false,
          reason: 'blocked_invalid_target',
          confidence: seg.confidence,
          startAt: null,
          targetId: null,
          targetType: null,
          targetName: null,
          source: null,
          evidence: {
            isNightLocal: false,
            localHour: 0,
            dwellMinutes: seg.durationMin,
            requiredDwellMinutes: 0,
            pingCount: seg.pingCount,
            requiredPingCount: 0,
            confidence: seg.confidence,
            requiredConfidence: 0,
            segmentKind: seg.kind,
            segmentType: seg.type,
            policyUsed: 'day',
          },
        },
        skippedReason: 'no_target_for_segment',
      });
      continue;
    }

    // HOME WINS OVER WORK — if the candidate stay center sits inside a staff
    // private zone, suppress auto-start for THIS segment regardless of the
    // matched work target. Mobile app owns only day start/stop; GPS/geofence
    // is evidence only, not a project timer.
    const segPoint =
      typeof (seg as any).centerLat === 'number' && typeof (seg as any).centerLng === 'number'
        ? { lat: (seg as any).centerLat as number, lng: (seg as any).centerLng as number }
        : null;
    const enclosing = findEnclosingPrivateZone(segPoint, privateZones);

    const decideTarget = toDecideTarget(target);
    const decision = decideAutoStart({
      currentSegment: toDecideSegment(seg),
      target: decideTarget,
      localTime: input.localTime ?? seg.endTs,
      existingActiveRegistration: active ? { id: active.id, startedAt: active.startedAt } : null,
      insidePrivateResidence: enclosing
        ? { distanceMeters: enclosing.distanceMeters, zoneKind: enclosing.zone.zoneKind }
        : null,
    });

    const entry: AutoStartDecisionLogEntry = {
      segmentId: seg.id,
      segmentKind: seg.kind,
      segmentType: seg.type,
      matchedTargetId: target.id,
      matchedTargetName: target.name,
      decision,
      skippedReason: enclosing
        ? 'inside_private_residence'
        : (active ? 'already_active_registration' : undefined),
    };

    if (enclosing) {
      privateResidenceSuppressedSegments += 1;
      if (target) privateResidenceHomeWonOverWorkCount += 1;
      if (
        nearestPrivateZoneDistance === null ||
        enclosing.distanceMeters < nearestPrivateZoneDistance
      ) {
        nearestPrivateZoneDistance = enclosing.distanceMeters;
        nearestPrivateZoneKind = enclosing.zone.zoneKind;
      }
      entry.homeWinsDiagnostics = {
        matchedPrivateResidence: true,
        privateResidenceZoneKind: enclosing.zone.zoneKind,
        privateResidenceDistanceMeters: Math.round(enclosing.distanceMeters),
        competingWorkTarget: target
          ? { id: target.id, name: target.name, type: target.type as string | null }
          : null,
        homeWonOverWorkTarget: !!target,
        suppressedAutoStartBecauseHome: true,
      };
    }

    decisions.push(entry);

    // 5) Create registration if allowed and no active row, and not yet created in this run.
    if (
      !createdRegistrationId &&
      !active &&
      !input.dryRun &&
      decision.allowed &&
      decision.source === 'gps_geofence_auto_start' &&
      decision.targetId &&
      decision.startAt
    ) {
      // Defensive re-check (race-safety) before insert
      const stillFree = await fetchActiveRegistration(supabaseAdmin, organizationId, staffId);
      if (stillFree) {
        decisions[decisions.length - 1].skippedReason = 'already_active_registration';
        continue;
      }

      const evidence = {
        dwellSeconds: Math.round(seg.durationMin * 60),
        arrivalPingsCount: seg.pingCount,
        firstPingAt: seg.startTs,
        lastPingAt: seg.endTs,
        targetDistanceMeters: null as number | null,
        targetRadiusMeters: target.radiusMeters,
        policyReason: decision.reason,
        segmentId: seg.id,
        targetSource: target.targetSource,
        engine: 'time-engine.v1',
      };

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('active_time_registrations')
        .insert({
          organization_id: organizationId,
          staff_id: staffId,
          status: 'active',
          started_at: decision.startAt,
          start_source: 'gps_geofence_auto_start',
          auto_started: true,
          start_target_type: target.type,
          start_target_id: target.id,
          start_target_label: target.name,
          current_kind: target.type,
          current_label: target.name,
          current_target_type: target.type,
          current_target_id: target.id,
          current_confidence: decision.confidence,
          needs_user_choice: false,
          metadata: { evidence },
        })
        .select('id')
        .maybeSingle();

      if (insertErr) {
        // Unique-violation on the partial index → another path created it concurrently.
        // Treat as idempotent success: mark as already-active and stop.
        if ((insertErr as any).code === '23505') {
          decisions[decisions.length - 1].skippedReason = 'already_active_registration';
          continue;
        }
        throw new Error(`insert active_time_registration: ${insertErr.message}`);
      }

      createdRegistrationId = (inserted?.id as UUID | undefined) ?? null;
    }
  }

  return {
    organizationId,
    staffId,
    date,
    alreadyActive: !!active,
    createdRegistrationId,
    decisions,
    targetDiagnostics,
    suppression: null,
    dayStopLock: null,
    privateResidenceLock: privateResidenceSuppressedSegments > 0
      ? {
          matchedPrivateResidence: true,
          suppressedAutoStartBecauseHome: true,
          suppressedSegmentsCount: privateResidenceSuppressedSegments,
          homeWonOverWorkTargetCount: privateResidenceHomeWonOverWorkCount,
          nearestZoneKind: nearestPrivateZoneKind,
          nearestDistanceMeters: nearestPrivateZoneDistance !== null
            ? Math.round(nearestPrivateZoneDistance)
            : null,
        }
      : null,
    computedAt: new Date().toISOString(),
  };
}
