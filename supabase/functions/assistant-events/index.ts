// ============================================================================
// assistant-events — Edge function för den nya assistenthändelsemodellen
// ============================================================================
// Steg 1 av fasad rollout. Kör PARALLELLT med arrival_prompt_log-vägen i
// mobile-app-api. Den här funktionen är den enda läs/skriv-vägen för
// `assistant_events`-tabellen.
//
// Actions:
//   list_pending      → events som ska visas i prompt-kön (resolution_status='pending', stale_for_prompt=false)
//   list_review       → events som fortfarande är relevanta för dagsavstämning (still_relevant_for_review=true)
//   create_event      → registrera arrival/departure/home_arrival från klient (geofence)
//   resolve_event     → markera ett event löst (med specifik resolution_type)
//   mark_stale        → flagga som stale_for_prompt utan att försvinna (cron/explicit)
//
// Auth: samma 30d-rullande token som mobile-app-api. Body innehåller `staff_id`-
// matchning säkras av RLS + verifierad token.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TOKEN_SECRET = Deno.env.get('STAFF_SECRET_KEY') || 'default-secret-key'

function verifyToken(token: string): { valid: boolean; staffId?: string } {
  try {
    const payload = JSON.parse(atob(token))
    if (!payload.staffId || !payload.expiresAt) return { valid: false }
    if (Date.now() > payload.expiresAt) return { valid: false }
    return { valid: true, staffId: payload.staffId }
  } catch {
    return { valid: false }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
const VALID_EVENT_TYPES = ['arrival', 'departure', 'home_arrival', 'travel_edge'] as const
const VALID_TARGET_TYPES = ['location', 'project', 'booking', 'home', 'unknown'] as const
const VALID_SUGGESTED_ACTIONS = [
  'start_workday', 'start_activity', 'end_activity', 'end_workday', 'register_travel', 'review_only',
] as const
const VALID_RESOLUTIONS = [
  'pending',
  'applied_from_event_time',
  'applied_from_now',
  'applied_from_custom_time',
  'dismissed',
  'merged_into_other_event',
  'auto_closed_by_later_action',
  'ignored_stale',
] as const

function bucketTo5Min(iso: string): string {
  const t = new Date(iso).getTime()
  const bucket = Math.floor(t / (5 * 60_000))
  return String(bucket)
}

function buildDedupeKey(staffId: string, eventType: string, targetType: string, targetId: string | null, happenedAtIso: string): string {
  return `${staffId}:${eventType}:${targetType}:${targetId ?? 'null'}:${bucketTo5Min(happenedAtIso)}`
}

function defaultSuggestedAction(eventType: string, targetType: string): string {
  if (eventType === 'arrival') return 'start_activity'
  if (eventType === 'departure') return 'end_activity'
  if (eventType === 'home_arrival') return 'end_workday'
  if (eventType === 'travel_edge') return 'register_travel'
  return 'review_only'
}

// ── Action handlers ────────────────────────────────────────────────────────

async function handleListPending(supabase: any, staffId: string, organizationId: string) {
  // Promote stale events first so prompt-kön aldrig visar gammalt skräp.
  // still_relevant_for_review lämnas orört → review-listan ser dem fortfarande.
  await supabase.rpc('promote_stale_assistant_events').catch((e: any) => {
    console.warn('[assistant-events] promote_stale failed (non-fatal):', e?.message)
  })

  const { data, error } = await supabase
    .from('assistant_events')
    .select('*')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .eq('resolution_status', 'pending')
    .eq('stale_for_prompt', false)
    .order('happened_at', { ascending: true })
    .limit(20)

  if (error) {
    console.error('[assistant-events] list_pending error:', error)
    return new Response(JSON.stringify({ error: 'Failed to list pending events' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ events: data || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleListReview(supabase: any, staffId: string, organizationId: string, sinceIso?: string) {
  let q = supabase
    .from('assistant_events')
    .select('*')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .eq('still_relevant_for_review', true)
    .order('happened_at', { ascending: true })
    .limit(100)

  if (sinceIso) q = q.gte('happened_at', sinceIso)

  const { data, error } = await q
  if (error) {
    console.error('[assistant-events] list_review error:', error)
    return new Response(JSON.stringify({ error: 'Failed to list review events' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ events: data || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleCreateEvent(supabase: any, staffId: string, organizationId: string, data: any) {
  const eventType = data?.event_type
  const targetType = data?.target_type
  const targetId = data?.target_id ?? null
  const targetLabel = data?.target_label ?? null
  const targetAddress = data?.target_address ?? null
  const happenedAtRaw = data?.happened_at
  const source = data?.source ?? 'geofence_foreground'
  const suggestedAction = data?.suggested_action ?? defaultSuggestedAction(eventType, targetType)
  const metadata = data?.metadata ?? {}

  if (!VALID_EVENT_TYPES.includes(eventType)) {
    return new Response(JSON.stringify({ error: 'invalid event_type' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!VALID_TARGET_TYPES.includes(targetType)) {
    return new Response(JSON.stringify({ error: 'invalid target_type' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!VALID_SUGGESTED_ACTIONS.includes(suggestedAction)) {
    return new Response(JSON.stringify({ error: 'invalid suggested_action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // happened_at: validera (≤ now, ≥ now-24h). Default = now.
  let happenedAt = new Date().toISOString()
  if (happenedAtRaw) {
    const parsed = new Date(happenedAtRaw)
    const now = Date.now()
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= now && parsed.getTime() >= now - 24 * 3600 * 1000) {
      happenedAt = parsed.toISOString()
    }
  }

  const dedupeKey = buildDedupeKey(staffId, eventType, targetType, targetId, happenedAt)

  // Idempotent insert via UNIQUE INDEX (dedupe_key). Om kollision → returnera befintlig.
  const insertPayload = {
    organization_id: organizationId,
    staff_id: staffId,
    event_type: eventType,
    target_type: targetType,
    target_id: targetId,
    target_label: targetLabel,
    target_address: targetAddress,
    happened_at: happenedAt,
    source,
    suggested_action: suggestedAction,
    dedupe_key: dedupeKey,
    metadata,
  }

  const { data: inserted, error } = await supabase
    .from('assistant_events')
    .insert(insertPayload)
    .select('*')
    .maybeSingle()

  if (error) {
    // Dedupe-kollision → hämta befintlig
    if (String(error.code) === '23505' || String(error.message || '').includes('duplicate')) {
      const { data: existing } = await supabase
        .from('assistant_events')
        .select('*')
        .eq('dedupe_key', dedupeKey)
        .maybeSingle()
      return new Response(JSON.stringify({ event: existing, idempotent: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    console.error('[assistant-events] create_event error:', error)
    return new Response(JSON.stringify({ error: 'Failed to create event', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ event: inserted }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleResolveEvent(supabase: any, staffId: string, organizationId: string, data: any) {
  const eventId = data?.event_id
  const resolution = data?.resolution_status
  const resolutionNotes = data?.resolution_notes ?? null
  const linkedWorkdayId = data?.linked_workday_id ?? null
  const linkedTimeReportId = data?.linked_time_report_id ?? null
  const linkedTravelLogId = data?.linked_travel_log_id ?? null
  const mergedIntoEventId = data?.merged_into_event_id ?? null
  // När ett event resolveas är det normalt INTE längre relevant för review.
  // Klienten kan dock be att hålla det kvar (t.ex. dismissed med oklar status).
  const keepForReview = data?.keep_for_review === true

  if (!eventId) {
    return new Response(JSON.stringify({ error: 'event_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!VALID_RESOLUTIONS.includes(resolution) || resolution === 'pending') {
    return new Response(JSON.stringify({ error: 'invalid resolution_status' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const updatePayload: Record<string, any> = {
    resolution_status: resolution,
    resolution_notes: resolutionNotes,
    resolved_at: new Date().toISOString(),
    resolved_by: staffId,
    stale_for_prompt: true,                // resolved → ut ur prompt-kön
    still_relevant_for_review: keepForReview,
  }
  if (linkedWorkdayId) updatePayload.linked_workday_id = linkedWorkdayId
  if (linkedTimeReportId) updatePayload.linked_time_report_id = linkedTimeReportId
  if (linkedTravelLogId) updatePayload.linked_travel_log_id = linkedTravelLogId
  if (mergedIntoEventId) updatePayload.merged_into_event_id = mergedIntoEventId

  const { data: updated, error } = await supabase
    .from('assistant_events')
    .update(updatePayload)
    .eq('id', eventId)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[assistant-events] resolve_event error:', error)
    return new Response(JSON.stringify({ error: 'Failed to resolve event' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Event not found or not owned by staff' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ event: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleMarkStale(supabase: any, staffId: string, organizationId: string, data: any) {
  const eventId = data?.event_id
  if (!eventId) {
    return new Response(JSON.stringify({ error: 'event_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: updated, error } = await supabase
    .from('assistant_events')
    .update({
      stale_for_prompt: true,
      // VIKTIGT: still_relevant_for_review lämnas oförändrat — dagen ska
      // fortfarande kunna avstämas i Steg 2 även efter att prompten tystnat.
    })
    .eq('id', eventId)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[assistant-events] mark_stale error:', error)
    return new Response(JSON.stringify({ error: 'Failed to mark stale' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ event: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Entry ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const verified = verifyToken(token)
    if (!verified.valid || !verified.staffId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const staffId = verified.staffId

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Hämta organization_id för denna staff (mot staff_members)
    const { data: staffRow } = await supabase
      .from('staff_members')
      .select('organization_id')
      .eq('id', staffId)
      .maybeSingle()
    const organizationId = staffRow?.organization_id
    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'Staff has no organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json().catch(() => ({}))
    const action = body?.action as string
    const data = body?.data ?? {}

    switch (action) {
      case 'list_pending':   return await handleListPending(supabase, staffId, organizationId)
      case 'list_review':    return await handleListReview(supabase, staffId, organizationId, data?.since)
      case 'create_event':   return await handleCreateEvent(supabase, staffId, organizationId, data)
      case 'resolve_event':  return await handleResolveEvent(supabase, staffId, organizationId, data)
      case 'mark_stale':     return await handleMarkStale(supabase, staffId, organizationId, data)
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  } catch (err) {
    console.error('[assistant-events] unhandled error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
