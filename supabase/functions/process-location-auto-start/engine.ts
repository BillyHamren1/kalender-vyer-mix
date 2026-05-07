// @ts-nocheck
// ============================================================================
// process-location-auto-start :: engine
// ----------------------------------------------------------------------------
// All logic for the server-side auto-start engine. Pure module — no
// Deno.serve here. Exposes:
//   * runEngine(supabase, body)  — full orchestration, used by index.ts
//   * processStaff(...)          — per-staff processor (used by tests)
//   * evaluateStableSegments     — pure stable-entry segmentation (testable)
//   * Target / StableHit / Ping / ProcessReport types
//
// The engine accepts ANY object that quacks like the supabase-js client used
// here (chained .from().select()/.insert()/.update()/.upsert()/.eq()/.is()/
// .gte()/.lte()/.or()/.not()/.order()/.limit()/.maybeSingle()). This lets the
// scenario_test.ts inject a fully in-memory fake without touching real data.
// ============================================================================

import {
  isInsideGeofence,
  type GeofenceTarget,
} from '../_shared/geofenceEval.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const ENGINE_VERSION = 'auto-start@1.0.0'

// ── Tuning constants (mirror src/lib/geofence/stableEntry.ts) ───────────────
export const ENTRY_PING_MIN_COUNT = 3
export const ENTRY_PING_MIN_DWELL_MS = 2 * 60 * 1000
export const ENTRY_PING_MAX_ACCURACY_M = 75
// Kort vistelse-policy (per target-typ). Auto-start får ALDRIG materialisera
// workday/LTE/arrival på en dwell under dessa trösklar — då skapas istället
// ett suggestion/review-event (assistant_events) som admin/användare kan
// bekräfta manuellt. Manuell timer, scanner, admin-godkänd går aldrig genom
// denna kodväg — de skapar LTE direkt via mobile-app-api.
//
//   - location (känt arbetsställe, t.ex. Lager): 5 min
//   - booking/project: 15 min, eller 5 min om personen är assigned till det
//   - absolut golv (även för suggestion): 2 min
//
// AUTO_START_MIN_DWELL_MS behålls bara som default/legacy fallback för tester.
export const AUTO_START_MIN_DWELL_MS = 15 * 60 * 1000
export const AUTO_START_MIN_DWELL_LOCATION_MS = 5 * 60 * 1000
export const AUTO_START_MIN_DWELL_PROJECT_MS = 15 * 60 * 1000
export const AUTO_START_MIN_DWELL_ASSIGNED_MS = 5 * 60 * 1000
export const AUTO_START_ABSOLUTE_FLOOR_MS = 2 * 60 * 1000

export function requiredDwellMs(kind: 'location' | 'booking' | 'project', isAssigned: boolean): number {
  if (kind === 'location') return AUTO_START_MIN_DWELL_LOCATION_MS
  if (isAssigned) return AUTO_START_MIN_DWELL_ASSIGNED_MS
  return AUTO_START_MIN_DWELL_PROJECT_MS
}
const PROCESS_LOOKBACK_MS = 60 * 60 * 1000
const PROCESS_OVERLAP_MS = 5 * 60 * 1000
const TARGET_DAY_TOLERANCE_MS = 24 * 60 * 60 * 1000

export interface Ping {
  id: string
  staff_id: string
  organization_id: string
  lat: number
  lng: number
  accuracy: number | null
  recorded_at: string
  ts: number
}

export interface Target {
  kind: 'location' | 'booking' | 'project'
  id: string
  organization_id: string
  label: string
  geofence: GeofenceTarget
  /** "valid" if this target is allowed for auto-start; "invalid" otherwise. */
  targetValidity: 'valid' | 'invalid'
  /** Whether time-tracking auto-start is allowed for this target right now. */
  timeTrackingAllowed: boolean
  /** Reason (when invalid) — surfaced as block reason. */
  invalidReason?: 'test_target' | 'cancelled' | 'archived' | 'inactive' | 'no_coords'
}

export interface StableHit {
  target: Target
  pings: Ping[]
  firstReliableTs: number
  lastInsideTs: number
  dwellMs: number
  avgAccuracy: number
  confidence: 'low' | 'medium' | 'high'
}

/** Regex for test/demo data. Test bookings/projects must never auto-start time. */
export const TEST_DEMO_RX = /\b(test|demo|sandbox)\b|!!|\?\?/i

export type AutoStartBlockReason =
  | 'blocked_movement_only'
  | 'blocked_unknown_place'
  | 'blocked_home'
  | 'blocked_home_or_unknown_night_movement'
  | 'blocked_low_confidence'
  | 'blocked_invalid_target'
  | 'blocked_test_target'
  | 'blocked_not_enough_dwell'
  | 'blocked_not_enough_pings'
  | 'blocked_night_requires_stronger_evidence'
  | 'blocked_inactive'
  | 'blocked_cancelled'
  | 'blocked_archived'

export interface ProcessReport {
  run_id: string
  engine_version: string
  mode: 'cron' | 'backfill_day'
  dry_run: boolean
  source_tag: string
  staff: number
  pings: number
  arrivals: number
  switches: number
  workdays_opened: number
  ltes_opened: number
  ltes_closed: number
  travels_created: number
  events_emitted: number
  skipped_existing: number
  errors: string[]
  plan: Array<Record<string, any>>
}

export function bucketTo5Min(iso: string): string {
  return String(Math.floor(new Date(iso).getTime() / (5 * 60_000)))
}

function planPush(report: ProcessReport, entry: Record<string, any>) {
  if (report.dry_run) report.plan.push(entry)
}

function targetMatchesLte(target: Target, lte: any): boolean {
  if (target.kind === 'location') return lte.location_id === target.id
  if (target.kind === 'booking') return lte.booking_id === target.id
  return lte.large_project_id === target.id
}

/**
 * Cursor model — per organization (org_id NULL = legacy 'global' fallback).
 *
 * Cron uses cursor + small overlap (PROCESS_OVERLAP_MS) to avoid missing late
 * pings; idempotency on workdays/LTEs/travel/events handles the duplicates the
 * overlap inevitably re-feeds. If a run fails BEFORE finishing successfully,
 * the cursor is NOT advanced — the next run picks up from the same point.
 */
async function loadCursor(supabase: any, orgId: string | null): Promise<string> {
  const fallback = new Date(Date.now() - PROCESS_LOOKBACK_MS).toISOString()
  if (orgId) {
    const { data } = await supabase
      .from('location_auto_start_cursor')
      .select('last_processed_recorded_at')
      .eq('organization_id', orgId)
      .maybeSingle()
    if (data?.last_processed_recorded_at) return data.last_processed_recorded_at
  }
  const { data: g } = await supabase
    .from('location_auto_start_cursor')
    .select('last_processed_recorded_at')
    .eq('id', 'global')
    .maybeSingle()
  return g?.last_processed_recorded_at ?? fallback
}

async function saveCursor(supabase: any, iso: string, orgId: string | null) {
  if (orgId) {
    await supabase
      .from('location_auto_start_cursor')
      .upsert({
        id: `org:${orgId}`,
        organization_id: orgId,
        last_processed_recorded_at: iso,
        updated_at: new Date().toISOString(),
      })
    return
  }
  await supabase
    .from('location_auto_start_cursor')
    .upsert({ id: 'global', last_processed_recorded_at: iso, updated_at: new Date().toISOString() })
}


export async function loadTargets(supabase: any): Promise<Target[]> {
  const yesterdayIso = new Date(Date.now() - TARGET_DAY_TOLERANCE_MS).toISOString().slice(0, 10)
  const tomorrowIso = new Date(Date.now() + TARGET_DAY_TOLERANCE_MS).toISOString().slice(0, 10)

  const out: Target[] = []

  const { data: locs } = await supabase
    .from('organization_locations')
    .select('id, organization_id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon, is_active')
  for (const l of locs ?? []) {
    if (l.latitude == null || l.longitude == null) continue
    const isTest = TEST_DEMO_RX.test(l.name ?? '')
    const isInactive = l.is_active === false
    const valid = !isTest && !isInactive
    out.push({
      kind: 'location',
      id: l.id,
      organization_id: l.organization_id,
      label: l.name ?? 'Lager',
      geofence: {
        latitude: Number(l.latitude),
        longitude: Number(l.longitude),
        radius_meters: Number(l.radius_meters || 100),
        geofence_mode: l.geofence_mode ?? 'circle',
        geofence_polygon: l.geofence_polygon ?? null,
      },
      targetValidity: valid ? 'valid' : 'invalid',
      timeTrackingAllowed: valid,
      invalidReason: isTest ? 'test_target' : isInactive ? 'inactive' : undefined,
    })
  }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, organization_id, client, status, delivery_latitude, delivery_longitude, rigdaydate, eventdate, rigdowndate, large_project_id')
    .or(`rigdaydate.gte.${yesterdayIso},eventdate.gte.${yesterdayIso},rigdowndate.gte.${yesterdayIso}`)
    .or(`rigdaydate.lte.${tomorrowIso},eventdate.lte.${tomorrowIso},rigdowndate.lte.${tomorrowIso}`)
    .not('delivery_latitude', 'is', null)
    .not('delivery_longitude', 'is', null)
    .limit(500)

  for (const b of bookings ?? []) {
    if (b.large_project_id) continue
    const label = b.client ?? 'Bokning'
    const isTest = TEST_DEMO_RX.test(label)
    const status = String(b.status ?? '').toUpperCase()
    const isCancelled = status === 'CANCELLED'
    const isArchived = status === 'ARCHIVED'
    const valid = !isTest && !isCancelled && !isArchived
    out.push({
      kind: 'booking',
      id: b.id,
      organization_id: b.organization_id,
      label,
      geofence: {
        latitude: Number(b.delivery_latitude),
        longitude: Number(b.delivery_longitude),
        radius_meters: 100,
        geofence_mode: 'circle',
      },
      targetValidity: valid ? 'valid' : 'invalid',
      timeTrackingAllowed: valid,
      invalidReason: isTest ? 'test_target' : isCancelled ? 'cancelled' : isArchived ? 'archived' : undefined,
    })
  }

  const { data: projects } = await supabase
    .from('large_projects')
    .select('id, organization_id, name, status, deleted_at, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon')
    .not('address_latitude', 'is', null)
    .not('address_longitude', 'is', null)
    .limit(500)
  for (const p of projects ?? []) {
    const label = p.name ?? 'Projekt'
    const isTest = TEST_DEMO_RX.test(label)
    const status = String(p.status ?? '').toLowerCase()
    const isCancelled = status === 'cancelled' || status === 'avbokat'
    const isArchived = !!p.deleted_at || status === 'archived' || status === 'closed' || status === 'stängt'
    const valid = !isTest && !isCancelled && !isArchived
    out.push({
      kind: 'project',
      id: p.id,
      organization_id: p.organization_id,
      label,
      geofence: {
        latitude: Number(p.address_latitude),
        longitude: Number(p.address_longitude),
        radius_meters: Number(p.address_radius_meters || 100),
        geofence_mode: p.address_geofence_mode ?? 'circle',
        geofence_polygon: p.address_geofence_polygon ?? null,
      },
      targetValidity: valid ? 'valid' : 'invalid',
      timeTrackingAllowed: valid,
      invalidReason: isTest ? 'test_target' : isCancelled ? 'cancelled' : isArchived ? 'archived' : undefined,
    })
  }

  return out
}

/**
 * Evaluate ALL stable visit segments to a target within the ping window.
 */
export function evaluateStableSegments(target: Target, pings: Ping[]): StableHit[] {
  const SEG_GAP_MS = 10 * 60 * 1000
  const segments: Ping[][] = []
  let cur: Ping[] = []
  for (const p of pings) {
    const inside = isInsideGeofence(p.lat, p.lng, target.geofence)
    if (inside) {
      if (cur.length === 0 || p.ts - cur[cur.length - 1].ts <= SEG_GAP_MS) {
        cur.push(p)
      } else {
        segments.push(cur)
        cur = [p]
      }
    }
  }
  if (cur.length) segments.push(cur)

  const out: StableHit[] = []
  for (const inside of segments) {
    if (inside.length === 0) continue
    const dwell = inside[inside.length - 1].ts - inside[0].ts
    const enoughCount = inside.length >= ENTRY_PING_MIN_COUNT
    const enoughDwell = dwell >= ENTRY_PING_MIN_DWELL_MS
    if (!enoughCount && !enoughDwell) continue
    // Absolute floor — even a "suggestion/review" event needs ≥2 min dwell to
    // avoid pure GPS noise. Per-target thresholds (location vs booking/project,
    // assigned-or-not) are evaluated in processStaff which has access to
    // staff_assignments to decide materialise vs suggestion-only.
    if (dwell < AUTO_START_ABSOLUTE_FLOOR_MS) {
      console.log('[auto-start] below_absolute_floor_skipped', {
        target: target.label,
        target_kind: target.kind,
        dwell_minutes: Math.round(dwell / 60_000),
        ping_count: inside.length,
        first_ping_at: new Date(inside[0].ts).toISOString(),
      })
      continue
    }
    const goodAcc = inside.filter(p => p.accuracy == null || p.accuracy <= ENTRY_PING_MAX_ACCURACY_M)
    if (goodAcc.length * 2 < inside.length) continue
    const firstReliable = goodAcc[0] ?? inside[0]
    const accSum = inside.reduce((s, p) => s + (p.accuracy ?? 0), 0)
    const avgAcc = accSum / inside.length
    const confidence: 'low' | 'medium' | 'high' =
      inside.length >= 5 && dwell >= 4 * 60_000 ? 'high' :
      inside.length >= 3 && dwell >= 2 * 60_000 ? 'medium' : 'low'
    out.push({
      target,
      pings: inside,
      firstReliableTs: firstReliable.ts,
      lastInsideTs: inside[inside.length - 1].ts,
      dwellMs: dwell,
      avgAccuracy: avgAcc,
      confidence,
    })
  }
  return out
}

async function emitAssistantEvent(supabase: any, payload: Record<string, any>, dk: string, report: ProcessReport, kind: string) {
  if (report.dry_run) {
    planPush(report, { action: `event_${kind}`, dedupe_key: dk, happened_at: payload.happened_at, target: payload.target_label })
    report.events_emitted++
    return
  }
  const { error } = await supabase.from('assistant_events').insert({ ...payload, dedupe_key: dk })
  if (error && String(error.code) !== '23505') {
    report.errors.push(`assistant_event ${kind}: ${error.message}`)
  } else {
    report.events_emitted++
  }
}

async function ensureWorkdayOpen(
  supabase: any, staffId: string, orgId: string, arrivalIso: string,
  hit: StableHit, report: ProcessReport,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('workdays')
    .select('id, started_at, started_by, metadata')
    .eq('staff_id', staffId)
    .is('ended_at', null)
    .maybeSingle()
  if (existing?.id) {
    // ── Rewind-policy ────────────────────────────────────────────────
    // Om GPS bekräftar arbete TIDIGARE än den nuvarande workday-starten
    // (t.ex. assigned-projekt 08:00, men workday öppnades vid 13:10 av
    // watchdog/senare auto-start), backdatera till första stabila ankomst.
    // Säkert ENDAST när:
    //   - existing.started_by är server-källa (aldrig manuell/admin),
    //   - skillnaden är ≥ 5 min (undviker brus),
    //   - och den nya tiden är samma kalenderdag (UTC) som existing.
    try {
      const arrivalMs = new Date(arrivalIso).getTime()
      const existingMs = existing.started_at ? new Date(existing.started_at).getTime() : null
      const startedBy = String(existing.started_by ?? '')
      const isServerStarted =
        startedBy === 'server_auto_start'
        || startedBy === 'server_auto_start_backfill'
        || startedBy === 'system'
        || startedBy === 'watchdog'
        || startedBy === ''
      const sameDay = existingMs != null
        && new Date(arrivalMs).toISOString().slice(0, 10) === new Date(existingMs).toISOString().slice(0, 10)
      if (
        existingMs != null
        && isServerStarted
        && sameDay
        && arrivalMs <= existingMs - 5 * 60_000
      ) {
        if (report.dry_run) {
          planPush(report, {
            action: 'workday_rewind',
            workday_id: existing.id,
            from: existing.started_at,
            to: arrivalIso,
            target: hit.target.label,
          })
        } else {
          const prevMeta = (existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}
          await supabase
            .from('workdays')
            .update({
              started_at: arrivalIso,
              started_by: report.mode === 'backfill_day' ? 'server_auto_start_backfill' : 'server_auto_start',
              metadata: {
                ...prevMeta,
                auto_started: true,
                rewound_from: existing.started_at,
                rewound_at: new Date().toISOString(),
                rewound_reason: 'earlier_stable_gps_on_assigned_or_known_site',
                auto_start_source: report.source_tag,
                engine_version: report.engine_version,
                run_id: report.run_id,
                matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
                confidence: hit.confidence,
                arrival_pings_count: hit.pings.length,
                first_arrival_ping_at: arrivalIso,
                dwell_ms: hit.dwellMs,
                avg_accuracy_m: hit.avgAccuracy,
              },
            })
            .eq('id', existing.id)
          report.workdays_opened++
        }
      } else {
        report.skipped_existing++
      }
    } catch (_e) {
      report.skipped_existing++
    }
    return existing.id
  }
  if (report.dry_run) {
    planPush(report, { action: 'workday_open', staff_id: staffId, started_at: arrivalIso, target: hit.target.label })
    report.workdays_opened++
    return 'dry-run-workday'
  }
  const { data: wd, error: wdErr } = await supabase
    .from('workdays')
    .insert({
      staff_id: staffId,
      organization_id: orgId,
      started_at: arrivalIso,
      started_by: report.mode === 'backfill_day' ? 'server_auto_start_backfill' : 'server_auto_start',
      notes: `Auto-started from GPS arrival at ${hit.target.label}`,
      metadata: {
        auto_started: true,
        auto_start_source: report.source_tag,
        engine_version: report.engine_version,
        run_id: report.run_id,
        matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
        confidence: hit.confidence,
        arrival_pings_count: hit.pings.length,
        first_arrival_ping_at: arrivalIso,
        dwell_ms: hit.dwellMs,
        avg_accuracy_m: hit.avgAccuracy,
      },
    })
    .select('id').maybeSingle()
  if (wdErr) {
    if (String(wdErr.code) !== '23505') report.errors.push(`workday insert: ${wdErr.message}`)
    const { data: again } = await supabase
      .from('workdays').select('id').eq('staff_id', staffId).is('ended_at', null).maybeSingle()
    return again?.id ?? null
  }
  report.workdays_opened++
  return wd?.id ?? null
}

async function closeOpenLteForSwitch(
  supabase: any, staffId: string, departureIso: string, prevHit: StableHit,
  nextHit: StableHit, report: ProcessReport,
): Promise<{ closed: boolean; lteId: string | null }> {
  const { data: openLtes } = await supabase
    .from('location_time_entries')
    .select('id, location_id, booking_id, large_project_id, entered_at, source, metadata')
    .eq('staff_id', staffId)
    .is('exited_at', null)
  if (!openLtes || openLtes.length === 0) return { closed: false, lteId: null }

  const prevMatch = openLtes.find((l: any) => targetMatchesLte(prevHit.target, l)) ?? null
  if (!prevMatch) return { closed: false, lteId: null }

  const enteredAt = new Date(prevMatch.entered_at).getTime()
  const departureTs = new Date(departureIso).getTime()
  if (departureTs <= enteredAt) return { closed: false, lteId: null }

  const totalMinutes = Math.max(1, Math.round((departureTs - enteredAt) / 60000))
  const meta = (prevMatch.metadata && typeof prevMatch.metadata === 'object') ? prevMatch.metadata : {}
  if (report.dry_run) {
    planPush(report, { action: 'lte_close', lte_id: prevMatch.id, exited_at: departureIso, total_minutes: totalMinutes, target: prevHit.target.label })
    report.ltes_closed++
    return { closed: true, lteId: prevMatch.id }
  }
  const { error } = await supabase
    .from('location_time_entries')
    .update({
      exited_at: departureIso,
      stop_source: 'server_background_gps_switch',
      stop_reason: 'switched_to_new_work_site',
      stopped_by: 'system:process-location-auto-start',
      stop_metadata: {
        engine_version: report.engine_version,
        run_id: report.run_id,
        switch: {
          previous_target: { kind: prevHit.target.kind, id: prevHit.target.id, label: prevHit.target.label },
          next_target: { kind: nextHit.target.kind, id: nextHit.target.id, label: nextHit.target.label },
          departure_at: departureIso,
          arrival_at: new Date(nextHit.firstReliableTs).toISOString(),
          confidence: nextHit.confidence,
        },
      },
      metadata: {
        ...meta,
        closed_by: 'server_auto_switch',
        closed_at_source: 'geofence_auto_switch_server',
        engine_version: report.engine_version,
        run_id: report.run_id,
        switch: {
          previous_target: { kind: prevHit.target.kind, id: prevHit.target.id, label: prevHit.target.label },
          next_target: { kind: nextHit.target.kind, id: nextHit.target.id, label: nextHit.target.label },
          departure_at: departureIso,
          arrival_at: new Date(nextHit.firstReliableTs).toISOString(),
          confidence: nextHit.confidence,
        },
      },
    })
    .eq('id', prevMatch.id)
    .is('exited_at', null)
  if (error) {
    report.errors.push(`lte close: ${error.message}`)
    return { closed: false, lteId: null }
  }
  report.ltes_closed++
  return { closed: true, lteId: prevMatch.id }
}

async function ensureLteOpenForTarget(
  supabase: any, staffId: string, orgId: string, arrivalIso: string,
  hit: StableHit, report: ProcessReport,
): Promise<string | null> {
  const baseQ = supabase.from('location_time_entries')
    .select('id').eq('staff_id', staffId).is('exited_at', null)
  const q = hit.target.kind === 'location' ? baseQ.eq('location_id', hit.target.id)
    : hit.target.kind === 'booking' ? baseQ.eq('booking_id', hit.target.id)
    : baseQ.eq('large_project_id', hit.target.id)
  const { data: open } = await q.maybeSingle()
  if (open?.id) { report.skipped_existing++; return open.id }

  const windowStart = new Date(new Date(arrivalIso).getTime() - 10 * 60_000).toISOString()
  const windowEnd = new Date(new Date(arrivalIso).getTime() + 10 * 60_000).toISOString()
  const closedQ = supabase.from('location_time_entries')
    .select('id')
    .eq('staff_id', staffId)
    .gte('entered_at', windowStart)
    .lte('entered_at', windowEnd)
  const closedScoped = hit.target.kind === 'location' ? closedQ.eq('location_id', hit.target.id)
    : hit.target.kind === 'booking' ? closedQ.eq('booking_id', hit.target.id)
    : closedQ.eq('large_project_id', hit.target.id)
  const { data: recentClosed } = await closedScoped.maybeSingle()
  if (recentClosed?.id) { report.skipped_existing++; return recentClosed.id }

  const payload: Record<string, any> = {
    organization_id: orgId,
    staff_id: staffId,
    entry_date: arrivalIso.slice(0, 10),
    entered_at: arrivalIso,
    source: 'gps_geofence_auto_start',
    client_dedupe_key: `srv:${staffId}:${hit.target.kind}:${hit.target.id}:${bucketTo5Min(arrivalIso)}`,
    metadata: {
      auto_started: true,
      auto_start_source: 'gps_geofence_auto_start',
      auto_start_mode: report.mode,
      engine_version: report.engine_version,
      run_id: report.run_id,
      matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
      target_validity: hit.target.targetValidity,
      time_tracking_allowed: hit.target.timeTrackingAllowed,
      confidence: hit.confidence,
      arrival_pings_count: hit.pings.length,
      first_arrival_ping_at: arrivalIso,
      ping_ids: hit.pings.map(p => p.id),
      ping_range: {
        first: new Date(hit.pings[0].ts).toISOString(),
        last: new Date(hit.pings[hit.pings.length - 1].ts).toISOString(),
      },
      radius_m: hit.target.geofence.radius_meters,
      avg_accuracy_m: hit.avgAccuracy,
      dwell_ms: hit.dwellMs,
    },
  }
  if (hit.target.kind === 'location') payload.location_id = hit.target.id
  else if (hit.target.kind === 'booking') payload.booking_id = hit.target.id
  else payload.large_project_id = hit.target.id

  if (report.dry_run) {
    planPush(report, { action: 'lte_open', staff_id: staffId, target: hit.target.label, kind: hit.target.kind, target_id: hit.target.id, entered_at: arrivalIso })
    report.ltes_opened++
    return 'dry-run-lte'
  }
  const { data: lte, error } = await supabase
    .from('location_time_entries').insert(payload).select('id').maybeSingle()
  if (error) {
    if (String(error.code) !== '23505') report.errors.push(`lte insert: ${error.message}`)
    return null
  }
  report.ltes_opened++
  return lte?.id ?? null
}

async function ensureTravelLog(
  supabase: any, staffId: string, orgId: string, prevHit: StableHit, nextHit: StableHit,
  departureIso: string, arrivalIso: string, report: ProcessReport,
) {
  const dur = new Date(arrivalIso).getTime() - new Date(departureIso).getTime()
  if (dur < 60_000 || dur > 8 * 3600_000) return

  // Idempotency: any prior auto-switch travel for this exact (staff, start, end)
  // — both cron and backfill source tags count, so a second run never doubles.
  const { data: existing } = await supabase
    .from('travel_time_logs')
    .select('id, source')
    .eq('staff_id', staffId)
    .eq('start_time', departureIso)
    .eq('end_time', arrivalIso)
    .maybeSingle()
  if (existing?.id && typeof existing.source === 'string'
      && existing.source.startsWith('geofence_auto_switch_server')) return

  if (report.dry_run) {
    planPush(report, { action: 'travel_create', staff_id: staffId, start_time: departureIso, end_time: arrivalIso, from: prevHit.target.label, to: nextHit.target.label })
    report.travels_created++
    return
  }
  const { error } = await supabase.from('travel_time_logs').insert({
    staff_id: staffId,
    organization_id: orgId,
    report_date: arrivalIso.slice(0, 10),
    start_time: departureIso,
    end_time: arrivalIso,
    hours_worked: Math.round((dur / 3600_000) * 100) / 100,
    auto_detected: true,
    source: 'gap_derived',
    classification: 'unclassified',
    needs_review: true,
    previous_target_type: prevHit.target.kind,
    previous_target_id: prevHit.target.id,
    next_target_type: nextHit.target.kind,
    next_target_id: nextHit.target.id,
    // Tag destination booking so projektvyn kan visa restiden som suggested
    // travel mot rätt projekt utan att admin behöver pussla manuellt.
    destination_booking_id: nextHit.target.kind === 'booking' ? nextHit.target.id : null,
    description: `Auto-switch ${prevHit.target.label} → ${nextHit.target.label}`,
  })
  if (error) report.errors.push(`travel insert: ${error.message}`)
  else report.travels_created++
}

export async function processStaff(
  supabase: any,
  staffId: string,
  pings: Ping[],
  targets: Target[],
  report: ProcessReport,
) {
  if (pings.length === 0) return
  const orgId = pings[0].organization_id

  const allHits: StableHit[] = []
  for (const t of targets) {
    if (t.organization_id !== orgId) continue
    for (const h of evaluateStableSegments(t, pings)) allHits.push(h)
  }
  if (allHits.length === 0) return

  allHits.sort((a, b) => a.firstReliableTs - b.firstReliableTs)

  const ordered: StableHit[] = []
  for (const h of allHits) {
    const last = ordered[ordered.length - 1]
    if (last && last.target.kind === h.target.kind && last.target.id === h.target.id
        && h.firstReliableTs <= last.lastInsideTs + 10 * 60_000) {
      last.lastInsideTs = Math.max(last.lastInsideTs, h.lastInsideTs)
      last.pings = [...last.pings, ...h.pings]
      last.dwellMs = last.lastInsideTs - last.firstReliableTs
      continue
    }
    ordered.push({ ...h })
  }

  // ── Assignment lookup (per dag) ──────────────────────────────────────────
  // Used to lower the dwell threshold from 15 → 5 min for booking/project when
  // staff is actually assigned to that target on the visit date.
  const dayKeys = new Set<string>(ordered.map(h => new Date(h.firstReliableTs).toISOString().slice(0, 10)))
  const assignedKey = (kind: string, id: string, day: string) => `${kind}:${id}:${day}`
  const assignedSet = new Set<string>()
  try {
    const days = Array.from(dayKeys)
    if (days.length > 0) {
      const fromDay = days.reduce((a, b) => a < b ? a : b)
      const toDay = days.reduce((a, b) => a > b ? a : b)
      const { data: sa } = await supabase
        .from('staff_assignments')
        .select('booking_id, large_project_id, work_date')
        .eq('staff_id', staffId)
        .gte('work_date', fromDay)
        .lte('work_date', toDay)
      for (const row of sa ?? []) {
        const day = String(row.work_date).slice(0, 10)
        if (row.booking_id) assignedSet.add(assignedKey('booking', row.booking_id, day))
        if (row.large_project_id) assignedSet.add(assignedKey('project', row.large_project_id, day))
      }
    }
  } catch (e: any) {
    console.warn('[auto-start] assignment lookup failed', e?.message ?? e)
  }

  // ── Private zones lookup (home/manual_ignore/recurring_night) ───────────
  // GPS auto-start får ALDRIG materialisera tid när första stabila ping
  // ligger inom en privat zon för staff:en.
  const privateZones: Array<{ lat: number; lng: number; radiusM: number; kind: string }> = []
  try {
    const { data: pz } = await supabase
      .from('staff_private_zones')
      .select('latitude, longitude, radius_meters, zone_type, is_active')
      .eq('staff_id', staffId)
    for (const z of pz ?? []) {
      if (z.is_active === false) continue
      if (z.latitude == null || z.longitude == null) continue
      privateZones.push({
        lat: Number(z.latitude),
        lng: Number(z.longitude),
        radiusM: Number(z.radius_meters || 150),
        kind: String(z.zone_type ?? 'manual_ignore'),
      })
    }
  } catch {
    // table may not exist in some envs — treat as no zones
  }
  const insidePrivateZone = (lat: number, lng: number) => {
    for (const z of privateZones) {
      // Cheap haversine
      const R = 6371000
      const dLat = (lat - z.lat) * Math.PI / 180
      const dLng = (lng - z.lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(z.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2
      const d = 2 * R * Math.asin(Math.sqrt(a))
      if (d <= z.radiusM) return z
    }
    return null
  }

  report.arrivals += ordered.length

  let workdayId: string | null = null
  let prevHit: StableHit | null = null

  const MIN_ARRIVAL_PINGS = ENTRY_PING_MIN_COUNT
  const NIGHT_MIN_CONFIDENCE: 'high' = 'high'
  const NIGHT_DWELL_MULTIPLIER = 2

  const emitBlocked = async (hit: StableHit, arrivalIso: string, blockReason: AutoStartBlockReason, extras: Record<string, any>) => {
    const dk = `${staffId}:blocked:${hit.target.kind}:${hit.target.id}:${blockReason}:${bucketTo5Min(arrivalIso)}`
    console.log('[auto-start] blocked', { staff_id: staffId, target: hit.target.label, target_kind: hit.target.kind, reason: blockReason, ...extras })
    await emitAssistantEvent(supabase, {
      organization_id: orgId,
      staff_id: staffId,
      event_type: 'arrival_blocked',
      target_type: hit.target.kind,
      target_id: hit.target.id,
      target_label: hit.target.label,
      happened_at: arrivalIso,
      source: 'geofence_background',
      suggested_action: 'review_blocked_arrival',
      resolution_status: 'pending',
      stale_for_prompt: false,
      still_relevant_for_review: true,
      linked_workday_id: null,
      metadata: {
        auto_started: false,
        blocked: true,
        block_reason: blockReason,
        engine_version: report.engine_version,
        run_id: report.run_id,
        matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
        target_validity: hit.target.targetValidity,
        time_tracking_allowed: hit.target.timeTrackingAllowed,
        invalid_reason: hit.target.invalidReason ?? null,
        confidence: hit.confidence,
        dwell_ms: hit.dwellMs,
        arrival_pings_count: hit.pings.length,
        first_arrival_ping_at: arrivalIso,
        avg_accuracy_m: hit.avgAccuracy,
        ...extras,
      },
    }, dk, report, 'arrival_blocked')
  }

  // ── Night policy helper (00:00–05:00 local Europe/Stockholm) ─────────────
  // Stronger evidence required, but real night jobs at valid worksites are
  // still allowed.
  const NIGHT_DWELL_BOOKING_MS = 30 * 60_000
  const NIGHT_DWELL_LOCATION_MS = 15 * 60_000
  const NIGHT_MIN_PINGS = 5
  const stockholmHour = (ts: number): number => {
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false,
      })
      return Number(fmt.format(new Date(ts)))
    } catch {
      return new Date(ts).getUTCHours()
    }
  }
  const buildNightPolicy = (hit: StableHit, isAssigned: boolean) => {
    const hourLocal = stockholmHour(hit.firstReliableTs)
    const isNightLocal = hourLocal >= 0 && hourLocal < 5
    const requiredDwellMsBase = requiredDwellMs(hit.target.kind, isAssigned)
    const requiredDwellMsNight = hit.target.kind === 'location'
      ? NIGHT_DWELL_LOCATION_MS
      : NIGHT_DWELL_BOOKING_MS
    const requiredDwell = isNightLocal
      ? Math.max(requiredDwellMsBase, requiredDwellMsNight)
      : requiredDwellMsBase
    const requiredArrivalPings = isNightLocal ? NIGHT_MIN_PINGS : MIN_ARRIVAL_PINGS
    const requiredConfidence: 'high' | 'medium' = isNightLocal ? 'high' : 'medium'
    return {
      isNightLocal,
      hourLocal,
      requiredDwellSeconds: Math.round(requiredDwell / 1000),
      requiredDwellMs: requiredDwell,
      requiredArrivalPings,
      requiredConfidence,
    }
  }

  for (const hit of ordered) {
    const arrivalIso = new Date(hit.firstReliableTs).toISOString()
    const visitDay = arrivalIso.slice(0, 10)
    const isAssigned =
      hit.target.kind !== 'location' &&
      assignedSet.has(assignedKey(hit.target.kind, hit.target.id, visitDay))

    const np = buildNightPolicy(hit, isAssigned)
    const nightPolicyMeta = (allowed: boolean, blockReason: AutoStartBlockReason | null) => ({
      isNightLocal: np.isNightLocal,
      hourLocal: np.hourLocal,
      requiredDwellSeconds: np.requiredDwellSeconds,
      requiredArrivalPings: np.requiredArrivalPings,
      requiredConfidence: np.requiredConfidence,
      allowed,
      blockReason,
    })

    // ── Hard blocks ────────────────────────────────────────────────────────
    // 1. Invalid target (test/demo, cancelled, archived, inactive)
    if (hit.target.targetValidity !== 'valid' || !hit.target.timeTrackingAllowed) {
      const reason: AutoStartBlockReason =
        hit.target.invalidReason === 'test_target' ? 'blocked_test_target'
        : hit.target.invalidReason === 'cancelled' ? 'blocked_cancelled'
        : hit.target.invalidReason === 'archived' ? 'blocked_archived'
        : hit.target.invalidReason === 'inactive' ? 'blocked_inactive'
        : 'blocked_invalid_target'
      await emitBlocked(hit, arrivalIso, reason, { nightPolicy: nightPolicyMeta(false, reason) })
      continue
    }
    // 2. Private zone (home / manual_ignore / recurring_night)
    const firstPing = hit.pings[0]
    const pz = firstPing ? insidePrivateZone(firstPing.lat, firstPing.lng) : null
    if (pz) {
      // Special-case at night: surface as combined "home or unknown night movement"
      const reason: AutoStartBlockReason = np.isNightLocal
        ? 'blocked_home_or_unknown_night_movement'
        : 'blocked_home'
      await emitBlocked(hit, arrivalIso, reason, {
        private_zone_kind: pz.kind,
        nightPolicy: nightPolicyMeta(false, reason),
      })
      continue
    }
    // 3. Not enough arrival pings (night requires more)
    if (hit.pings.length < np.requiredArrivalPings) {
      await emitBlocked(hit, arrivalIso, 'blocked_not_enough_pings', {
        min_pings: np.requiredArrivalPings,
        nightPolicy: nightPolicyMeta(false, 'blocked_not_enough_pings'),
      })
      continue
    }
    // 4. Night requires high confidence (real night-jobs do produce stable
    //    high-confidence dwell; spurious noise gets blocked).
    if (np.isNightLocal && hit.confidence !== np.requiredConfidence) {
      await emitBlocked(hit, arrivalIso, 'blocked_night_requires_stronger_evidence', {
        required_confidence: np.requiredConfidence,
        required_dwell_ms: np.requiredDwellMs,
        nightPolicy: nightPolicyMeta(false, 'blocked_night_requires_stronger_evidence'),
      })
      continue
    }

    const requiredDwell = np.requiredDwellMs
    const meetsDwell = hit.dwellMs >= requiredDwell
    const lowConfidence = hit.confidence === 'low'
    const materialise = meetsDwell && !lowConfidence
    // Stash for downstream metadata
    ;(hit as any)._nightPolicy = nightPolicyMeta(materialise, materialise ? null : (lowConfidence ? 'blocked_low_confidence' : 'blocked_not_enough_dwell'))

    if (!materialise) {
      // Suggestion-only path: emit a review event, do NOT open workday/LTE,
      // do NOT close prev LTE, do NOT create travel — preserves the visit
      // for admin review without polluting time reports.
      const sugDk = `${staffId}:suggestion:${hit.target.kind}:${hit.target.id}:${bucketTo5Min(arrivalIso)}`
      const reason =
        lowConfidence ? 'low_confidence'
        : hit.target.kind === 'location' ? 'short_visit_below_location_threshold'
        : isAssigned ? 'short_visit_below_assigned_threshold'
        : 'short_visit_below_project_threshold'
      console.log('[auto-start] suggestion_only', {
        staff_id: staffId,
        target: hit.target.label,
        target_kind: hit.target.kind,
        is_assigned: isAssigned,
        dwell_minutes: Math.round(hit.dwellMs / 60_000),
        required_minutes: Math.round(requiredDwell / 60_000),
        confidence: hit.confidence,
        reason,
      })
      await emitAssistantEvent(supabase, {
        organization_id: orgId,
        staff_id: staffId,
        event_type: 'arrival_suggestion',
        target_type: hit.target.kind,
        target_id: hit.target.id,
        target_label: hit.target.label,
        happened_at: arrivalIso,
        source: 'geofence_background',
        suggested_action: 'review_short_visit',
        resolution_status: 'pending',
        stale_for_prompt: false,
        still_relevant_for_review: true,
        linked_workday_id: null,
        metadata: {
          auto_started: false,
          suggestion_only: true,
          reason,
          block_reason: (lowConfidence ? 'blocked_low_confidence' : 'blocked_not_enough_dwell') as AutoStartBlockReason,
          dwell_ms: hit.dwellMs,
          required_dwell_ms: requiredDwell,
          is_assigned: isAssigned,
          confidence: hit.confidence,
          engine_version: report.engine_version,
          run_id: report.run_id,
          matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
          target_validity: hit.target.targetValidity,
          time_tracking_allowed: hit.target.timeTrackingAllowed,
          arrival_pings_count: hit.pings.length,
          first_arrival_ping_at: arrivalIso,
        },
      }, sugDk, report, 'arrival_suggestion')
      // Do NOT update prevHit — the next real materialised hit should
      // continue any switch logic from the previous real hit.
      continue
    }

    if (!workdayId) {
      workdayId = await ensureWorkdayOpen(supabase, staffId, orgId, arrivalIso, hit, report)
    }

    if (prevHit && (prevHit.target.kind !== hit.target.kind || prevHit.target.id !== hit.target.id)) {
      const departureTs = Math.min(prevHit.lastInsideTs, hit.firstReliableTs)
      const departureIso = new Date(departureTs).toISOString()
      report.switches++

      await closeOpenLteForSwitch(supabase, staffId, departureIso, prevHit, hit, report)

      const depDk = `${staffId}:departure:${prevHit.target.kind}:${prevHit.target.id}:${bucketTo5Min(departureIso)}`
      await emitAssistantEvent(supabase, {
        organization_id: orgId,
        staff_id: staffId,
        event_type: 'departure',
        target_type: prevHit.target.kind,
        target_id: prevHit.target.id,
        target_label: prevHit.target.label,
        happened_at: departureIso,
        source: 'geofence_background',
        suggested_action: 'end_activity',
        resolution_status: 'auto_closed_by_later_action',
        resolution_notes: 'auto_switch by server_background_gps',
        resolved_at: new Date().toISOString(),
        resolved_by: 'server_auto_switch',
        stale_for_prompt: true,
        still_relevant_for_review: true,
        linked_workday_id: workdayId,
        metadata: {
          auto_started: true,
          source: 'geofence_auto_switch_server',
          engine_version: report.engine_version,
          run_id: report.run_id,
          previous_target: { kind: prevHit.target.kind, id: prevHit.target.id, label: prevHit.target.label },
          next_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
          departure_at: departureIso,
          arrival_at: arrivalIso,
          confidence: hit.confidence,
        },
      }, depDk, report, 'departure')

      await ensureTravelLog(supabase, staffId, orgId, prevHit, hit, departureIso, arrivalIso, report)
    }

    const lteId = await ensureLteOpenForTarget(supabase, staffId, orgId, arrivalIso, hit, report)

    const isSwitch = !!prevHit && (prevHit.target.kind !== hit.target.kind || prevHit.target.id !== hit.target.id)
    const arrDk = `${staffId}:arrival:${hit.target.kind}:${hit.target.id}:${bucketTo5Min(arrivalIso)}`
    await emitAssistantEvent(supabase, {
      organization_id: orgId,
      staff_id: staffId,
      event_type: 'arrival',
      target_type: hit.target.kind,
      target_id: hit.target.id,
      target_label: hit.target.label,
      happened_at: arrivalIso,
      source: 'geofence_background',
      suggested_action: 'start_activity',
      resolution_status: 'auto_closed_by_later_action',
      resolution_notes: isSwitch
        ? 'auto_switch by server_background_gps'
        : 'auto_started by server_background_gps',
      resolved_at: new Date().toISOString(),
      resolved_by: isSwitch ? 'server_auto_switch' : 'server_auto_start',
      stale_for_prompt: true,
      still_relevant_for_review: true,
      linked_workday_id: workdayId,
      metadata: {
        auto_started: true,
        auto_start_source: isSwitch ? 'geofence_auto_switch_server' : 'server_background_gps',
        engine_version: report.engine_version,
        run_id: report.run_id,
        matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
        confidence: hit.confidence,
        is_assigned: isAssigned,
        dwell_ms: hit.dwellMs,
        required_dwell_ms: requiredDwell,
        arrival_pings_count: hit.pings.length,
        first_arrival_ping_at: arrivalIso,
        linked_lte_id: lteId,
      },
    }, arrDk, report, isSwitch ? 'arrival(switch)' : 'arrival')

    prevHit = hit
  }
}

export async function runEngine(supabase: any, body: any): Promise<ProcessReport> {
  const action: 'cron' | 'backfill_day' = body?.action === 'backfill_day' ? 'backfill_day' : 'cron'
  const dryRun: boolean = action === 'backfill_day'
    ? (body.dry_run !== false && body.dry_run !== 'false')
    : !!body?.dry_run

  const runId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

  const report: ProcessReport = {
    run_id: runId,
    engine_version: ENGINE_VERSION,
    mode: action,
    dry_run: dryRun,
    source_tag: action === 'backfill_day' ? 'server_background_gps_backfill' : 'server_background_gps',
    staff: 0, pings: 0, arrivals: 0, switches: 0,
    workdays_opened: 0, ltes_opened: 0, ltes_closed: 0,
    travels_created: 0, events_emitted: 0, skipped_existing: 0, errors: [],
    plan: [],
  }

  let fromIso: string
  let toIso: string
  let staffFilter: string | null = null
  let orgFilter: string | null = null
  let dateFilter: string | null = null

  if (action === 'backfill_day') {
    const date: string = String(body.date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('date (YYYY-MM-DD) required for backfill_day')
    }
    dateFilter = date
    fromIso = new Date(`${date}T00:00:00.000Z`).toISOString()
    toIso = new Date(`${date}T23:59:59.999Z`).toISOString()
    staffFilter = body.staff_id || null
    orgFilter = body.organization_id || null
  } else {
    orgFilter = body.organization_id || null
    const cursorIso = await loadCursor(supabase, orgFilter)
    console.log(`[auto-start] cron cursor BEFORE org=${orgFilter ?? 'global'}: ${cursorIso}`)
    fromIso = new Date(Math.min(
      Date.now() - PROCESS_OVERLAP_MS,
      new Date(cursorIso).getTime() - PROCESS_OVERLAP_MS,
    )).toISOString()
    toIso = new Date().toISOString()
  }


  // Open run-log row (best-effort; never blocks engine)
  if (!dryRun) {
    try {
      await supabase.from('location_auto_start_runs').insert({
        id: runId,
        engine_version: ENGINE_VERSION,
        mode: action,
        dry_run: false,
        source_tag: report.source_tag,
        organization_id: orgFilter,
        staff_id: staffFilter,
        date_filter: dateFilter,
        from_iso: fromIso,
        to_iso: toIso,
        status: 'running',
        request_body: body ?? null,
      })
    } catch (e: any) {
      report.errors.push(`run-log open: ${e?.message ?? e}`)
    }
  }

  const finalize = async (status: 'ok' | 'error') => {
    if (dryRun) return
    try {
      await supabase.from('location_auto_start_runs').update({
        finished_at: new Date().toISOString(),
        status,
        staff_count: report.staff,
        pings_processed: report.pings,
        arrivals: report.arrivals,
        switches: report.switches,
        created_workdays: report.workdays_opened,
        opened_ltes: report.ltes_opened,
        closed_ltes: report.ltes_closed,
        created_travel_logs: report.travels_created,
        created_assistant_events: report.events_emitted,
        skipped_existing: report.skipped_existing,
        errors: report.errors,
      }).eq('id', runId)
    } catch (e: any) {
      // swallow — engine result already returned
      console.error('run-log finalize failed', e?.message ?? e)
    }
  }

  try {
    // Paginate to bypass PostgREST's hard 1000-row cap.
    const PAGE = 1000
    const HARD_CAP = action === 'backfill_day' ? 50000 : 10000
    const rawPings: any[] = []
    let from = 0
    while (rawPings.length < HARD_CAP) {
      let q = supabase
        .from('staff_location_history')
        .select('id, staff_id, organization_id, lat, lng, accuracy, recorded_at')
        .gte('recorded_at', fromIso)
        .lte('recorded_at', toIso)
        .order('recorded_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (staffFilter) q = q.eq('staff_id', staffFilter)
      if (orgFilter) q = q.eq('organization_id', orgFilter)
      const { data: page, error: pingErr } = await q
      if (pingErr) throw pingErr
      const rows = page ?? []
      rawPings.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }

    const pings: Ping[] = (rawPings ?? []).map((r: any) => ({
      id: r.id,
      staff_id: r.staff_id,
      organization_id: r.organization_id,
      lat: Number(r.lat),
      lng: Number(r.lng),
      accuracy: r.accuracy != null ? Number(r.accuracy) : null,
      recorded_at: r.recorded_at,
      ts: new Date(r.recorded_at).getTime(),
    }))
    report.pings = pings.length

    if (pings.length === 0) {
      await finalize('ok')
      return report
    }

    const targets = await loadTargets(supabase)

    const byStaff = new Map<string, Ping[]>()
    for (const p of pings) {
      if (!p.staff_id) continue
      if (orgFilter && p.organization_id !== orgFilter) continue
      const arr = byStaff.get(p.staff_id) ?? []
      arr.push(p)
      byStaff.set(p.staff_id, arr)
    }
    report.staff = byStaff.size

    // Per-staff isolation: a single staff failure must NOT abort the whole run.
    for (const [staffId, sp] of byStaff) {
      try {
        await processStaff(supabase, staffId, sp, targets, report)
      } catch (e: any) {
        report.errors.push(`staff ${staffId}: ${e?.message ?? e}`)
      }
    }

    if (action === 'cron' && !dryRun) {
      // Fail-safe: only advance the cursor when the whole run succeeded
      // (no per-staff errors). Otherwise the next cron picks up the same
      // window again — duplicates are blocked by per-row idempotency.
      if (report.errors.length === 0) {
        try {
          const maxIso = pings[pings.length - 1].recorded_at
          await saveCursor(supabase, maxIso, orgFilter)
          console.log(`[auto-start] cron cursor AFTER  org=${orgFilter ?? 'global'}: ${maxIso}`)
        } catch (e: any) {
          report.errors.push(`cursor save: ${e?.message ?? e}`)
        }
      } else {
        console.warn(`[auto-start] cron cursor NOT advanced — ${report.errors.length} error(s); will retry next run`)
      }
    }

    if (dryRun) {
      // Persist a dry-run row for audit/visibility
      try {
        await supabase.from('location_auto_start_runs').insert({
          id: runId,
          engine_version: ENGINE_VERSION,
          mode: action,
          dry_run: true,
          source_tag: report.source_tag,
          organization_id: orgFilter,
          staff_id: staffFilter,
          date_filter: dateFilter,
          from_iso: fromIso,
          to_iso: toIso,
          finished_at: new Date().toISOString(),
          status: report.errors.length ? 'error' : 'ok',
          staff_count: report.staff,
          pings_processed: report.pings,
          arrivals: report.arrivals,
          switches: report.switches,
          created_workdays: report.workdays_opened,
          opened_ltes: report.ltes_opened,
          closed_ltes: report.ltes_closed,
          created_travel_logs: report.travels_created,
          created_assistant_events: report.events_emitted,
          skipped_existing: report.skipped_existing,
          errors: report.errors,
          request_body: body ?? null,
          plan: report.plan,
        })
      } catch (e: any) {
        report.errors.push(`run-log dry insert: ${e?.message ?? e}`)
      }
    } else {
      await finalize(report.errors.length ? 'error' : 'ok')
    }

    return report
  } catch (e: any) {
    report.errors.push(`fatal: ${e?.message ?? e}`)
    await finalize('error')
    throw e
  }
}
