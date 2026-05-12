// @ts-nocheck
/**
 * backfill-staff-day-report-cache
 * ─────────────────────────────────
 * Read-only-on-source, write-only-to-cache backfill.
 *
 * For each (org, staff, date) it runs the same Time-Engine pipeline as
 * report-candidate-blocks-health and persists the result into
 * `staff_day_report_cache`.
 *
 * NEVER writes:
 *   - time_reports
 *   - workdays
 *   - location_time_entries
 *   - travel_time_logs
 *   - active_time_registrations
 *   - staff_inferred_home_locations / staff_private_zones / staff_home_observations
 *
 * ONLY writes:
 *   - staff_day_report_cache (upsert by org+staff+date+engine_version)
 *
 * Body:
 * {
 *   organizationId: uuid,
 *   dateFrom: 'YYYY-MM-DD',
 *   dateTo:   'YYYY-MM-DD',
 *   staffIds?: string[],
 *   dryRun?: boolean,
 *   batchSize?: number,            // max staff-days per invocation (default 25)
 *   engineVersion: string,
 *   skipExisting?: boolean,        // default true — skip if cache already has fresh row
 * }
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
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';
import { buildPresenceDayBlocks } from '../_shared/time-engine/buildPresenceDayBlocks.ts';
import { buildReportCandidateBlocks } from '../_shared/time-engine/buildReportCandidateBlocks.ts';
import {
  computePlannedDaySignals,
  type BookingTimes,
} from '../_shared/workday/plannedDay.ts';
import { getStockholmDayWindowUtc } from '../_shared/stockholmDayWindow.ts';

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (s: number, b: any) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

interface ProcessedRow {
  staff_id: string;
  date: string;
  ok: boolean;
  pingCount: number;
  reportBlocks: number;
  workMinutes: number;
  unknownMinutes: number;
  needsReviewMinutes: number;
  preWorkExcludedMinutes: number;
  error?: string;
  skipped?: 'no_pings' | 'already_cached';
  signalGapTransport?: any;
  companionRoute?: any;
}

async function processOne(
  admin: any,
  orgId: string,
  staffId: string,
  date: string,
  engineVersion: string,
  dryRun: boolean,
): Promise<ProcessedRow> {
  const out: ProcessedRow = {
    staff_id: staffId,
    date,
    ok: false,
    pingCount: 0,
    reportBlocks: 0,
    workMinutes: 0,
    unknownMinutes: 0,
    needsReviewMinutes: 0,
    preWorkExcludedMinutes: 0,
  };
  try {
    const { startUtc: dayStart, endUtc: dayEnd } = getStockholmDayWindowUtc(date);

    // --- targets ---
    let targets: WorkTarget[] = [];
    try {
      const { targets: resolved } = await resolveWorkTargets({
        organizationId: orgId,
        staffId,
        date,
        supabaseAdmin: admin,
      });
      targets = resolved.map(toWorkTarget).filter((t): t is WorkTarget => !!t);
    } catch (e) {
      // continue with empty targets — engine handles it
    }

    // --- pings ---
    // Paginate in 1000-row batches up to a per-day cap; PostgREST enforces a
    // 1000-row default cap, so a plain .limit(5000) silently truncates.
    const PING_PAGE_SIZE = 1000;
    const PING_DAY_CAP = 20_000;
    const pingRows: any[] = [];
    {
      let from = 0;
      while (pingRows.length < PING_DAY_CAP) {
        const to = from + PING_PAGE_SIZE - 1;
        const { data: batch, error: pingErr } = await admin
          .from('staff_location_history')
          .select('lat, lng, accuracy, speed, recorded_at')
          .eq('organization_id', orgId)
          .eq('staff_id', staffId)
          .gte('recorded_at', dayStart)
          .lte('recorded_at', dayEnd)
          .order('recorded_at', { ascending: true })
          .range(from, to);
        if (pingErr) break;
        const rows = batch ?? [];
        pingRows.push(...rows);
        if (rows.length < PING_PAGE_SIZE) break;
        from += PING_PAGE_SIZE;
      }
    }

    const pings: GpsPing[] = (pingRows ?? []).map((p: any) => ({
      ts: p.recorded_at,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
      speedMps: p.speed != null ? Number(p.speed) : null,
    }));
    out.pingCount = pings.length;
    if (pings.length === 0) {
      out.ok = true;
      out.skipped = 'no_pings';
      return out;
    }

    // --- geo anchors ---
    let geoAnchorsForStaff: any[] = [];
    try {
      const ga = await loadGeoAnchors({
        supabaseAdmin: admin,
        organizationId: orgId,
        staffId,
        startUtc: dayStart,
        endUtc: dayEnd,
        targets,
      });
      geoAnchorsForStaff = ga.anchors;
    } catch {}

    // --- gps timeline ---
    const gpsTimeline = buildGpsDayTimeline({
      staffId, organizationId: orgId, date, pings, targets,
      geoAnchors: geoAnchorsForStaff,
    });

    // --- peer pings (companion-route evidence) ---
    let peerGpsTimelines: any[] = [];
    try {
      const PEER_PAGE = 1000;
      const PEER_CAP = 40_000;
      const peerRows: any[] = [];
      let pfrom = 0;
      while (peerRows.length < PEER_CAP) {
        const pto = pfrom + PEER_PAGE - 1;
        const { data: batch, error } = await admin
          .from('staff_location_history')
          .select('staff_id, lat, lng, recorded_at')
          .eq('organization_id', orgId)
          .neq('staff_id', staffId)
          .gte('recorded_at', dayStart)
          .lte('recorded_at', dayEnd)
          .order('recorded_at', { ascending: true })
          .range(pfrom, pto);
        if (error) break;
        const rows = batch ?? [];
        peerRows.push(...rows);
        if (rows.length < PEER_PAGE) break;
        pfrom += PEER_PAGE;
      }
      const grouped = new Map<string, any[]>();
      for (const r of peerRows) {
        const arr = grouped.get(r.staff_id) ?? [];
        arr.push({ ts: r.recorded_at, lat: Number(r.lat), lng: Number(r.lng) });
        grouped.set(r.staff_id, arr);
      }
      let nameMap = new Map<string, string>();
      if (grouped.size > 0) {
        const ids = Array.from(grouped.keys());
        const { data: staffRows } = await admin.from('staff_members').select('id, name').in('id', ids);
        for (const s of staffRows ?? []) nameMap.set(s.id, s.name ?? null);
      }
      peerGpsTimelines = Array.from(grouped.entries()).map(([sid, pings]) => ({
        staffId: sid,
        staffName: nameMap.get(sid) ?? null,
        pings,
        assignedTargetKeys: [],
      }));
    } catch (e) {
      // companion is optional
    }

    // --- presence ---
    const presence = buildPresenceDayBlocks({
      staffId,
      organizationId: orgId,
      date,
      gpsTimeline,
      timerMarkers: [],
      peerGpsTimelines,
      targets,
    });

    // --- active_time_registrations ---
    const nowIso = new Date().toISOString();
    const dayCutoff = dayEnd;
    const { data: regData } = await admin
      .from('active_time_registrations')
      .select(
        'id, staff_id, organization_id, started_at, stopped_at, status, ' +
        'start_source, stop_source, start_target_type, start_target_id, ' +
        'start_target_label, current_target_type, current_target_id, current_label, metadata',
      )
      .eq('organization_id', orgId)
      .eq('staff_id', staffId)
      .lte('started_at', dayEnd)
      .or(`stopped_at.is.null,stopped_at.gte.${dayStart}`);
    const activeRegs = (regData ?? []).map((r: any) => {
      const isActive = (r.status ?? '').toLowerCase() === 'active';
      const stoppedAt = r.stopped_at ?? (isActive ? (nowIso < dayCutoff ? nowIso : dayCutoff) : null);
      return {
        id: r.id,
        staffId: r.staff_id,
        organizationId: r.organization_id,
        startedAt: r.started_at,
        stoppedAt,
        status: r.status ?? null,
        startSource: r.start_source ?? null,
        stopSource: r.stop_source ?? null,
        targetType: r.start_target_type ?? null,
        targetId: r.start_target_id ?? null,
        targetLabel: r.start_target_label ?? null,
        metadata: r.metadata ?? null,
      };
    });

    // --- home anchors (read-only) ---
    let homeAnchors: { id: string; kind: string; lat: number; lng: number; radiusM: number; label: string | null }[] = [];
    try {
      const [{ data: inferred }, { data: privateZones }] = await Promise.all([
        admin
          .from('staff_inferred_home_locations')
          .select('id, kind, lat, lng, radius_m, valid_from, valid_until')
          .eq('staff_id', staffId)
          .lte('valid_from', `${date}T23:59:59Z`),
        admin
          .from('staff_private_zones')
          .select('id, kind, lat, lng, radius_m, label, active')
          .eq('staff_id', staffId)
          .eq('active', true),
      ]);
      for (const r of inferred ?? []) {
        if (r.valid_until && r.valid_until < `${date}T00:00:00Z`) continue;
        if (r.lat == null || r.lng == null) continue;
        homeAnchors.push({ id: r.id, kind: r.kind ?? 'home_sleep', lat: Number(r.lat), lng: Number(r.lng), radiusM: Number(r.radius_m ?? 200), label: null });
      }
      for (const r of privateZones ?? []) {
        if (r.lat == null || r.lng == null) continue;
        if (r.kind && !['home_sleep', 'manual_ignore', 'recurring_night'].includes(r.kind)) continue;
        homeAnchors.push({ id: r.id, kind: r.kind ?? 'manual_ignore', lat: Number(r.lat), lng: Number(r.lng), radiusM: Number(r.radius_m ?? 200), label: r.label ?? null });
      }
    } catch (e) {
      // Anchors are optional — continue without them.
    }

    // Open active registration (auktoritativt ankare för pågående arbete).
    const openReg = (regData ?? []).find(
      (r: any) => !r.stopped_at && (r.status ?? '').toLowerCase() === 'active',
    );
    const openActiveRegistration = openReg
      ? {
          registrationId: openReg.id,
          startedAtIso: openReg.started_at,
          targetType: openReg.current_target_type ?? openReg.start_target_type ?? null,
          targetId: openReg.current_target_id ?? openReg.start_target_id ?? null,
          targetLabel: openReg.current_label ?? openReg.start_target_label ?? null,
          currentLabel: openReg.current_label ?? null,
        }
      : null;

    const plannedEndOfDayIso = await resolvePlannedEndOfDayIso(admin, orgId, staffId, date);

    // --- report blocks ---
    const report = buildReportCandidateBlocks({
      staffId,
      organizationId: orgId,
      date,
      presenceDayBlocks: presence.blocks,
      activeTimeRegistrations: activeRegs,
      homeAnchors,
      openActiveRegistration,
      plannedEndOfDayIso,
    });

    // Aggregate
    let work = 0, unknown = 0, needsReview = 0;
    for (const b of report.blocks) {
      const dur = Number(b.durationMinutes ?? 0);
      if (b.kind === 'work') work += dur;
      else if (b.kind === 'unknown') unknown += dur;
      if (b.reviewState === 'needs_review') needsReview += dur;
    }
    const preWork = Number(
      (report as any)?.diagnostics?.preWorkExclusion?.excludedMinutes ?? 0,
    );

    out.reportBlocks = report.blocks.length;
    out.workMinutes = work;
    out.unknownMinutes = unknown;
    out.needsReviewMinutes = needsReview;
    out.preWorkExcludedMinutes = preWork;
    out.signalGapTransport = (presence as any).signalGapTransportDiagnostics ?? null;
    out.companionRoute = (presence as any).companionRouteDiagnostics ?? null;
    out.ok = true;

    if (!dryRun) {
      const summary = {
        pingCount: pings.length,
        reportBlocks: report.blocks.length,
        workMinutes: work,
        unknownMinutes: unknown,
        needsReviewMinutes: needsReview,
        preWorkExcludedMinutes: preWork,
        targetsCount: targets.length,
      };
      const { error } = await admin
        .from('staff_day_report_cache')
        .upsert(
          {
            organization_id: orgId,
            staff_id: staffId,
            date,
            engine_version: engineVersion,
            summary_json: summary,
            report_candidate_blocks_json: report.blocks ?? [],
            display_blocks_json: report.blocks ?? [],
            diagnostics_json: {
              ...((report as any).diagnostics ?? {}),
              sessionConsolidation: report.summary?.sessionConsolidationDiagnostics ?? null,
              signalGapTransport: (presence as any).signalGapTransportDiagnostics ?? null,
              companionRoute: (presence as any).companionRouteDiagnostics ?? null,
              presenceDayBlocks: (presence.blocks ?? []).map((b: any) => ({
                kind: b.kind, startAt: b.startAt, endAt: b.endAt,
                durationMinutes: b.durationMinutes, confidence: b.confidence,
                targetLabel: b.target?.label ?? null,
              })),
              presenceEvidenceBlocks: ((presence as any).evidenceBlocks ?? []).map((b: any) => ({
                kind: b.kind, startAt: b.startAt, endAt: b.endAt,
                durationMinutes: b.durationMinutes,
              })),
              aggregation: (presence as any).aggregation ?? null,
            },
            source_watermark: {
              maxPingTs: pings[pings.length - 1]?.ts ?? null,
              activeRegsCount: activeRegs.length,
            },
            processed_until: dayEnd,
            built_at: new Date().toISOString(),
            stale: false,
            error: null,
          },
          { onConflict: 'organization_id,staff_id,date,engine_version' },
        );
      if (error) {
        out.ok = false;
        out.error = `upsert_failed:${error.message}`;
      }
    }
  } catch (e: any) {
    out.error = e?.message ?? String(e);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const orgId = body?.organizationId;
  const dateFrom = body?.dateFrom;
  const dateTo = body?.dateTo;
  const engineVersion = body?.engineVersion;
  if (!orgId || !dateFrom || !dateTo || !engineVersion) {
    return json(400, {
      error: 'missing_required',
      required: ['organizationId', 'dateFrom', 'dateTo', 'engineVersion'],
    });
  }
  const dryRun = body?.dryRun !== false; // default TRUE for safety
  const batchSize = Math.max(1, Math.min(200, Number(body?.batchSize ?? 25)));
  const skipExisting = body?.skipExisting !== false;
  const requestedStaff: string[] | null = Array.isArray(body?.staffIds) && body.staffIds.length
    ? body.staffIds
    : null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // staff list
  let staffQuery = admin
    .from('staff_members')
    .select('id, name, is_active')
    .eq('organization_id', orgId);
  if (requestedStaff) staffQuery = staffQuery.in('id', requestedStaff);
  else staffQuery = staffQuery.eq('is_active', true);
  const { data: staff } = await staffQuery;
  const staffList = staff ?? [];

  const dates = eachDate(dateFrom, dateTo);
  const totalStaffDays = staffList.length * dates.length;

  // Build candidate list
  type Cand = { staff_id: string; date: string; staff_name: string };
  const candidates: Cand[] = [];
  for (const d of dates) {
    for (const s of staffList) {
      candidates.push({ staff_id: s.id, date: d, staff_name: s.name });
    }
  }

  // Skip existing cache rows (idempotency)
  let toProcess = candidates;
  let alreadyCached = 0;
  if (skipExisting && !dryRun) {
    const { data: existing } = await admin
      .from('staff_day_report_cache')
      .select('staff_id, date')
      .eq('organization_id', orgId)
      .eq('engine_version', engineVersion)
      .eq('stale', false)
      .gte('date', dateFrom)
      .lte('date', dateTo);
    const seen = new Set<string>((existing ?? []).map((r: any) => `${r.staff_id}|${r.date}`));
    alreadyCached = seen.size;
    toProcess = candidates.filter((c) => !seen.has(`${c.staff_id}|${c.date}`));
  }

  const limited = toProcess.slice(0, batchSize);
  const startedAt = Date.now();

  // Process serially (engine is CPU-light, DB is the bottleneck — keep gentle)
  const results: ProcessedRow[] = [];
  for (const c of limited) {
    const r = await processOne(admin, orgId, c.staff_id, c.date, engineVersion, dryRun);
    results.push(r);
  }

  const runtimeMs = Date.now() - startedAt;
  const errors = results.filter((r) => !r.ok && !r.skipped).length;
  const skippedNoPings = results.filter((r) => r.skipped === 'no_pings').length;
  const processed = results.filter((r) => r.ok && !r.skipped).length;
  const sumPreWork = results.reduce((a, r) => a + (r.preWorkExcludedMinutes ?? 0), 0);
  const sumNeedsReview = results.reduce((a, r) => a + (r.needsReviewMinutes ?? 0), 0);
  const sumUnknown = results.reduce((a, r) => a + (r.unknownMinutes ?? 0), 0);
  const sumWork = results.reduce((a, r) => a + (r.workMinutes ?? 0), 0);

  // Estimated total runtime (linear extrapolation)
  const perItemMs = limited.length > 0 ? runtimeMs / limited.length : 0;
  const remaining = toProcess.length - limited.length;
  const estimatedRemainingMs = Math.round(perItemMs * remaining);

  return json(200, {
    ok: true,
    dryRun,
    engineVersion,
    organizationId: orgId,
    dateFrom,
    dateTo,
    batchSize,
    staffCount: staffList.length,
    dateCount: dates.length,
    staffDaysTotal: totalStaffDays,
    staffDaysCandidates: candidates.length,
    staffDaysAlreadyCached: alreadyCached,
    staffDaysToProcess: toProcess.length,
    staffDaysProcessedThisCall: processed,
    staffDaysSkippedNoPings: skippedNoPings,
    staffDaysWithErrors: errors,
    runtimeMs,
    perItemMs: Math.round(perItemMs),
    estimatedRemainingMs,
    estimatedRemainingMinutes: Math.round(estimatedRemainingMs / 60000),
    aggregates: {
      workMinutes: sumWork,
      unknownMinutes: sumUnknown,
      needsReviewMinutes: sumNeedsReview,
      preWorkExcludedMinutes: sumPreWork,
    },
    safety: {
      wroteTimeReports: false,
      wroteWorkdays: false,
      wroteLocationTimeEntries: false,
      wroteTravelTimeLogs: false,
      wroteActiveTimeRegistrations: false,
      wroteOnlyTo: 'staff_day_report_cache',
      writesPerformed: dryRun ? 0 : processed,
    },
    sample: results.slice(0, 10),
    nextBatch: remaining > 0
      ? {
        hint: 're-invoke with the same params; idempotent skip kicks in',
        remainingItems: remaining,
      }
      : null,
  });
});
