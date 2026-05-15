// @ts-nocheck
/**
 * get-staff-presence-day
 * ──────────────────────
 * Returns full-day presence timeline for a single staff member.
 *
 * Inputs (POST body):
 *   - staffId    (required)
 *   - date       (YYYY-MM-DD; defaults to today)
 *   - organizationId (required if caller is service-role)
 *
 * Reads ONLY:
 *   - staff_members
 *   - staff_presence_events           (arrival/departure/signal_lost/signal_resumed)
 *   - staff_location_history          (last ping + GPS timeline source)
 *   - active_time_registrations       (active_timer_started/stopped events)
 *   - organization_locations / projects / large_projects (target resolution)
 *
 * NEVER writes anything. NEVER reads workdays/time_reports/LTE/travel.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  buildGpsDayTimeline,
  type GpsPing,
} from '../_shared/time-engine/buildGpsDayTimeline.ts';
import {
  resolveWorkTargets,
  toWorkTarget,
} from '../_shared/time-engine/resolveWorkTargets.ts';
import { loadGeoAnchors } from '../_shared/time-engine/loadGeoAnchors.ts';
import { getStockholmDayWindowUtc } from '../_shared/stockholmDayWindow.ts';
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';
import { smoothPresenceTimeline } from '../_shared/time-engine/smoothPresenceTimeline.ts';
import {
  buildPresenceDayBlocks,
  type PresenceDayBlocksResult,
  type TimerMarkerInput,
} from '../_shared/time-engine/buildPresenceDayBlocks.ts';
import { buildReportCandidateBlocks } from '../_shared/time-engine/buildReportCandidateBlocks.ts';
import { resolveActualWorkStartIso } from '../_shared/time-engine/resolveActualWorkStart.ts';
import { computeDayEndDecision } from '../_shared/time-engine/computeDayEndDecision.ts';
import { fetchAllStaffLocationPings } from '../_shared/timeEngine/fetchAllStaffLocationPings.ts';
import { clampBlocksToDayEndDecision } from '../_shared/time-engine/clampBlocksToDayEndDecision.ts';
// Location Truth pipeline (1.2 → 1.7) — pure transforms, never writes.
import {
  buildLocationTruthTimeline,
  type LocationTruthGpsPing,
  type LocationTruthExtraLocation,
  type LocationTruthPrivateResidence,
} from '../_shared/time-engine/buildLocationTruthTimeline.ts';
import { buildTransportFromLocationTruth } from '../_shared/time-engine/buildTransportFromLocationTruth.ts';
import {
  buildReportBlocksFromLocationTruth,
  type NameLookup,
} from '../_shared/time-engine/buildReportBlocksFromLocationTruth.ts';
import { enforceSingleVisibleTimeline } from '../_shared/time-engine/enforceSingleVisibleTimeline.ts';
import { cleanupNeedsReviewFromLocationTruth } from '../_shared/time-engine/cleanupNeedsReviewFromLocationTruth.ts';
import { decideDayEndFromLocationTruth } from '../_shared/time-engine/dayEndFromLocationTruth.ts';
import { buildDayEvidence } from '../_shared/time-engine/buildDayEvidence.ts';
import { buildLocationTruthFromDayEvidence } from '../_shared/time-engine/buildLocationTruthFromDayEvidence.ts';
import { buildWorkdayAllocationFromLocationTruth } from '../_shared/time-engine/buildWorkdayAllocationFromLocationTruth.ts';

// ── Lager 2.7 feature flag ────────────────────────────────────────────────
// Read-only: returnerar locationTruthSegments + locationTruthDiagnostics.
// Påverkar INTE display_blocks_json, report_candidate_blocks_json eller Gantt.
const ENABLE_LOCATION_TRUTH_V2_DIAGNOSTICS = true;

import { buildUnknownLocationDiagnostics } from '../_shared/diagnostics/buildUnknownLocationDiagnostics.ts';
import {
  computePlannedDaySignals,
  type BookingTimes,
} from '../_shared/workday/plannedDay.ts';

async function resolvePlannedEndOfDayIso(
  admin: any,
  organizationId: string,
  staffId: string,
  date: string,
): Promise<string | null> {
  try {
    const { data: assignments } = await admin
      .from('booking_staff_assignments')
      .select('booking_id')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date);
    const ids = Array.from(new Set((assignments ?? []).map((a: any) => a.booking_id).filter(Boolean)));
    if (ids.length === 0) return null;
    const { data: bookings } = await admin
      .from('bookings')
      .select('id, eventdate, rigdaydate, rigdowndate, event_start_time, event_end_time, rig_start_time, rig_end_time, rigdown_start_time, rigdown_end_time')
      .in('id', ids);
    if (!bookings || bookings.length === 0) return null;
    const anchor = new Date(`${date}T12:00:00Z`);
    return computePlannedDaySignals(bookings as BookingTimes[], anchor).plannedEndOfDay;
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SIGNAL_LIVE_SEC = 120;
const SIGNAL_RECENT_SEC = 600;
const SIGNAL_STALE_SEC = 3600;

const json = (s: number, b: any) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function classifySignal(ageSec: number | null) {
  if (ageSec == null) return 'no_signal';
  if (ageSec < SIGNAL_LIVE_SEC) return 'live';
  if (ageSec < SIGNAL_RECENT_SEC) return 'recent';
  if (ageSec < SIGNAL_STALE_SEC) return 'stale';
  return 'no_signal';
}

interface NearestTargetCandidate {
  targetLabel: string;
  targetType: string;
  targetId: string;
  targetSource: string;
  targetValidity: string;
  timeTrackingAllowed: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  distanceMeters: number | null;
  insideRadius: boolean;
  excludedReason: string | null;
}

interface TimelineRow {
  at: string;
  type:
    | 'arrival'
    | 'departure'
    | 'signal_lost'
    | 'signal_resumed'
    | 'transport'
    | 'unknown_place'
    | 'gps_gap'
    | 'active_timer_started'
    | 'active_timer_stopped';
  label: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  registrationId?: string | null;
  confidence?: number | null;
  source: string;
  gpsSegmentId?: string | null;
  endAt?: string | null;
  durationMin?: number | null;
  centerLat?: number | null;
  centerLng?: number | null;
  matchedTargetId?: string | null;
  matchedTargetType?: string | null;
  nearestTargets?: NearestTargetCandidate[];
  noMatchHint?: string | null;
  mergedSources?: string[];
  duplicates?: Array<{ source: string; at: string; label: string; registrationId?: string | null }>;
}

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


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
  // ── Auth ──
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!bearer) return json(401, { ok: false, error: 'unauthorized' });

  const okSvc = SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE;
  let userOrgId: string | null = null;
  if (!okSvc) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) return json(401, { ok: false, error: 'unauthorized' });
      const { data: prof } = await userClient
        .from('profiles')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
      userOrgId = prof?.organization_id ?? null;
    } catch {
      return json(401, { ok: false, error: 'unauthorized' });
    }
    if (!userOrgId) return json(403, { ok: false, error: 'no_org' });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const staffId: string | null = body?.staffId ?? null;
  const date: string = body?.date || new Date().toISOString().slice(0, 10);
  const orgId: string | null = okSvc ? (body?.organizationId ?? null) : userOrgId;

  if (!staffId) return json(400, { ok: false, error: 'staffId_required' });
  if (!orgId) return json(400, { ok: false, error: 'organizationId_required' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // ── Staff ──
  const { data: staff } = await admin
    .from('staff_members')
    .select('id, name, organization_id')
    .eq('id', staffId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!staff) return json(404, { ok: false, error: 'staff_not_found' });

  // Stockholm-lokal kalenderdag översatt till UTC-fönster (DST-säker)
  const { startUtc: dayStart, endUtc: dayEnd } = getStockholmDayWindowUtc(date);

  // ── Day Evidence Layer (Time Engine 1.x) ──────────────────────────────
  // READ-ONLY. Collects raw signals + diagnostics. NEVER feeds downstream
  // block builders. Exposed via `dayEvidenceDiagnostics` only.
  // ── Location Truth Layer (Time Engine 2.1, scaffold) ──────────────────
  // READ-ONLY. Konsumerar DayEvidence och returnerar diagnostics + (senare)
  // segments. Påverkar INTE buildLocationTruthTimeline / Time Engine block.
  let dayEvidenceDiagnostics: any = null;
  let locationTruthDiagnostics: any = null;
  let locationTruthSegments: any[] = [];
  if (ENABLE_LOCATION_TRUTH_V2_DIAGNOSTICS) {
    try {
      const dayEvidence = await buildDayEvidence({
        supabaseAdmin: admin,
        organizationId: orgId,
        staffId,
        date,
        dayStartUtc: dayStart,
        dayEndUtc: dayEnd,
      });
      dayEvidenceDiagnostics = dayEvidence.diagnostics;
      try {
        const lt = buildLocationTruthFromDayEvidence(dayEvidence);
        locationTruthDiagnostics = lt.diagnostics;
        locationTruthSegments = lt.segments;
      } catch (e: any) {
        console.warn('[presence-day] buildLocationTruthFromDayEvidence failed', e);
        locationTruthDiagnostics = { error: e?.message ?? String(e) };
      }
    } catch (e: any) {
      console.warn('[presence-day] buildDayEvidence failed', e);
      dayEvidenceDiagnostics = { error: e?.message ?? String(e) };
    }
  }

  // ── Presence events (arrival/departure/signal_lost/signal_resumed) ──
  const { data: presenceRows } = await admin
    .from('staff_presence_events')
    .select('event_at, event_type, target_type, target_id, target_label, source, confidence, gps_segment_id, metadata')
    .eq('organization_id', orgId)
    .eq('staff_id', staffId)
    .gte('event_at', dayStart)
    .lte('event_at', dayEnd)
    .order('event_at', { ascending: true });

  const timeline: TimelineRow[] = [];
  const timerMarkers: TimerMarkerInput[] = [];

  for (const r of presenceRows ?? []) {
    timeline.push({
      at: r.event_at,
      type: r.event_type,
      label: r.target_label ?? (r.event_type === 'signal_lost' ? 'GPS-signal saknas' : r.event_type === 'signal_resumed' ? 'GPS-signal åter' : 'Okänd plats'),
      targetType: r.target_type,
      targetId: r.target_id,
      targetLabel: r.target_label ?? null,
      registrationId: (r.metadata as any)?.registration_id ?? null,
      confidence: r.confidence,
      source: r.source ?? 'staff_presence_events',
      gpsSegmentId: r.gps_segment_id,
    });
  }

  // ── Active timers (started/stopped) ──
  // Overlap-intervall: started_at <= dayEnd AND (stopped_at IS NULL OR stopped_at >= dayStart).
  // Speglar exakt det fönster som health-checken använder, så att samma timers
  // syns på båda ställena.
  const { data: timers, error: timersErr } = await admin
    .from('active_time_registrations')
    .select('id, started_at, stopped_at, status, stop_source, metadata, start_target_type, start_target_id, start_target_label, current_label, current_target_type, current_target_id, start_source, auto_started')
    .eq('organization_id', orgId)
    .eq('staff_id', staffId)
    .lte('started_at', dayEnd)
    .or(`stopped_at.is.null,stopped_at.gte.${dayStart}`)
    .order('started_at', { ascending: true });
  if (timersErr) console.error('[presence-day] timers err', timersErr);

  let hasActiveTimer = false;
  let activeTimerInfo: any = null;

  // Location Truth 1.5 — bevis: active_time_registrations används BARA som
  // dagfönster. Räkna förekomsten av target-fält som motorn medvetet ignorerar.
  const activeTimerLocationIsolationDiagnostics = {
    activeRegistrationsSeen: 0,
    ignoredTargetFieldsCount: 0,
    usedAsDayWindowCount: 0,
    examples: [] as Array<{
      registrationId: string;
      startedAt: string | null;
      stoppedAt: string | null;
      ignoredFields: string[];
    }>,
  };

  for (const t of timers ?? []) {
    activeTimerLocationIsolationDiagnostics.activeRegistrationsSeen += 1;
    activeTimerLocationIsolationDiagnostics.usedAsDayWindowCount += 1;
    const ignored: string[] = [];
    if ((t as any).start_target_type) ignored.push('start_target_type');
    if ((t as any).start_target_id) ignored.push('start_target_id');
    if ((t as any).start_target_label) ignored.push('start_target_label');
    if ((t as any).current_label) ignored.push('current_label');
    if ((t as any).current_target_type) ignored.push('current_target_type');
    if ((t as any).current_target_id) ignored.push('current_target_id');
    if (ignored.length > 0) {
      activeTimerLocationIsolationDiagnostics.ignoredTargetFieldsCount += ignored.length;
      if (activeTimerLocationIsolationDiagnostics.examples.length < 10) {
        activeTimerLocationIsolationDiagnostics.examples.push({
          registrationId: t.id,
          startedAt: t.started_at ?? null,
          stoppedAt: t.stopped_at ?? null,
          ignoredFields: ignored,
        });
      }
    }
  }

  for (const t of timers ?? []) {
    const meta = (t.metadata as any) ?? {};
    const evidence = meta.evidence ?? {};
    // Timer 1.7 — active_time_registration är bara dagfönster.
    // Target-fält (start_target_*, current_*) är diagnostic-only och får
    // ALDRIG användas som work target av Time Engine. Vi bevarar dem inte
    // i timeline/markers längre — projekt/plats kommer från GPS/geofence/
    // assignment/location/session.
    const diagnosticLabel = 'Arbetsdag';
    if (t.started_at && t.started_at >= dayStart && t.started_at <= dayEnd) {
      timeline.push({
        at: t.started_at,
        type: 'active_timer_started',
        label: 'Arbetsdag startad',
        targetType: null,
        targetId: null,
        targetLabel: null,
        registrationId: t.id,
        confidence: null,
        source: t.start_source ?? evidence.engine ?? 'time-engine',
        gpsSegmentId: evidence.segmentId ?? null,
      });
      timerMarkers.push({
        id: `tm-start-${t.id}`,
        kind: 'started',
        at: t.started_at,
        label: 'Arbetsdag startad',
        targetType: null,
        targetId: null,
        registrationId: t.id,
        source: t.start_source ?? evidence.engine ?? 'time-engine',
      });
    }
    if (t.stopped_at && t.stopped_at >= dayStart && t.stopped_at <= dayEnd) {
      timeline.push({
        at: t.stopped_at,
        type: 'active_timer_stopped',
        label: `Arbetsdag stoppad (${t.stop_source ?? 'okänd'})`,
        targetType: null,
        targetId: null,
        targetLabel: null,
        registrationId: t.id,
        confidence: null,
        source: t.stop_source ?? 'unknown',
      });
      timerMarkers.push({
        id: `tm-stop-${t.id}`,
        kind: 'stopped',
        at: t.stopped_at,
        label: 'Arbetsdag slut',
        targetType: null,
        targetId: null,
        registrationId: t.id,
        source: t.stop_source ?? null,
      });
    }
    if (!t.stopped_at && t.status === 'active') {
      hasActiveTimer = true;
      activeTimerInfo = {
        id: t.id,
        startedAt: t.started_at,
        label: diagnosticLabel,
        targetType: null,
        targetId: null,
      };
    }
  }

  // ── GPS day timeline (transport / unknown_place / gps_gap) ──
  // Canonical paginated reader. Never use `.limit(N)` for day-wide GPS.
  const ownPingFetch = await fetchAllStaffLocationPings({
    supabaseAdmin: admin,
    organizationId: orgId,
    staffId,
    startUtc: dayStart,
    endUtc: dayEnd,
  });
  const pingRows = ownPingFetch.rows;
  const pingFetchDiagnostics = ownPingFetch.diagnostics;

  const pings: GpsPing[] = (pingRows ?? []).map((p: any) => ({
    ts: p.recorded_at,
    lat: Number(p.lat),
    lng: Number(p.lng),
    accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
    speedMps: p.speed != null ? Number(p.speed) : null,
  }));

  let lastPingAt: string | null = null;
  let lastPing: any = null;
  if (pings.length > 0) {
    lastPing = pings[pings.length - 1];
    lastPingAt = lastPing.ts;
  } else {
    // Fallback: most recent ping ever
    const { data: lp } = await admin
      .from('staff_location_history')
      .select('recorded_at')
      .eq('organization_id', orgId)
      .eq('staff_id', staffId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastPingAt = lp?.recorded_at ?? null;
  }

  let resolvedTargetsAll: any[] = [];
  let targetDiagnostics: any = null;
  let targetResolution: any = null;
  let targetMatchSummary: any = null;
  let gpsTimelineResult: any = null;
  let presenceDayBlocksResult: PresenceDayBlocksResult | null = null;

  try {
    const { targets: resolved, targetDiagnostics: tdiag, targetResolution: tres } = await resolveWorkTargets({
      organizationId: orgId,
      staffId,
      date,
      supabaseAdmin: admin,
    });
    resolvedTargetsAll = resolved;
    targetDiagnostics = tdiag;
    targetResolution = tres;

    const workTargets: WorkTarget[] = resolved
      .map(toWorkTarget)
      .filter((t): t is WorkTarget => !!t);

    // Load hard geo anchors (assistant_events + staff_presence_events).
    const geoAnchorsRes = await loadGeoAnchors({
      supabaseAdmin: admin,
      organizationId: orgId,
      staffId,
      startUtc: dayStart,
      endUtc: dayEnd,
      targets: workTargets,
    });

    const gpsTimeline = buildGpsDayTimeline({
      staffId,
      organizationId: orgId,
      date,
      pings,
      targets: workTargets,
      geoAnchors: geoAnchorsRes.anchors,
    });
    gpsTimelineResult = gpsTimeline;

    // Compute target matching summary
    const projectTargets = resolved.filter((r) => r.type === 'project');
    const bookingTargets = resolved.filter((r) => r.type === 'booking');
    const warehouseTargets = resolved.filter((r) => r.type === 'warehouse');
    const locationTargets = resolved.filter((r) => r.type === 'location');
    const targetsWithCoords = resolved.filter((r) => r.latitude != null && r.longitude != null);
    const targetsMissingCoords = resolved.filter((r) => r.latitude == null || r.longitude == null);
    const projectsMissingCoords = projectTargets.filter((r) => r.latitude == null || r.longitude == null);
    const bookingsMissingCoords = bookingTargets.filter((r) => r.latitude == null || r.longitude == null);
    const matchedTargetIds = new Set(
      gpsTimeline.segments
        .filter((s) => s.matchedTargetId)
        .map((s) => `${s.matchedTargetType}:${s.matchedTargetId}`),
    );
    const matchedTargetsList = resolved.filter((r) => {
      const kind = r.type === 'location' ? 'organization_location' : r.type;
      return matchedTargetIds.has(`${kind}:${r.id}`);
    });
    const matchedProjectTargets = matchedTargetsList.filter((r) => r.type === 'project');
    const matchedBookingTargets = matchedTargetsList.filter((r) => r.type === 'booking');
    const unmatchedProjectTargets = projectTargets.filter((r) => {
      return !matchedTargetIds.has(`project:${r.id}`);
    });

    targetMatchSummary = {
      totalTargets: resolved.length,
      projectTargets: projectTargets.length,
      bookingTargets: bookingTargets.length,
      warehouseTargets: warehouseTargets.length,
      locationTargets: locationTargets.length,
      targetsWithCoordinates: targetsWithCoords.length,
      targetsMissingCoordinates: targetsMissingCoords.length,
      projectsMissingCoordinates: projectsMissingCoords.length,
      bookingsMissingCoordinates: bookingsMissingCoords.length,
      matchedTargets: matchedTargetsList.length,
      matchedProjectTargets: matchedProjectTargets.length,
      matchedBookingTargets: matchedBookingTargets.length,
      unmatchedProjectTargets: unmatchedProjectTargets.length,
      excludedByReason: tdiag?.excludedByReason ?? {},
      warnings: tdiag?.warnings ?? [],
    };

    // Helper: compute nearest target candidates from a center
    const computeNearest = (
      cLat: number | null,
      cLng: number | null,
    ): NearestTargetCandidate[] => {
      if (cLat == null || cLng == null) return [];
      const cands: NearestTargetCandidate[] = resolved.map((r) => {
        const hasCoords = r.latitude != null && r.longitude != null;
        const distance = hasCoords ? haversineM(cLat, cLng, r.latitude!, r.longitude!) : null;
        const insideRadius =
          distance != null && r.radiusMeters != null && distance <= r.radiusMeters;
        const excluded =
          r.targetValidity !== 'valid'
            ? r.targetValidity
            : !r.timeTrackingAllowed
            ? 'not_allowed_for_time_tracking'
            : !hasCoords
            ? 'missing_coordinates'
            : null;
        return {
          targetLabel: r.name,
          targetType: r.type,
          targetId: r.id,
          targetSource: r.targetSource,
          targetValidity: r.targetValidity,
          timeTrackingAllowed: r.timeTrackingAllowed,
          lat: r.latitude,
          lng: r.longitude,
          radiusMeters: r.radiusMeters,
          distanceMeters: distance != null ? Math.round(distance) : null,
          insideRadius,
          excludedReason: excluded,
        };
      });
      // Sort: missing coords last; otherwise by distance asc
      cands.sort((a, b) => {
        if (a.distanceMeters == null && b.distanceMeters == null) return 0;
        if (a.distanceMeters == null) return 1;
        if (b.distanceMeters == null) return -1;
        return a.distanceMeters - b.distanceMeters;
      });
      return cands.slice(0, 5);
    };

    // Pre-compute target labels by id (used for known_site labels)
    const targetById = new Map<string, any>();
    for (const r of resolved) {
      const kind = r.type === 'location' ? 'organization_location' : r.type;
      targetById.set(`${kind}:${r.id}`, r);
    }

    // Set of (targetType:targetId) where staff_presence_events already contributed
    // an arrival — used so we don't double-list known_site as a separate row.
    const presenceArrivalKeys = new Set<string>();
    for (const r of presenceRows ?? []) {
      if (r.event_type === 'arrival' && r.target_type && r.target_id) {
        presenceArrivalKeys.add(`${r.target_type}:${r.target_id}`);
      }
    }

    for (const seg of gpsTimeline.segments) {
      let type: TimelineRow['type'] | null = null;
      let label = seg.label ?? '';
      if (seg.kind === 'travel' || seg.type === 'transport') {
        type = 'transport';
        label = 'Transport';
      } else if (seg.kind === 'gps_gap' || seg.type === 'gps_gap') {
        type = 'gps_gap';
        label = 'GPS-glapp';
      } else if (seg.type === 'unknown_place') {
        type = 'unknown_place';
        label = seg.label ?? 'Okänd plats';
      } else if (seg.type === 'known_site') {
        // Show known-site presence even when staff_presence_events is empty.
        // Skip if there's already an arrival from staff_presence_events for the
        // same target — that authoritative source wins.
        const matchedKey = seg.matchedTargetId
          ? `${seg.matchedTargetType}:${seg.matchedTargetId}`
          : null;
        if (matchedKey && presenceArrivalKeys.has(matchedKey)) continue;
        const t = matchedKey ? targetById.get(matchedKey) : null;
        type = 'arrival';
        label = t?.name ? `På känd plats: ${t.name}` : 'På känd plats';
      }
      if (!type) continue;

      // Debug: include nearest targets for interesting segments
      const isLongTransport = type === 'transport' && (seg.durationMin ?? 0) >= 5;
      const needsDebug =
        type === 'unknown_place' ||
        type === 'gps_gap' ||
        isLongTransport ||
        (seg.kind === 'stay' && !seg.matchedTargetId);

      let nearest: NearestTargetCandidate[] = [];
      let noMatchHint: string | null = null;
      if (needsDebug) {
        nearest = computeNearest(seg.centerLat, seg.centerLng);
        const projectsInList = nearest.filter((c) => c.targetType === 'project');
        if (projectsInList.length === 0 && projectTargets.length > 0) {
          noMatchHint = 'Projekt saknas i target resolver för denna dag';
        } else {
          const closestProject = projectsInList[0];
          if (closestProject) {
            if (closestProject.lat == null || closestProject.lng == null) {
              noMatchHint = 'Projekt hittades men saknar koordinater';
            } else if (!closestProject.insideRadius && closestProject.distanceMeters != null) {
              const radius = closestProject.radiusMeters ?? 0;
              const outside = Math.max(0, closestProject.distanceMeters - radius);
              noMatchHint = `Projekt hittades men GPS låg ${outside} m utanför radius (avstånd ${closestProject.distanceMeters} m, radius ${radius} m)`;
            }
          }
        }
      }

      timeline.push({
        at: seg.startTs,
        endAt: seg.endTs,
        durationMin: seg.durationMin ?? null,
        type,
        label,
        targetType: seg.matchedTargetType ?? null,
        targetId: seg.matchedTargetId ?? null,
        targetLabel: type === 'arrival' ? label : null,
        confidence: null,
        source: 'gps_day_timeline',
        gpsSegmentId: seg.id,
        centerLat: seg.centerLat,
        centerLng: seg.centerLng,
        matchedTargetId: seg.matchedTargetId,
        matchedTargetType: seg.matchedTargetType,
        nearestTargets: needsDebug ? nearest : undefined,
        noMatchHint,
      });
    }
  } catch (e) {
    console.error('[presence-day] gps timeline failed', e);
  }


  // ── Sort timeline ──
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  // ── Deduplicate timeline rows ──
  // Same logical event may surface from multiple sources (active_time_registrations,
  // staff_presence_events, gps_day_timeline). Collapse to a single canonical row
  // and keep the other sources in `duplicates` (collapsible debug in UI).
  const dedupKey = (r: TimelineRow): string => {
    if (r.registrationId && (r.type === 'active_timer_started' || r.type === 'active_timer_stopped')) {
      return `reg:${r.registrationId}|${r.type}`;
    }
    const atSec = r.at.slice(0, 19); // round to second
    return `${r.type}|${atSec}|${r.targetLabel ?? r.label}|${r.targetType ?? ''}|${r.targetId ?? ''}`;
  };
  const sourceRank: Record<string, number> = {
    'time-engine': 0,
    'active_time_registrations': 0,
    'user_timer': 0,
    'auto_engine': 0,
    'staff_presence_events': 1,
    'gps_day_timeline': 2,
  };
  const rankOf = (s: string) => sourceRank[s] ?? 5;
  const buckets = new Map<string, TimelineRow>();
  for (const row of timeline) {
    const key = dedupKey(row);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { ...row, mergedSources: [row.source] });
      continue;
    }
    const dup = { source: row.source, at: row.at, label: row.label, registrationId: row.registrationId ?? null };
    if (rankOf(row.source) < rankOf(existing.source)) {
      const prevDup = { source: existing.source, at: existing.at, label: existing.label, registrationId: existing.registrationId ?? null };
      buckets.set(key, {
        ...row,
        mergedSources: Array.from(new Set([...(existing.mergedSources ?? []), row.source])),
        duplicates: [...(existing.duplicates ?? []), prevDup],
      });
    } else {
      existing.mergedSources = Array.from(new Set([...(existing.mergedSources ?? [existing.source]), row.source]));
      existing.duplicates = [...(existing.duplicates ?? []), dup];
    }
  }
  const dedupedTimeline = Array.from(buckets.values()).sort((a, b) => a.at.localeCompare(b.at));
  const dedupRemoved = timeline.length - dedupedTimeline.length;

  // ── Smoothing layer (presentation only) ──
  // Slå ihop GPS-brus runt samma target till sammanhängande presence-block.
  // Påverkar ALDRIG raw gpsDayTimeline / time_reports / workdays / LTE / travel.
  const smoothing = smoothPresenceTimeline(dedupedTimeline as any);
  const smoothedTimeline = smoothing.smoothed as any[];

  // ── New deterministic presence-day-blocks engine ──
  // Replaces ad-hoc UI smoothing with semantic blocks. Pure transform of the
  // raw GpsDayTimelineResult + active-timer markers. Never writes anything,
  // never affects auto-start, never creates time_reports/workdays/LTE/travel.
  // ── Peer GPS timelines (companion-route evidence) ──
  // Fetch other staff's pings for the same org/day. Used as evidence to
  // bridge short transport gaps. Peer pings are NEVER copied into this
  // staff's data and never trigger writes.
  let peerGpsTimelines: any[] = [];
  let peerPingFetchDiagnostics: any = null;
  try {
    const peerFetch = await fetchAllStaffLocationPings({
      supabaseAdmin: admin,
      organizationId: orgId,
      staffId: null,
      excludeStaffId: staffId,
      startUtc: dayStart,
      endUtc: dayEnd,
      select: 'staff_id, lat, lng, recorded_at',
      cap: 40_000,
    });
    const peerRows = peerFetch.rows;
    peerPingFetchDiagnostics = peerFetch.diagnostics;
    const grouped = new Map<string, any[]>();
    for (const r of peerRows) {
      const arr = grouped.get(r.staff_id) ?? [];
      arr.push({ ts: r.recorded_at, lat: Number(r.lat), lng: Number(r.lng) });
      grouped.set(r.staff_id, arr);
    }
    let nameMap = new Map<string, string>();
    if (grouped.size > 0) {
      const ids = Array.from(grouped.keys());
      const { data: staffRows } = await admin
        .from('staff_members')
        .select('id, name')
        .in('id', ids);
      for (const s of staffRows ?? []) nameMap.set(s.id, s.name ?? null);
    }
    peerGpsTimelines = Array.from(grouped.entries()).map(([sid, pings]) => ({
      staffId: sid,
      staffName: nameMap.get(sid) ?? null,
      pings,
      assignedTargetKeys: [], // best-effort; companion still works on geography
    }));
  } catch (e) {
    console.warn('[presence-day] peer pings fetch failed', e);
  }

  if (gpsTimelineResult) {
    try {
      presenceDayBlocksResult = buildPresenceDayBlocks({
        staffId,
        organizationId: orgId,
        date,
        gpsTimeline: gpsTimelineResult,
        timerMarkers,
        peerGpsTimelines,
        targets: (resolvedTargetsAll ?? []).map(toWorkTarget).filter((t: any) => !!t),
      });
    } catch (e) {
      console.error('[presence-day] buildPresenceDayBlocks failed', e);
    }
  }

  // ── Report candidate blocks (canonical engine for Tidrapporter UI) ──
  // Pure transform on top of presenceDayBlocks + active_time_registrations.
  // Same engine that report-candidate-blocks-health validates as PASS.
  // Never writes anything. Never reads legacy LTE/travel/time_reports.
  let reportCandidateResult: any = null;
  let reportCandidateError: string | null = null;
  let locationTruthResult: any = null;
  let locationTruthError: string | null = null;
  if (presenceDayBlocksResult) {
    try {
      const nowIso = new Date().toISOString();
      const dayCutoff = dayEnd;
      const activeRegs = (timers ?? []).map((r: any) => {
        const isActive = (r.status ?? '').toLowerCase() === 'active';
        const stoppedAt: string | null =
          r.stopped_at ?? (isActive ? (nowIso < dayCutoff ? nowIso : dayCutoff) : null);
        return {
          id: r.id,
          staffId: staffId,
          organizationId: orgId,
          startedAt: r.started_at,
          stoppedAt,
          status: r.status ?? null,
          startSource: r.start_source ?? null,
          stopSource: r.stop_source ?? null,
          autoStarted: r.auto_started ?? null,
          // Timer 1.7 — target stripped (diagnostic only); active_time_registration
          // is day window only and must not drive work attribution.
          targetType: null,
          targetId: null,
          targetLabel: null,
          metadata: { diagnostic_only: true, original_metadata: r.metadata ?? null },
        };
      });
      // Read-only home/sleep anchors for this staff. Used by report engine
      // to exclude pre-work "Okänd plats" rows that match a known home zone.
      let homeAnchors: { id: string; kind: string; lat: number; lng: number; radiusM: number; label: string | null }[] = [];
      try {
        const todayIso = `${date}T23:59:59Z`;
        const [{ data: inferred }, { data: privateZones }] = await Promise.all([
          admin
            .from('staff_inferred_home_locations')
            .select('id, kind, lat, lng, radius_m, valid_from, valid_until')
            .eq('staff_id', staffId)
            .lte('valid_from', todayIso),
          admin
            .from('staff_private_zones')
            .select('id, kind, lat, lng, radius_m, label, active')
            .eq('staff_id', staffId)
            .eq('active', true),
        ]);
        for (const r of inferred ?? []) {
          if (r.valid_until && r.valid_until < `${date}T00:00:00Z`) continue;
          if (r.lat == null || r.lng == null) continue;
          homeAnchors.push({
            id: r.id, kind: r.kind ?? 'home_sleep',
            lat: Number(r.lat), lng: Number(r.lng),
            radiusM: Number(r.radius_m ?? 200), label: null,
          });
        }
        for (const r of privateZones ?? []) {
          if (r.lat == null || r.lng == null) continue;
          if (r.kind && !['home_sleep', 'manual_ignore', 'recurring_night'].includes(r.kind)) continue;
          homeAnchors.push({
            id: r.id, kind: r.kind ?? 'manual_ignore',
            lat: Number(r.lat), lng: Number(r.lng),
            radiusM: Number(r.radius_m ?? 200), label: r.label ?? null,
          });
        }
      } catch (e) {
        console.warn('[presence-day] home anchors fetch failed', e);
      }

      // Bygg openActiveRegistrationContext från första öppna registrationen.
      // Detta håller ihop dagens rapport till ETT pågående arbetsblock istället
      // för att GPS-glapp/okända kortare perioder bryter upp dagen.
      const openReg = (timers ?? []).find(
        (t: any) => !t.stopped_at && (t.status ?? '').toLowerCase() === 'active',
      );
      // Timer 1.7 — active_time_registration är dagfönster, INTE target.
      // Strippa target-fälten innan vi skickar in i Time Engine. Builder
      // får inte använda dem för work attribution / synth-block / extension.
      const openActiveRegistration = openReg
        ? {
            registrationId: openReg.id,
            startedAtIso: openReg.started_at,
            targetType: null,
            targetId: null,
            targetLabel: null,
            currentLabel: null,
          }
        : null;

      const plannedEndOfDayIso = await resolvePlannedEndOfDayIso(admin, orgId, staffId, date);

      // Time Engine — autoritativ "verkligt arbetsstart"-gräns. Suppresserar
      // pre-work geofence/midnatts-brus (00:00 ENTER nära warehouse osv).
      const actualWorkStartIso = await resolveActualWorkStartIso(
        admin, orgId, staffId, dayStart, dayEnd,
      );

      reportCandidateResult = buildReportCandidateBlocks({
        staffId,
        organizationId: orgId,
        date,
        presenceDayBlocks: presenceDayBlocksResult.blocks,
        activeTimeRegistrations: activeRegs,
        homeAnchors,
        openActiveRegistration,
        plannedEndOfDayIso,
        actualWorkStartIso,
        lastFreshEvidenceAtIso: pings[pings.length - 1]?.ts ?? null,
      });

      // Time Engine 4.5 + 3.11 — slutgiltig dag-slut-klamp i live-vägen.
      // Samma steg som backfill-staff-day-report-cache kör innan cache skrivs.
      // Utan detta kan adminvyns live-anrop visa block som rullar förbi
      // dayEndDecision.endedAt (eller efter Stockholm-midnatt på historiska dagar).
      try {
        const dayEndDecision = computeDayEndDecision({
          date,
          dayStartUtcIso: dayStart,
          dayEndUtcIso: dayEnd,
          blocks: reportCandidateResult.blocks ?? [],
          activeRegistrations: activeRegs as any,
          openActiveRegistration,
          lastGpsPingAtIso: pings[pings.length - 1]?.ts ?? null,
          homeAnchors,
          nowIso,
          plannedEndOfDayIso,
        });
        const clamp = clampBlocksToDayEndDecision({
          date,
          blocks: reportCandidateResult.blocks ?? [],
          dayEndDecision,
          nowIso,
          openActiveStartedAtIso: openActiveRegistration?.startedAtIso ?? null,
        });
        (reportCandidateResult as any).blocks = clamp.blocks;
        (reportCandidateResult as any).droppedAfterDayEnd = clamp.dropped;
        (reportCandidateResult as any).dayEndDecision = dayEndDecision;
        (reportCandidateResult as any).dayEndClampDiagnostics = clamp.dayEndClampDiagnostics;
        (reportCandidateResult as any).clampDiagnostics = clamp.diagnostics;

        // Räkna om summary-minuter på de KLAMPADE blocken så UI-värden
        // i adminvyn matchar det som faktiskt visas.
        const sum = reportCandidateResult.summary ?? {};
        let work = 0, transport = 0, unknown = 0, needsReview = 0;
        for (const b of clamp.blocks) {
          const dur = Number(b.durationMinutes ?? 0);
          if (b.kind === 'work') work += dur;
          else if (b.kind === 'transport') transport += dur;
          else if (b.kind === 'unknown_place' || b.kind === 'unknown') unknown += dur;
          if (b.reviewState === 'needs_review') needsReview += dur;
        }
        reportCandidateResult.summary = {
          ...sum,
          workMinutes: work,
          transportMinutes: transport,
          unknownMinutes: unknown,
          needsReviewMinutes: needsReview,
          dayEndDecision,
          dayEndClampDiagnostics: clamp.dayEndClampDiagnostics,
        };
      } catch (e) {
        console.error('[presence-day] dayEnd clamp failed', e);
      }

      // ── Location Truth pipeline (1.2 → 1.7) ──
      // Pure parallel pipeline that answers: "Where is the person over time?"
      // Runs independently of reportCandidate. Never writes anything. Never
      // touches LTE/time_reports/workdays. Output is exposed under
      // `locationTruth` for /staff-management/time-reports audit + diagnostics.
      try {
        // 1) Map pings to LocationTruthGpsPing
        const ltPings: LocationTruthGpsPing[] = pings.map((p: any, i: number) => ({
          id: `p${i}`,
          ts: p.ts,
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM ?? null,
          speedMps: p.speedMps ?? null,
        }));

        // 2) Build extra locations (warehouses + organization_locations) from
        //    resolveWorkTargets output. WorkTargets we already pass via
        //    `resolvedTargets`; the matcher dedups by key.
        const extraLocations: LocationTruthExtraLocation[] = [];
        for (const r of resolvedTargetsAll ?? []) {
          if (r.type !== 'warehouse' && r.type !== 'organization_location') continue;
          if (r.latitude == null || r.longitude == null) continue;
          extraLocations.push({
            id: r.id,
            label: r.name ?? 'Plats',
            kind: r.type === 'warehouse' ? 'warehouse' : 'organization_location',
            center: { lat: Number(r.latitude), lng: Number(r.longitude) },
            radiusM: Number(r.radiusMeters ?? 200),
            polygon: r.polygon ?? null,
          });
        }

        // 3) Private residences from already-loaded homeAnchors (inferred + zones).
        const privateResidenceLocations: LocationTruthPrivateResidence[] =
          (homeAnchors ?? []).map((h) => ({
            id: h.id,
            label: h.label ?? null,
            center: { lat: h.lat, lng: h.lng },
            radiusM: h.radiusM,
            polygon: null,
          }));

        // 4) Build NameLookup so team labels never become titles.
        const nameLookup: NameLookup = {
          projectName: {},
          largeProjectName: {},
          bookingName: {},
          locationName: {},
          plannedAssignmentLabel: {},
        };
        for (const r of resolvedTargetsAll ?? []) {
          if (!r?.id || !r?.name) continue;
          if (r.type === 'project') nameLookup.projectName![r.id] = r.name;
          else if (r.type === 'large_project') nameLookup.largeProjectName![r.id] = r.name;
          else if (r.type === 'booking') nameLookup.bookingName![r.id] = r.name;
          else if (r.type === 'warehouse' || r.type === 'organization_location') {
            nameLookup.locationName![r.id] = r.name;
          }
        }

        const ltWorkTargets = (resolvedTargetsAll ?? [])
          .map(toWorkTarget)
          .filter((t: any) => !!t);

        // 5) buildLocationTruthTimeline
        const ltTimeline = buildLocationTruthTimeline({
          staffId,
          organizationId: orgId,
          date,
          gpsPings: ltPings,
          resolvedTargets: ltWorkTargets,
          locations: extraLocations,
          privateResidenceLocations,
          assignments: [],
          stockholmDayWindow: { startUtc: dayStart, endUtc: dayEnd },
        });

        // 6) buildTransportFromLocationTruth
        const ltTransport = buildTransportFromLocationTruth({
          locationTruthSegments: ltTimeline.segments,
        });

        // 7) buildReportBlocksFromLocationTruth
        const ltReport = buildReportBlocksFromLocationTruth({
          locationTruthSegments: ltTimeline.segments,
          transportSegments: ltTransport.transportSegments,
          nameLookup,
        });

        // 8) enforceSingleVisibleTimeline
        const ltSingle = enforceSingleVisibleTimeline(ltReport.reportBlocks);

        // 9) cleanupNeedsReviewFromLocationTruth
        const ltCleanup = cleanupNeedsReviewFromLocationTruth(ltSingle.blocks);

        // 10) decideDayEndFromLocationTruth — uses active timer ONLY for
        //     start/stop window, never for target/label.
        const ltDayEnd = decideDayEndFromLocationTruth({
          date,
          staffId,
          stockholmDayWindow: { startUtc: dayStart, endUtc: dayEnd },
          locationTruthSegments: ltTimeline.segments,
          transportSegments: ltTransport.transportSegments,
          activeTimer: openReg
            ? {
                startedAt: openReg.started_at ?? null,
                stoppedAt: openReg.stopped_at ?? null,
                status: (openReg.status ?? 'active') as any,
              }
            : null,
          isHistorical: dayEnd < nowIso,
          lastGpsPingAt: pings[pings.length - 1]?.ts ?? null,
        });

        locationTruthResult = {
          segments: ltTimeline.segments,
          transportSegments: ltTransport.transportSegments,
          reportBlocks: ltCleanup.blocks,
          dayEndDecision: ltDayEnd.decision,
          diagnostics: {
            ...ltTimeline.diagnostics,
            transport: ltTransport.diagnostics,
            internalMovementsAbsorbed: ltTransport.internalMovementAbsorptions,
            label: ltReport.diagnostics,
            singleTimeline: ltSingle.diagnostics,
            needsReviewCleanup: ltCleanup.diagnostics,
            dayEnd: ltDayEnd.diagnostics,
          },
        };
      } catch (e: any) {
        locationTruthError = e?.message ?? String(e);
        console.error('[presence-day] locationTruth pipeline failed', e);
      }
    } catch (e: any) {
      reportCandidateError = e?.message ?? String(e);
      console.error('[presence-day] buildReportCandidateBlocks failed', e);
    }
  }

  const ageSec = lastPingAt
    ? Math.floor((Date.now() - new Date(lastPingAt).getTime()) / 1000)
    : null;
  const signal = classifySignal(ageSec);

  // Current status: latest arrival/smoothed_presence without later departure
  let currentLabel = 'Okänt';
  let currentTargetType: string | null = null;
  for (let i = smoothedTimeline.length - 1; i >= 0; i--) {
    const ev = smoothedTimeline[i];
    if (ev.type === 'arrival' || ev.type === 'smoothed_presence') {
      currentLabel = ev.label;
      currentTargetType = ev.targetType ?? null;
      break;
    }
    if (ev.type === 'departure') {
      currentLabel = `Lämnade ${ev.label}`;
      break;
    }
  }
  if (signal === 'no_signal') currentLabel = 'Signal saknas';

  // ── READ-ONLY: Why is this block "Arbete – okänd plats"? ──
  // Pure aggregator over already-loaded data. Never mutates state.
  // Only active_time_registrations may represent an active workday.
  // Display timeline comes from staff_day_report_cache (admin) /
  // get-mobile-staff-day-report (mobile).
  let unknownLocationDiagnostics: any = null;
  try {
    unknownLocationDiagnostics = buildUnknownLocationDiagnostics({
      staffId,
      staffName: staff?.name ?? null,
      date,
      reportCandidateBlocks: (reportCandidateResult?.blocks ?? []) as any,
      locationTruthBlocks: (locationTruthResult?.reportBlocks ?? []) as any,
      gpsSegments: (gpsTimelineResult?.segments ?? []) as any,
      resolvedTargets: (resolvedTargetsAll ?? []) as any,
      pings: pings as any,
      homeAnchors: [], // homeAnchors lives inside the try-block above; safe to omit if scope-hidden
    });
  } catch (e) {
    console.warn('[presence-day] unknownLocationDiagnostics failed', e);
  }

  return json(200, {
    ok: true,
    staff: { id: staff.id, name: staff.name },
    date,
    summary: {
      lastPingAt,
      pingAgeSec: ageSec,
      signal,
      hasActiveTimer,
      activeTimer: activeTimerInfo,
      currentLabel,
      currentTargetType,
      smoothing: {
        blocksCount: smoothing.stats.blocksCreated,
        suppressedNoiseCount: smoothing.stats.suppressedNoise,
        mergedArrivals: smoothing.stats.mergedArrivals,
        rawRowCount: smoothing.stats.inputRows,
        smoothedRowCount: smoothing.stats.smoothedRows,
      },
    },
    activeTimerLocationIsolationDiagnostics,
    timeline: smoothedTimeline,
    rawTimeline: dedupedTimeline,
    smoothedBlocks: smoothing.blocks,
    // ── New presence-day-blocks engine output ──
    // Default UI MUST consume `presenceDayBlocks`.
    // `rawGpsTimeline` and `technicalTimeline` are only for the
    // "Visa tekniska GPS-segment" toggle.
    presenceDayBlocks: presenceDayBlocksResult?.blocks ?? [],
    // ── Canonical report-candidate engine output (Tidrapporter UI) ──
    // Default Tidrapporter timeline MUST consume `reportCandidateBlocks`.
    reportCandidateBlocks: reportCandidateResult?.blocks ?? [],
    reportCandidateSummary: reportCandidateResult?.summary ?? null,
    excludedPreWorkBlocks: reportCandidateResult?.excludedPreWorkBlocks ?? [],
    preWorkExclusionDiagnostics: reportCandidateResult?.preWorkExclusionDiagnostics ?? null,
    // ── Location Truth pipeline output (1.2 → 1.7) ──
    // Pure parallel pipeline. Read-only audit input for /staff-management/time-reports.
    locationTruth: locationTruthResult
      ? {
          available: true,
          segments: locationTruthResult.segments,
          transportSegments: locationTruthResult.transportSegments,
          reportBlocks: locationTruthResult.reportBlocks,
          dayEndDecision: locationTruthResult.dayEndDecision,
          diagnostics: locationTruthResult.diagnostics,
          error: null,
        }
      : { available: false, error: locationTruthError },
    reportCandidateDiagnostics: reportCandidateResult
      ? {
          presenceDayBlocksCount: presenceDayBlocksResult?.blocks?.length ?? 0,
          reportCandidateBlocksCount: reportCandidateResult.blocks.length,
          activeTimeRegistrationsCount: (timers ?? []).length,
          openActiveTimeRegistrationsCount: (timers ?? []).filter(
            (t: any) => !t.stopped_at && (t.status ?? '').toLowerCase() === 'active',
          ).length,
          targetResolution,
          legacyLocationTimeEntriesUsedAsInput: false,
          preWorkExclusion: reportCandidateResult.preWorkExclusionDiagnostics ?? null,
          dayEndDecision: (reportCandidateResult as any).dayEndDecision ?? null,
          dayEndClampDiagnostics:
            (reportCandidateResult as any).dayEndClampDiagnostics ?? null,
          droppedAfterDayEnd:
            ((reportCandidateResult as any).droppedAfterDayEnd ?? []).map((b: any) => ({
              id: b.id, kind: b.kind, startAt: b.startAt, endAt: b.endAt,
              targetLabel: b.targetLabel ?? b.title ?? null,
            })),
          timeEngineClarityDiagnostics: {
            dayEndDecision: (reportCandidateResult as any).dayEndDecision ?? null,
            sessionConsolidationDiagnostics:
              reportCandidateResult.summary?.sessionConsolidationDiagnostics ?? null,
            singleTimelineDiagnostics:
              (reportCandidateResult.summary as any)?.singleTimelineDiagnostics ?? null,
            labelResolutionDiagnostics:
              (reportCandidateResult.summary as any)?.labelResolutionDiagnostics ?? null,
            commutePolicyDiagnostics:
              (reportCandidateResult.summary as any)?.commutePolicyDiagnostics ?? null,
            workAreaToleranceDiagnostics:
              (reportCandidateResult.summary as any)?.workAreaToleranceDiagnostics ?? null,
            openTimerClampDiagnostics:
              (reportCandidateResult.summary as any)?.openTimerClampDiagnostics ?? null,
            dayEndClampDiagnostics:
              (reportCandidateResult as any).dayEndClampDiagnostics ?? null,
          },
          error: null,
        }
      : { error: reportCandidateError, available: false, targetResolution, legacyLocationTimeEntriesUsedAsInput: false },
    targetResolution,
    presenceDayBlocksRawEvidence: presenceDayBlocksResult?.evidenceBlocks ?? [],
    presenceDaySummary: presenceDayBlocksResult?.summary ?? null,
    presenceDayAggregation: presenceDayBlocksResult?.aggregation ?? null,
    rawGpsTimeline: gpsTimelineResult
      ? {
          segments: gpsTimelineResult.segments,
          gaps: gpsTimelineResult.gaps,
          qualitySummary: gpsTimelineResult.qualitySummary,
          targetMatchSummary: gpsTimelineResult.targetMatchSummary,
          classificationDiagnostics: gpsTimelineResult.classificationDiagnostics,
        }
      : null,
    classificationDiagnostics: gpsTimelineResult?.classificationDiagnostics ?? null,
    technicalTimeline: dedupedTimeline,
    counts: {
      total: smoothedTimeline.length,
      rawTotal: timeline.length,
      duplicatesCollapsed: dedupRemoved,
      presenceEvents: (presenceRows ?? []).length,
      timerEvents: smoothedTimeline.filter((t: any) => t.type?.startsWith?.('active_timer_')).length,
      gpsSegments: smoothedTimeline.filter((t: any) =>
        ['transport', 'unknown_place', 'gps_gap', 'smoothed_presence'].includes(t.type),
      ).length,
      smoothedBlocks: smoothing.blocks.length,
      suppressedNoise: smoothing.stats.suppressedNoise,
    },
    targetMatchSummary,
    unknownLocationDiagnostics,
    dayEvidenceDiagnostics,
    // Lager 2.10 — DayEvidence-baserad LocationTruth V2 (read-only).
    locationTruthV2Diagnostics: locationTruthDiagnostics,
    locationTruthV2Segments: locationTruthSegments,
    /** @deprecated Använd locationTruthV2Diagnostics. Tas bort när konsumenter bytt. */
    locationTruthDiagnostics,
    /** @deprecated Använd locationTruthV2Segments. Tas bort när konsumenter bytt. */
    locationTruthSegments,

    targets: resolvedTargetsAll.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      targetSource: r.targetSource,
      targetValidity: r.targetValidity,
      timeTrackingAllowed: r.timeTrackingAllowed,
      latitude: r.latitude,
      longitude: r.longitude,
      radiusMeters: r.radiusMeters,
      status: r.status,
      dateRelevance: r.dateRelevance,
      matchRole: r.matchRole,
      assignmentAnchor: r.assignmentAnchor,
      canAutoMatchAsWork: r.canAutoMatchAsWork,
      addressAnchorKey: r.addressAnchorKey,
      rawAddress: r.rawAddress,
      notes: r.diagnostics?.notes ?? [],
    })),
  });
  } catch (e: any) {
    console.error('[get-staff-presence-day] fatal', e);
    return json(200, { ok: false, error: e?.message ?? String(e) });
  }
});
