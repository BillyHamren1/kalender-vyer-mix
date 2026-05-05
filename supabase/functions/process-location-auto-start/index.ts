// @ts-nocheck
// ============================================================================
// process-location-auto-start
// ----------------------------------------------------------------------------
// Server-side auto-start engine.
//
// Reads the latest unprocessed `staff_location_history` pings, groups them
// per staff, matches them against today's work-relevant targets
// (organization_locations, bookings, large_projects), runs the same stable
// entry rules used in the foreground, and — if a stable arrival is found:
//   * opens a workday (if none open) anchored to the first reliable arrival
//   * opens a location_time_entries row (LTE) for that target
//   * emits an `arrival` assistant_event with resolution_status='auto_started'
//
// Idempotency:
//   * `location_auto_start_cursor.global` advances to the max(recorded_at)
//     processed in this run, so the same ping is never replayed.
//   * `assistant_events.dedupe_key` (UNIQUE) blocks duplicate arrivals per
//     staff/target/5-min bucket.
//   * Partial unique indexes on LTE / workdays block double opens.
//
// Schedule: invoke every 1–2 minutes via pg_cron. Safe to run concurrently
// thanks to the unique-key constraints; only one will win.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import {
  haversine,
  isInsideGeofence,
  type GeofenceTarget,
} from '../_shared/geofenceEval.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Tuning constants (mirror src/lib/geofence/stableEntry.ts) ───────────────
const ENTRY_PING_MIN_COUNT = 3
const ENTRY_PING_MIN_DWELL_MS = 2 * 60 * 1000
const ENTRY_PING_MAX_ACCURACY_M = 75
const PROCESS_LOOKBACK_MS = 60 * 60 * 1000           // safety cap if cursor lost
const PROCESS_OVERLAP_MS = 5 * 60 * 1000             // re-scan last 5 min
const TARGET_DAY_TOLERANCE_MS = 24 * 60 * 60 * 1000  // bookings/projects within 1d window

interface Ping {
  id: string
  staff_id: string
  organization_id: string
  lat: number
  lng: number
  accuracy: number | null
  recorded_at: string
  ts: number
}

interface Target {
  kind: 'location' | 'booking' | 'project'
  id: string                 // text id for bookings, uuid for the rest
  organization_id: string
  label: string
  geofence: GeofenceTarget
}

function bucketTo5Min(iso: string): string {
  return String(Math.floor(new Date(iso).getTime() / (5 * 60_000)))
}

function dedupeKey(staffId: string, targetKind: string, targetId: string, happenedAt: string) {
  // arrival events
  return `${staffId}:arrival:${targetKind}:${targetId}:${bucketTo5Min(happenedAt)}`
}

async function loadCursor(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('location_auto_start_cursor')
    .select('last_processed_recorded_at')
    .eq('id', 'global')
    .maybeSingle()
  const fallback = new Date(Date.now() - PROCESS_LOOKBACK_MS).toISOString()
  return data?.last_processed_recorded_at ?? fallback
}

async function saveCursor(supabase: any, iso: string) {
  await supabase
    .from('location_auto_start_cursor')
    .upsert({ id: 'global', last_processed_recorded_at: iso, updated_at: new Date().toISOString() })
}

async function loadTargets(supabase: any): Promise<Target[]> {
  const todayIso = new Date().toISOString().slice(0, 10)
  const yesterdayIso = new Date(Date.now() - TARGET_DAY_TOLERANCE_MS).toISOString().slice(0, 10)
  const tomorrowIso = new Date(Date.now() + TARGET_DAY_TOLERANCE_MS).toISOString().slice(0, 10)

  const out: Target[] = []

  // 1. Organization locations (Lager etc.) — always relevant.
  const { data: locs } = await supabase
    .from('organization_locations')
    .select('id, organization_id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon, is_active')
    .eq('is_active', true)
  for (const l of locs ?? []) {
    if (l.latitude == null || l.longitude == null) continue
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
    })
  }

  // 2. Bookings active around today (any of rig/event/rigdown date in [-1d, +1d]).
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, organization_id, client, delivery_latitude, delivery_longitude, rigdaydate, eventdate, rigdowndate, large_project_id')
    .or(
      `rigdaydate.gte.${yesterdayIso},eventdate.gte.${yesterdayIso},rigdowndate.gte.${yesterdayIso}`
    )
    .or(
      `rigdaydate.lte.${tomorrowIso},eventdate.lte.${tomorrowIso},rigdowndate.lte.${tomorrowIso}`
    )
    .not('delivery_latitude', 'is', null)
    .not('delivery_longitude', 'is', null)
    .limit(500)

  for (const b of bookings ?? []) {
    if (b.large_project_id) continue // large project handled below
    out.push({
      kind: 'booking',
      id: b.id,
      organization_id: b.organization_id,
      label: b.client ?? 'Bokning',
      geofence: {
        latitude: Number(b.delivery_latitude),
        longitude: Number(b.delivery_longitude),
        radius_meters: 100,
        geofence_mode: 'circle',
      },
    })
  }

  // 3. Large projects with coordinates.
  const { data: projects } = await supabase
    .from('large_projects')
    .select('id, organization_id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon')
    .not('address_latitude', 'is', null)
    .not('address_longitude', 'is', null)
    .limit(500)
  for (const p of projects ?? []) {
    out.push({
      kind: 'project',
      id: p.id,
      organization_id: p.organization_id,
      label: p.name ?? 'Projekt',
      geofence: {
        latitude: Number(p.address_latitude),
        longitude: Number(p.address_longitude),
        radius_meters: Number(p.address_radius_meters || 100),
        geofence_mode: p.address_geofence_mode ?? 'circle',
        geofence_polygon: p.address_geofence_polygon ?? null,
      },
    })
  }

  return out
}

interface StableHit {
  target: Target
  pings: Ping[]
  firstReliableTs: number
  dwellMs: number
  avgAccuracy: number
  confidence: 'low' | 'medium' | 'high'
}

function evaluateStable(target: Target, pings: Ping[]): StableHit | null {
  const inside = pings.filter(p => isInsideGeofence(p.lat, p.lng, target.geofence))
  if (inside.length === 0) return null
  const dwell = inside[inside.length - 1].ts - inside[0].ts
  const enoughCount = inside.length >= ENTRY_PING_MIN_COUNT
  const enoughDwell = dwell >= ENTRY_PING_MIN_DWELL_MS
  if (!enoughCount && !enoughDwell) return null
  const goodAcc = inside.filter(p => p.accuracy == null || p.accuracy <= ENTRY_PING_MAX_ACCURACY_M)
  if (goodAcc.length * 2 < inside.length) return null
  const firstReliable = goodAcc[0] ?? inside[0]
  const accSum = inside.reduce((s, p) => s + (p.accuracy ?? 0), 0)
  const avgAcc = accSum / inside.length
  const confidence: 'low' | 'medium' | 'high' =
    inside.length >= 5 && dwell >= 4 * 60_000 ? 'high' :
    inside.length >= 3 && dwell >= 2 * 60_000 ? 'medium' : 'low'
  return {
    target,
    pings: inside,
    firstReliableTs: firstReliable.ts,
    dwellMs: dwell,
    avgAccuracy: avgAcc,
    confidence,
  }
}

function pickBestHit(target: Target, pings: Ping[]): StableHit | null {
  return evaluateStable(target, pings)
}

interface ProcessReport {
  staff: number
  pings: number
  arrivals: number
  workdays_opened: number
  ltes_opened: number
  events_emitted: number
  skipped_existing: number
  errors: string[]
}

async function processStaff(
  supabase: any,
  staffId: string,
  pings: Ping[],
  targets: Target[],
  report: ProcessReport,
) {
  // Pick the target with the longest stable window for this staff.
  let best: StableHit | null = null
  for (const t of targets) {
    if (t.organization_id !== pings[0].organization_id) continue
    const hit = pickBestHit(t, pings)
    if (!hit) continue
    if (!best || hit.dwellMs > best.dwellMs || hit.pings.length > best.pings.length) {
      best = hit
    }
  }
  if (!best) return

  report.arrivals++
  const arrivalIso = new Date(best.firstReliableTs).toISOString()
  const orgId = best.target.organization_id

  // ── 1. Workday: open if no open one. Idempotent via partial unique index.
  let workdayId: string | null = null
  const { data: existingWorkday } = await supabase
    .from('workdays')
    .select('id')
    .eq('staff_id', staffId)
    .is('ended_at', null)
    .maybeSingle()

  if (existingWorkday?.id) {
    workdayId = existingWorkday.id
    report.skipped_existing++
  } else {
    const { data: wd, error: wdErr } = await supabase
      .from('workdays')
      .insert({
        staff_id: staffId,
        organization_id: orgId,
        started_at: arrivalIso,
        started_by: 'server_auto_start',
        notes: `Auto-started from GPS arrival at ${best.target.label}`,
        metadata: {
          auto_started: true,
          auto_start_source: 'server_background_gps',
          matched_target: { kind: best.target.kind, id: best.target.id, label: best.target.label },
          confidence: best.confidence,
          arrival_pings_count: best.pings.length,
          first_arrival_ping_at: arrivalIso,
          dwell_ms: best.dwellMs,
          avg_accuracy_m: best.avgAccuracy,
        },
      })
      .select('id')
      .maybeSingle()
    if (wdErr) {
      // Race with another runner / a concurrent foreground start: treat as soft success.
      if (String(wdErr.code) !== '23505') {
        report.errors.push(`workday insert: ${wdErr.message}`)
      }
      const { data: again } = await supabase
        .from('workdays')
        .select('id').eq('staff_id', staffId).is('ended_at', null).maybeSingle()
      workdayId = again?.id ?? null
    } else {
      workdayId = wd?.id ?? null
      report.workdays_opened++
    }
  }

  // ── 2. LTE: open one for this target if none open for that target.
  const lteFilter = supabase.from('location_time_entries')
    .select('id')
    .eq('staff_id', staffId)
    .is('exited_at', null)
  let openLteQuery
  if (best.target.kind === 'location') {
    openLteQuery = lteFilter.eq('location_id', best.target.id)
  } else if (best.target.kind === 'booking') {
    openLteQuery = lteFilter.eq('booking_id', best.target.id)
  } else {
    openLteQuery = lteFilter.eq('large_project_id', best.target.id)
  }
  const { data: openLte } = await openLteQuery.maybeSingle()

  let lteId: string | null = openLte?.id ?? null
  if (!lteId) {
    const payload: Record<string, any> = {
      organization_id: orgId,
      staff_id: staffId,
      entry_date: arrivalIso.slice(0, 10),
      entered_at: arrivalIso,
      source: 'auto_geofence_server',
      client_dedupe_key: `srv:${staffId}:${best.target.kind}:${best.target.id}:${bucketTo5Min(arrivalIso)}`,
      metadata: {
        auto_started: true,
        auto_start_source: 'server_background_gps',
        matched_target: { kind: best.target.kind, id: best.target.id, label: best.target.label },
        confidence: best.confidence,
        arrival_pings_count: best.pings.length,
        first_arrival_ping_at: arrivalIso,
        ping_ids: best.pings.map(p => p.id),
        ping_range: {
          first: new Date(best.pings[0].ts).toISOString(),
          last: new Date(best.pings[best.pings.length - 1].ts).toISOString(),
        },
        radius_m: best.target.geofence.radius_meters,
        avg_accuracy_m: best.avgAccuracy,
        dwell_ms: best.dwellMs,
      },
    }
    if (best.target.kind === 'location') payload.location_id = best.target.id
    else if (best.target.kind === 'booking') payload.booking_id = best.target.id
    else payload.large_project_id = best.target.id

    const { data: lte, error: lteErr } = await supabase
      .from('location_time_entries')
      .insert(payload)
      .select('id')
      .maybeSingle()
    if (lteErr) {
      if (String(lteErr.code) !== '23505') {
        report.errors.push(`lte insert: ${lteErr.message}`)
      }
    } else {
      lteId = lte?.id ?? null
      report.ltes_opened++
    }
  } else {
    report.skipped_existing++
  }

  // ── 3. assistant_event arrival (auto_started). Idempotent via dedupe_key.
  const targetTypeForEvent = best.target.kind // 'location' | 'project' | 'booking'
  const dk = dedupeKey(staffId, targetTypeForEvent, best.target.id, arrivalIso)
  const { error: evErr } = await supabase
    .from('assistant_events')
    .insert({
      organization_id: orgId,
      staff_id: staffId,
      event_type: 'arrival',
      target_type: targetTypeForEvent,
      target_id: best.target.id,
      target_label: best.target.label,
      happened_at: arrivalIso,
      source: 'geofence_background',
      suggested_action: 'start_activity',
      resolution_status: 'auto_closed_by_later_action',  // closest existing enum for "auto_started"
      resolution_notes: 'auto_started by server_background_gps',
      resolved_at: new Date().toISOString(),
      resolved_by: 'server_auto_start',
      stale_for_prompt: true,
      still_relevant_for_review: true,
      linked_workday_id: workdayId,
      linked_time_report_id: null,
      dedupe_key: dk,
      metadata: {
        auto_started: true,
        auto_start_source: 'server_background_gps',
        matched_target: { kind: best.target.kind, id: best.target.id, label: best.target.label },
        confidence: best.confidence,
        arrival_pings_count: best.pings.length,
        first_arrival_ping_at: arrivalIso,
        linked_lte_id: lteId,
      },
    })
  if (evErr && String(evErr.code) !== '23505') {
    report.errors.push(`assistant_event insert: ${evErr.message}`)
  }
  report.events_emitted++
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const report: ProcessReport = {
    staff: 0, pings: 0, arrivals: 0,
    workdays_opened: 0, ltes_opened: 0,
    events_emitted: 0, skipped_existing: 0, errors: [],
  }

  try {
    const cursorIso = await loadCursor(supabase)
    const fromIso = new Date(Math.min(
      Date.now() - PROCESS_OVERLAP_MS,
      new Date(cursorIso).getTime() - PROCESS_OVERLAP_MS,
    )).toISOString()

    const { data: rawPings, error: pingErr } = await supabase
      .from('staff_location_history')
      .select('id, staff_id, organization_id, lat, lng, accuracy, recorded_at')
      .gte('recorded_at', fromIso)
      .order('recorded_at', { ascending: true })
      .limit(5000)

    if (pingErr) throw pingErr

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
      return new Response(JSON.stringify({ ok: true, report }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const targets = await loadTargets(supabase)

    // Group per staff.
    const byStaff = new Map<string, Ping[]>()
    for (const p of pings) {
      if (!p.staff_id) continue
      const arr = byStaff.get(p.staff_id) ?? []
      arr.push(p)
      byStaff.set(p.staff_id, arr)
    }
    report.staff = byStaff.size

    for (const [staffId, sp] of byStaff) {
      try {
        await processStaff(supabase, staffId, sp, targets, report)
      } catch (e: any) {
        report.errors.push(`staff ${staffId}: ${e?.message ?? e}`)
      }
    }

    const maxIso = pings[pings.length - 1].recorded_at
    await saveCursor(supabase, maxIso)

    return new Response(JSON.stringify({ ok: true, report }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[process-location-auto-start] fatal', e)
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e), report }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
