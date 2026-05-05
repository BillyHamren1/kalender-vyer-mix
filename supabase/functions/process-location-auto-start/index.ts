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
  pings: Ping[]            // contiguous inside-pings for this segment
  firstReliableTs: number  // arrival
  lastInsideTs: number     // departure (last inside ping)
  dwellMs: number
  avgAccuracy: number
  confidence: 'low' | 'medium' | 'high'
}

/**
 * Evaluate ALL stable visit segments to a target within the ping window.
 * Each segment is a contiguous run of inside-pings separated from the next
 * by a gap > 10 min. Each segment that meets the stable-entry rule becomes
 * its own hit, so back-and-forth movement produces multiple hits.
 */
function evaluateStableSegments(target: Target, pings: Ping[]): StableHit[] {
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

interface ProcessReport {
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

function planPush(report: ProcessReport, entry: Record<string, any>) {
  if (report.dry_run) report.plan.push(entry)
}

function targetMatchesLte(target: Target, lte: any): boolean {
  if (target.kind === 'location') return lte.location_id === target.id
  if (target.kind === 'booking') return lte.booking_id === target.id
  return lte.large_project_id === target.id
}

async function emitAssistantEvent(supabase: any, payload: Record<string, any>, dk: string, report: ProcessReport, kind: string) {
  const { error } = await supabase
    .from('assistant_events')
    .insert({ ...payload, dedupe_key: dk })
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
): Promise<{ closed: boolean; closedTargetKind: string | null; closedTargetId: string | null; lteId: string | null }> {
  const { data: openLtes } = await supabase
    .from('location_time_entries')
    .select('id, location_id, booking_id, large_project_id, entered_at, source, metadata')
    .eq('staff_id', staffId)
    .is('exited_at', null)
  if (!openLtes || openLtes.length === 0) return { closed: false, closedTargetKind: null, closedTargetId: null, lteId: null }

  // Close the LTE matching the previous target (or any open one if no match).
  const prevMatch = openLtes.find((l: any) => targetMatchesLte(prevHit.target, l)) ?? null
  if (!prevMatch) return { closed: false, closedTargetKind: null, closedTargetId: null, lteId: null }

  const enteredAt = new Date(prevMatch.entered_at).getTime()
  const departureTs = new Date(departureIso).getTime()
  if (departureTs <= enteredAt) {
    return { closed: false, closedTargetKind: null, closedTargetId: null, lteId: null }
  }
  const totalMinutes = Math.max(1, Math.round((departureTs - enteredAt) / 60000))
  const meta = (prevMatch.metadata && typeof prevMatch.metadata === 'object') ? prevMatch.metadata : {}
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
          ping_range_prev: {
            first: new Date(prevHit.pings[0].ts).toISOString(),
            last: new Date(prevHit.pings[prevHit.pings.length - 1].ts).toISOString(),
          },
        },
      },
    })
    .eq('id', prevMatch.id)
    .is('exited_at', null)
  if (error) {
    report.errors.push(`lte close: ${error.message}`)
    return { closed: false, closedTargetKind: null, closedTargetId: null, lteId: null }
  }
  report.ltes_closed++
  return {
    closed: true,
    closedTargetKind: prevHit.target.kind,
    closedTargetId: prevHit.target.id,
    lteId: prevMatch.id,
  }
}

async function ensureLteOpenForTarget(
  supabase: any, staffId: string, orgId: string, arrivalIso: string,
  hit: StableHit, report: ProcessReport,
): Promise<string | null> {
  // Already open for this target?
  const baseQ = supabase.from('location_time_entries')
    .select('id').eq('staff_id', staffId).is('exited_at', null)
  const q = hit.target.kind === 'location' ? baseQ.eq('location_id', hit.target.id)
    : hit.target.kind === 'booking' ? baseQ.eq('booking_id', hit.target.id)
    : baseQ.eq('large_project_id', hit.target.id)
  const { data: open } = await q.maybeSingle()
  if (open?.id) { report.skipped_existing++; return open.id }

  // Engine guard: don't recreate if a previously-closed LTE exists for the
  // SAME target within ±10 min of this arrival window. Prevents the same
  // arrival from producing two rows even if a foreground client closed one
  // moments ago. Per-target unique partial index handles open-row racing.
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
    source: 'auto_geofence_server',
    client_dedupe_key: `srv:${staffId}:${hit.target.kind}:${hit.target.id}:${bucketTo5Min(arrivalIso)}`,
    metadata: {
      auto_started: true,
      auto_start_source: 'server_background_gps',
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
  if (dur < 60_000 || dur > 8 * 3600_000) return // <1 min or >8h: skip

  // Idempotency check: existing auto-switch travel for this exact range/staff.
  const { data: existing } = await supabase
    .from('travel_time_logs')
    .select('id')
    .eq('staff_id', staffId)
    .eq('source', 'geofence_auto_switch_server')
    .eq('start_time', departureIso)
    .eq('end_time', arrivalIso)
    .maybeSingle()
  if (existing?.id) return

  const { error } = await supabase.from('travel_time_logs').insert({
    staff_id: staffId,
    organization_id: orgId,
    report_date: arrivalIso.slice(0, 10),
    start_time: departureIso,
    end_time: arrivalIso,
    hours_worked: Math.round((dur / 3600_000) * 100) / 100,
    auto_detected: true,
    source: 'geofence_auto_switch_server',
    classification: 'needs_review',
    needs_review: true,
    previous_target_type: prevHit.target.kind,
    previous_target_id: prevHit.target.id,
    next_target_type: nextHit.target.kind,
    next_target_id: nextHit.target.id,
    description: `Auto-switch ${prevHit.target.label} → ${nextHit.target.label}`,
  })
  if (error) {
    report.errors.push(`travel insert: ${error.message}`)
  } else {
    report.travels_created++
  }
}

async function processStaff(
  supabase: any,
  staffId: string,
  pings: Ping[],
  targets: Target[],
  report: ProcessReport,
) {
  const orgId = pings[0].organization_id

  // Collect all stable visit segments across all targets and order them.
  const allHits: StableHit[] = []
  for (const t of targets) {
    if (t.organization_id !== orgId) continue
    for (const h of evaluateStableSegments(t, pings)) allHits.push(h)
  }
  if (allHits.length === 0) return

  allHits.sort((a, b) => a.firstReliableTs - b.firstReliableTs)

  // Dedupe overlapping consecutive segments on same target.
  const ordered: StableHit[] = []
  for (const h of allHits) {
    const last = ordered[ordered.length - 1]
    if (last && last.target.kind === h.target.kind && last.target.id === h.target.id
        && h.firstReliableTs <= last.lastInsideTs + 10 * 60_000) {
      // merge: extend last segment
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

    // Open workday on first hit (idempotent).
    if (!workdayId) {
      workdayId = await ensureWorkdayOpen(supabase, staffId, orgId, arrivalIso, hit, report)
    }

    // ── Switch handling ────────────────────────────────────────────────────
    if (prevHit && (prevHit.target.kind !== hit.target.kind || prevHit.target.id !== hit.target.id)) {
      // Departure ts = last inside ping of prev segment, but never after this arrival.
      const departureTs = Math.min(prevHit.lastInsideTs, hit.firstReliableTs)
      const departureIso = new Date(departureTs).toISOString()
      report.switches++

      // 1. Close open LTE on previous target (if any).
      await closeOpenLteForSwitch(supabase, staffId, departureIso, prevHit, hit, report)

      // 2. Departure assistant_event for prev target.
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
          ping_range: {
            prev_first: new Date(prevHit.pings[0].ts).toISOString(),
            prev_last: new Date(prevHit.lastInsideTs).toISOString(),
            next_first: new Date(hit.pings[0].ts).toISOString(),
            next_last: new Date(hit.lastInsideTs).toISOString(),
          },
          confidence: hit.confidence,
        },
      }, depDk, report, 'departure')

      // 3. Travel log between departure and arrival.
      await ensureTravelLog(supabase, staffId, orgId, prevHit, hit, departureIso, arrivalIso, report)
    }

    // ── Open LTE for current target ──────────────────────────────────────
    const lteId = await ensureLteOpenForTarget(supabase, staffId, orgId, arrivalIso, hit, report)

    // ── Arrival assistant_event ──────────────────────────────────────────
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
        previous_target: prevHit ? { kind: prevHit.target.kind, id: prevHit.target.id, label: prevHit.target.label } : null,
        next_target: { kind: hit.target.kind, id: hit.target.id, label: hit.target.label },
        departure_at: prevHit ? new Date(Math.min(prevHit.lastInsideTs, hit.firstReliableTs)).toISOString() : null,
        arrival_at: arrivalIso,
        confidence: hit.confidence,
        arrival_pings_count: hit.pings.length,
        first_arrival_ping_at: arrivalIso,
        ping_range: {
          first: new Date(hit.pings[0].ts).toISOString(),
          last: new Date(hit.lastInsideTs).toISOString(),
        },
        linked_lte_id: lteId,
      },
    }, arrDk, report, isSwitch ? 'arrival(switch)' : 'arrival')

    prevHit = hit
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const report: ProcessReport = {
    staff: 0, pings: 0, arrivals: 0, switches: 0,
    workdays_opened: 0, ltes_opened: 0, ltes_closed: 0,
    travels_created: 0, events_emitted: 0, skipped_existing: 0, errors: [],
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
