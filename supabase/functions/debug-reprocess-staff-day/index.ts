// @ts-nocheck
/**
 * debug-reprocess-staff-day
 * ─────────────────────────
 * READ-ONLY verifieringsverktyg: kör nuvarande Time Engine på gamla GPS-dagar
 * och returnerar exakt vad motorn tolkar — utan att skriva någonting.
 *
 * Skriver ALDRIG till:
 *   - time_reports
 *   - workdays
 *   - location_time_entries
 *   - travel_time_logs
 *   - staff_day_submissions
 *   - active_time_registrations
 *
 * Skriver vid dryRun=false ENDAST till:
 *   - staff_day_report_cache (upsert)
 *
 * Payload (single):
 *   {
 *     staffId?: uuid,
 *     staffName?: string,           // case-insensitive substring/ilike
 *     date: "YYYY-MM-DD",           // Europe/Stockholm lokal dag
 *     dryRun?: boolean,             // default true
 *     includePings?: boolean,       // default false (kan vara stort)
 *     includeDiagnostics?: boolean, // default true
 *     engineVersion?: string,       // krävs om dryRun=false
 *   }
 *
 * Payload (batch):
 *   {
 *     runs: [{ staffId? | staffName?, date }, ...],
 *     dryRun?, includePings?, includeDiagnostics?, engineVersion?
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { buildGpsDayTimeline, type GpsPing } from '../_shared/time-engine/buildGpsDayTimeline.ts';
import {
  resolveWorkTargets,
  toWorkTarget,
} from '../_shared/time-engine/resolveWorkTargets.ts';
import { loadGeoAnchors } from '../_shared/time-engine/loadGeoAnchors.ts';
import { fetchAllStaffLocationPings } from '../_shared/timeEngine/fetchAllStaffLocationPings.ts';
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';
import { buildPresenceDayBlocks } from '../_shared/time-engine/buildPresenceDayBlocks.ts';
import { buildReportCandidateBlocks } from '../_shared/time-engine/buildReportCandidateBlocks.ts';
import { resolveActualWorkStartIso } from '../_shared/time-engine/resolveActualWorkStart.ts';
import { computeDayEndDecision } from '../_shared/time-engine/computeDayEndDecision.ts';
import { clampBlocksToDayEndDecision } from '../_shared/time-engine/clampBlocksToDayEndDecision.ts';
import {
  computePlannedDaySignals,
  type BookingTimes,
} from '../_shared/workday/plannedDay.ts';
import { getStockholmDayWindowUtc } from '../_shared/stockholmDayWindow.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TZ = 'Europe/Stockholm';

const json = (s: number, b: any) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function isoToStockholmLocal(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)!.value;
    return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
  } catch {
    return null;
  }
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
}

async function resolveStaff(admin: any, ident: { staffId?: string; staffName?: string }) {
  if (ident.staffId) {
    const { data, error } = await admin
      .from('staff_members')
      .select('id, name, organization_id, is_active')
      .eq('id', ident.staffId)
      .maybeSingle();
    if (error) return { ok: false as const, error: `staff_lookup_failed:${error.message}` };
    if (!data) return { ok: false as const, error: 'staff_not_found' };
    return { ok: true as const, staff: data };
  }
  if (ident.staffName) {
    const name = ident.staffName.trim();
    const { data, error } = await admin
      .from('staff_members')
      .select('id, name, organization_id, is_active')
      .ilike('name', `%${name}%`)
      .limit(20);
    if (error) return { ok: false as const, error: `staff_search_failed:${error.message}` };
    const rows = data ?? [];
    if (rows.length === 0) return { ok: false as const, error: 'staff_name_no_match', query: name };
    if (rows.length > 1) {
      return {
        ok: false as const,
        error: 'staff_name_ambiguous',
        query: name,
        candidates: rows.map((r: any) => ({ id: r.id, name: r.name, organizationId: r.organization_id, isActive: r.is_active })),
      };
    }
    return { ok: true as const, staff: rows[0] };
  }
  return { ok: false as const, error: 'missing_staff_identifier' };
}

async function resolvePlannedEndOfDayIso(admin: any, orgId: string, staffId: string, date: string): Promise<string | null> {
  try {
    const { data: bsa } = await admin
      .from('booking_staff_assignments')
      .select('booking_id')
      .eq('organization_id', orgId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date);
    const ids = Array.from(new Set((bsa ?? []).map((a: any) => a.booking_id).filter(Boolean)));
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

function summarizePings(pings: any[], targets: WorkTarget[]) {
  if (pings.length === 0) {
    return {
      pingCount: 0, firstPingUtc: null, firstPingLocal: null,
      lastPingUtc: null, lastPingLocal: null,
      bbox: null, approxUniquePlaces: 0,
      maxGapMinutes: 0, gapsOver10Min: 0, gapsOver30Min: 0,
      accuracyNullCount: 0, accuracyOver100m: 0,
      speedMovingCount: 0,
      pingsInsideAnyGeofence: 0, pingsOutsideGeofences: 0,
    };
  }
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  let accNull = 0, accOver100 = 0, speedMoving = 0, inside = 0;
  let maxGap = 0, gaps10 = 0, gaps30 = 0;
  const cells = new Set<string>();
  let prevMs: number | null = null;
  for (const p of pings) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    cells.add(`${lat.toFixed(3)},${lng.toFixed(3)}`); // ~110m cell
    if (p.accuracy == null) accNull++;
    else if (Number(p.accuracy) > 100) accOver100++;
    if (p.speed != null && Number(p.speed) > 0.5) speedMoving++;
    if (targets.some((t) => haversineM({ lat, lng }, { lat: t.lat, lng: t.lng }) <= (t.radiusM ?? 100))) {
      inside++;
    }
    const ms = new Date(p.recorded_at ?? p.ts).getTime();
    if (prevMs != null) {
      const gap = (ms - prevMs) / 60000;
      if (gap > maxGap) maxGap = gap;
      if (gap > 10) gaps10++;
      if (gap > 30) gaps30++;
    }
    prevMs = ms;
  }
  return {
    pingCount: pings.length,
    firstPingUtc: pings[0].recorded_at ?? pings[0].ts,
    firstPingLocal: isoToStockholmLocal(pings[0].recorded_at ?? pings[0].ts),
    lastPingUtc: pings[pings.length - 1].recorded_at ?? pings[pings.length - 1].ts,
    lastPingLocal: isoToStockholmLocal(pings[pings.length - 1].recorded_at ?? pings[pings.length - 1].ts),
    bbox: { minLat, maxLat, minLng, maxLng },
    approxUniquePlaces: cells.size,
    maxGapMinutes: Math.round(maxGap * 10) / 10,
    gapsOver10Min: gaps10,
    gapsOver30Min: gaps30,
    accuracyNullCount: accNull,
    accuracyOver100m: accOver100,
    speedMovingCount: speedMoving,
    pingsInsideAnyGeofence: inside,
    pingsOutsideGeofences: pings.length - inside,
  };
}

function blockToDebug(b: any) {
  return {
    id: b.id ?? null,
    kind: b.kind ?? null,
    label: b.label ?? b.targetLabel ?? b.title ?? null,
    startAtUtc: b.startAt ?? b.startedAt ?? null,
    endAtUtc: b.endAt ?? b.endedAt ?? null,
    startAtLocal: isoToStockholmLocal(b.startAt ?? b.startedAt ?? null),
    endAtLocal: isoToStockholmLocal(b.endAt ?? b.endedAt ?? null),
    minutes: b.durationMinutes ?? b.minutes ?? null,
    targetType: b.targetType ?? null,
    targetId: b.targetId ?? null,
    reviewState: b.reviewState ?? null,
    confidence: b.confidence ?? null,
    warningReasons: b.warningReasons ?? b.warnings ?? null,
    absorbedReasons: b.absorbedReasons ?? null,
    source: b.source ?? null,
    evidenceCount: Array.isArray(b.evidence) ? b.evidence.length : (b.evidenceCount ?? null),
    pingCount: b.pingCount ?? null,
  };
}

async function processRun(
  admin: any,
  ident: { staffId?: string; staffName?: string },
  date: string,
  opts: { dryRun: boolean; includePings: boolean; includeDiagnostics: boolean; engineVersion: string | null },
) {
  const staffRes = await resolveStaff(admin, ident);
  if (!staffRes.ok) return { ok: false, requested: { ...ident, date }, error: staffRes.error, ...('candidates' in staffRes ? { candidates: staffRes.candidates } : {}) };
  const staff = staffRes.staff;
  const orgId = staff.organization_id;
  const staffId = staff.id;

  const { startUtc, endUtc } = getStockholmDayWindowUtc(date);

  // Targets
  let targets: WorkTarget[] = [];
  let targetWarnings: unknown = null;
  try {
    const { targets: resolved, warnings } = await resolveWorkTargets({
      organizationId: orgId, staffId, date, supabaseAdmin: admin,
    });
    targets = resolved.map(toWorkTarget).filter((t): t is WorkTarget => !!t);
    targetWarnings = warnings ?? null;
  } catch (e: any) {
    targetWarnings = `resolve_failed:${e?.message ?? String(e)}`;
  }

  // Pings (paginerad, hela dagen)
  const ownPingFetch = await fetchAllStaffLocationPings({
    supabaseAdmin: admin, organizationId: orgId, staffId, startUtc, endUtc,
  });
  const pingRows = ownPingFetch.rows ?? [];
  const pingDiagnostics = summarizePings(pingRows, targets);

  const pings: GpsPing[] = pingRows.map((p: any) => ({
    ts: p.recorded_at,
    lat: Number(p.lat),
    lng: Number(p.lng),
    accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
    speedMps: p.speed != null ? Number(p.speed) : null,
  }));

  let result: any = null;
  let engineError: string | null = null;

  if (pings.length === 0) {
    result = {
      summary: { pingCount: 0, reportBlocks: 0, workMinutes: 0, unknownMinutes: 0, needsReviewMinutes: 0 },
      reportBlocks: [],
      displayBlocks: [],
      presenceBlocks: [],
      diagnostics: { reason: 'no_pings' },
    };
  } else {
    try {
      let geoAnchors: any[] = [];
      try {
        const ga = await loadGeoAnchors({
          supabaseAdmin: admin, organizationId: orgId, staffId,
          startUtc, endUtc, targets,
        });
        geoAnchors = ga.anchors;
      } catch {}

      const gpsTimeline = buildGpsDayTimeline({
        staffId, organizationId: orgId, date, pings, targets, geoAnchors,
      });

      const presence = buildPresenceDayBlocks({
        staffId, organizationId: orgId, date,
        gpsTimeline, timerMarkers: [], peerGpsTimelines: [], targets,
      });

      const nowIso = new Date().toISOString();
      const { data: regData } = await admin
        .from('active_time_registrations')
        .select('id, staff_id, organization_id, started_at, stopped_at, status, start_source, stop_source, start_target_type, start_target_id, start_target_label, current_target_type, current_target_id, current_label, metadata')
        .eq('organization_id', orgId)
        .eq('staff_id', staffId)
        .lte('started_at', endUtc)
        .or(`stopped_at.is.null,stopped_at.gte.${startUtc}`);
      const activeRegs = (regData ?? []).map((r: any) => {
        const isActive = (r.status ?? '').toLowerCase() === 'active';
        const stoppedAt = r.stopped_at ?? (isActive ? (nowIso < endUtc ? nowIso : endUtc) : null);
        return {
          id: r.id, staffId: r.staff_id, organizationId: r.organization_id,
          startedAt: r.started_at, stoppedAt, status: r.status ?? null,
          startSource: r.start_source ?? null, stopSource: r.stop_source ?? null,
          targetType: r.start_target_type ?? null, targetId: r.start_target_id ?? null,
          targetLabel: r.start_target_label ?? null, metadata: r.metadata ?? null,
        };
      });

      // home anchors
      let homeAnchors: any[] = [];
      try {
        const [{ data: inferred }, { data: pz }] = await Promise.all([
          admin.from('staff_inferred_home_locations').select('id, kind, lat, lng, radius_m, valid_from, valid_until').eq('staff_id', staffId).lte('valid_from', `${date}T23:59:59Z`),
          admin.from('staff_private_zones').select('id, kind, lat, lng, radius_m, label, active').eq('staff_id', staffId).eq('active', true),
        ]);
        for (const r of inferred ?? []) {
          if (r.valid_until && r.valid_until < `${date}T00:00:00Z`) continue;
          if (r.lat == null || r.lng == null) continue;
          homeAnchors.push({ id: r.id, kind: r.kind ?? 'home_sleep', lat: Number(r.lat), lng: Number(r.lng), radiusM: Number(r.radius_m ?? 200), label: null });
        }
        for (const r of pz ?? []) {
          if (r.lat == null || r.lng == null) continue;
          homeAnchors.push({ id: r.id, kind: r.kind ?? 'manual_ignore', lat: Number(r.lat), lng: Number(r.lng), radiusM: Number(r.radius_m ?? 200), label: r.label ?? null });
        }
      } catch {}

      const openReg = (regData ?? []).find((r: any) => !r.stopped_at && (r.status ?? '').toLowerCase() === 'active');
      const openActiveRegistration = openReg ? {
        registrationId: openReg.id,
        startedAtIso: openReg.started_at,
        targetType: openReg.current_target_type ?? openReg.start_target_type ?? null,
        targetId: openReg.current_target_id ?? openReg.start_target_id ?? null,
        targetLabel: openReg.current_label ?? openReg.start_target_label ?? null,
        currentLabel: openReg.current_label ?? null,
      } : null;

      const plannedEndOfDayIso = await resolvePlannedEndOfDayIso(admin, orgId, staffId, date);
      const actualWorkStartIso = await resolveActualWorkStartIso(admin, orgId, staffId, startUtc, endUtc);

      const report = buildReportCandidateBlocks({
        staffId, organizationId: orgId, date,
        presenceDayBlocks: presence.blocks,
        activeTimeRegistrations: activeRegs,
        homeAnchors, openActiveRegistration, plannedEndOfDayIso, actualWorkStartIso,
        lastFreshEvidenceAtIso: pings[pings.length - 1]?.ts ?? null,
      });

      const dayEndDecision = computeDayEndDecision({
        date, dayStartUtcIso: startUtc, dayEndUtcIso: endUtc,
        blocks: report.blocks ?? [], activeRegistrations: activeRegs as any,
        openActiveRegistration, lastGpsPingAtIso: pings[pings.length - 1]?.ts ?? null,
        homeAnchors, nowIso, plannedEndOfDayIso,
      });
      const clamp = clampBlocksToDayEndDecision({
        date, blocks: report.blocks ?? [], dayEndDecision, nowIso,
        openActiveStartedAtIso: openActiveRegistration?.startedAtIso ?? null,
      });

      const finalBlocks = clamp.blocks;
      let work = 0, unknown = 0, needsReview = 0;
      for (const b of finalBlocks) {
        const dur = Number(b.durationMinutes ?? 0);
        if (b.kind === 'work') work += dur;
        else if (b.kind === 'unknown') unknown += dur;
        if (b.reviewState === 'needs_review') needsReview += dur;
      }

      result = {
        summary: {
          pingCount: pings.length,
          targetsCount: targets.length,
          reportBlocks: finalBlocks.length,
          workMinutes: work,
          unknownMinutes: unknown,
          needsReviewMinutes: needsReview,
          activeRegsCount: activeRegs.length,
          plannedEndOfDayIso,
          actualWorkStartIso,
        },
        presenceBlocks: (presence.blocks ?? []).map(blockToDebug),
        reportBlocks: finalBlocks.map(blockToDebug),
        // Time Engine v2 har en separat display-pipeline — backfill skriver
        // inte längre display_blocks_json. Vi exponerar report-blocken här
        // som "displayBlocks" är inte rätt; behåll tomt och flagga källan.
        displayBlocks: [],
        droppedAfterDayEnd: (clamp.dropped ?? []).map(blockToDebug),
        diagnostics: opts.includeDiagnostics ? {
          targetWarnings,
          dayEndDecision,
          clamp: clamp.diagnostics,
          dayEndClamp: clamp.dayEndClampDiagnostics,
          sessionConsolidation: report.summary?.sessionConsolidationDiagnostics ?? null,
          singleTimeline: (report.summary as any)?.singleTimelineDiagnostics ?? null,
          labelResolution: (report.summary as any)?.labelResolutionDiagnostics ?? null,
          commutePolicy: (report.summary as any)?.commutePolicyDiagnostics ?? null,
          workAreaTolerance: (report.summary as any)?.workAreaToleranceDiagnostics ?? null,
          openTimerClamp: (report.summary as any)?.openTimerClampDiagnostics ?? null,
          signalGapTransport: (presence as any).signalGapTransportDiagnostics ?? null,
          companionRoute: (presence as any).companionRouteDiagnostics ?? null,
          presenceAggregation: (presence as any).aggregation ?? null,
          reportDiagnostics: (report as any).diagnostics ?? null,
          openActiveRegistration,
          homeAnchorsCount: homeAnchors.length,
        } : null,
      };

      // Optional cache write — endast staff_day_report_cache.
      if (!opts.dryRun && opts.engineVersion) {
        const { error: upErr } = await admin
          .from('staff_day_report_cache')
          .upsert(
            {
              organization_id: orgId, staff_id: staffId, date,
              engine_version: opts.engineVersion,
              summary_json: result.summary,
              report_candidate_blocks_json: finalBlocks,
              diagnostics_json: result.diagnostics ?? {},
              source_watermark: {
                maxPingTs: pings[pings.length - 1]?.ts ?? null,
                activeRegsCount: activeRegs.length,
              },
              processed_until: endUtc,
              built_at: new Date().toISOString(),
              stale: false, error: null,
            },
            { onConflict: 'organization_id,staff_id,date,engine_version' },
          );
        if (upErr) engineError = `cache_upsert_failed:${upErr.message}`;
      }
    } catch (e: any) {
      engineError = `engine_failed:${e?.message ?? String(e)}`;
    }
  }

  return {
    ok: !engineError,
    dryRun: opts.dryRun,
    staff: { id: staff.id, name: staff.name, organizationId: orgId },
    date,
    timezone: TZ,
    localDate: date,
    utcStart: startUtc,
    utcEnd: endUtc,
    targets: targets.map((t) => ({ key: t.key, label: t.label, lat: t.lat, lng: t.lng, radiusM: t.radiusM })),
    input: {
      pingCount: pingRows.length,
      firstPing: pingDiagnostics.firstPingUtc,
      lastPing: pingDiagnostics.lastPingUtc,
      pingFetch: ownPingFetch.diagnostics ?? null,
    },
    pingDiagnostics,
    result,
    error: engineError,
    rawPings: opts.includePings ? pingRows : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const dryRun = body?.dryRun !== false; // default TRUE
  const includePings = body?.includePings === true;
  const includeDiagnostics = body?.includeDiagnostics !== false;
  const engineVersion: string | null = typeof body?.engineVersion === 'string' && body.engineVersion.length > 0
    ? body.engineVersion : null;
  if (!dryRun && !engineVersion) {
    return json(400, { error: 'engineVersion_required_when_dryRun_false' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Batch
  if (Array.isArray(body?.runs) && body.runs.length > 0) {
    const startedAt = Date.now();
    const results = [];
    for (const r of body.runs) {
      if (!r?.date || typeof r.date !== 'string') {
        results.push({ ok: false, requested: r, error: 'missing_date' });
        continue;
      }
      results.push(await processRun(admin, { staffId: r.staffId, staffName: r.staffName }, r.date, {
        dryRun, includePings, includeDiagnostics, engineVersion,
      }));
    }
    return json(200, {
      ok: true, dryRun, batch: true, runs: results.length,
      runtimeMs: Date.now() - startedAt,
      safety: {
        wroteTimeReports: false, wroteWorkdays: false,
        wroteLocationTimeEntries: false, wroteTravelTimeLogs: false,
        wroteStaffDaySubmissions: false, wroteActiveTimeRegistrations: false,
        wroteOnlyTo: dryRun ? null : 'staff_day_report_cache',
      },
      results,
    });
  }

  // Single
  const date = body?.date;
  if (!date || typeof date !== 'string') return json(400, { error: 'date_required' });
  if (!body?.staffId && !body?.staffName) return json(400, { error: 'staffId_or_staffName_required' });

  const startedAt = Date.now();
  const result = await processRun(admin, { staffId: body.staffId, staffName: body.staffName }, date, {
    dryRun, includePings, includeDiagnostics, engineVersion,
  });
  return json(result.ok ? 200 : (result.error?.startsWith('staff_') ? 404 : 500), {
    ...result,
    runtimeMs: Date.now() - startedAt,
    safety: {
      wroteTimeReports: false, wroteWorkdays: false,
      wroteLocationTimeEntries: false, wroteTravelTimeLogs: false,
      wroteStaffDaySubmissions: false, wroteActiveTimeRegistrations: false,
      wroteOnlyTo: dryRun ? null : 'staff_day_report_cache',
    },
  });
});
