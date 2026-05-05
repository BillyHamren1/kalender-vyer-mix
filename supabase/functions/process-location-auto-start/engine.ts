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

export async function loadTargets(supabase: any): Promise<Target[]> {
  const yesterdayIso = new Date(Date.now() - TARGET_DAY_TOLERANCE_MS).toISOString().slice(0, 10)
  const tomorrowIso = new Date(Date.now() + TARGET_DAY_TOLERANCE_MS).toISOString().slice(0, 10)

  const out: Target[] = []

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

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, organization_id, client, delivery_latitude, delivery_longitude, rigdaydate, eventdate, rigdowndate, large_project_id')
    .or(`rigdaydate.gte.${yesterdayIso},eventdate.gte.${yesterdayIso},rigdowndate.gte.${yesterdayIso}`)
    .or(`rigdaydate.lte.${tomorrowIso},eventdate.lte.${tomorrowIso},rigdowndate.lte.${tomorrowIso}`)
    .not('delivery_latitude', 'is', null)
    .not('delivery_longitude', 'is', null)
    .limit(500)

  for (const b of bookings ?? []) {
    if (b.large_project_id) continue
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
    .from('workdays').select('id').eq('staff_id', staffId).is('ended_at', null).maybeSingle()
  if (existing?.id) {
    report.skipped_existing++
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
      total_minutes: totalMinutes,
      metadata: {
        ...meta,
        closed_by: 'server_auto_switch',
        closed_at_source: 'geofence_auto_switch_server',
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
    source: report.mode === 'backfill_day' ? 'auto_geofence_server_backfill' : 'auto_geofence_server',
    client_dedupe_key: `srv:${staffId}:${hit.target.kind}:${hit.target.id}:${bucketTo5Min(arrivalIso)}`,
    metadata: {
      auto_started: true,
      auto_start_source: report.source_tag,
      matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
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
    source: report.mode === 'backfill_day' ? 'geofence_auto_switch_server_backfill' : 'geofence_auto_switch_server',
    classification: 'needs_review',
    needs_review: true,
    previous_target_type: prevHit.target.kind,
    previous_target_id: prevHit.target.id,
    next_target_type: nextHit.target.kind,
    next_target_id: nextHit.target.id,
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

  report.arrivals += ordered.length

  let workdayId: string | null = null
  let prevHit: StableHit | null = null

  for (const hit of ordered) {
    const arrivalIso = new Date(hit.firstReliableTs).toISOString()

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
        matched_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
        confidence: hit.confidence,
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

  const report: ProcessReport = {
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

  if (action === 'backfill_day') {
    const date: string = String(body.date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('date (YYYY-MM-DD) required for backfill_day')
    }
    fromIso = new Date(`${date}T00:00:00.000Z`).toISOString()
    toIso = new Date(`${date}T23:59:59.999Z`).toISOString()
    staffFilter = body.staff_id || null
    orgFilter = body.organization_id || null
  } else {
    const cursorIso = await loadCursor(supabase)
    fromIso = new Date(Math.min(
      Date.now() - PROCESS_OVERLAP_MS,
      new Date(cursorIso).getTime() - PROCESS_OVERLAP_MS,
    )).toISOString()
    toIso = new Date().toISOString()
  }

  let q = supabase
    .from('staff_location_history')
    .select('id, staff_id, organization_id, lat, lng, accuracy, recorded_at')
    .gte('recorded_at', fromIso)
    .lte('recorded_at', toIso)
    .order('recorded_at', { ascending: true })
    .limit(action === 'backfill_day' ? 20000 : 5000)
  if (staffFilter) q = q.eq('staff_id', staffFilter)
  if (orgFilter) q = q.eq('organization_id', orgFilter)

  const { data: rawPings, error: pingErr } = await q
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

  if (pings.length === 0) return report

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

  for (const [staffId, sp] of byStaff) {
    try {
      await processStaff(supabase, staffId, sp, targets, report)
    } catch (e: any) {
      report.errors.push(`staff ${staffId}: ${e?.message ?? e}`)
    }
  }

  if (action === 'cron' && !dryRun) {
    const maxIso = pings[pings.length - 1].recorded_at
    await saveCursor(supabase, maxIso)
  }

  return report
}
