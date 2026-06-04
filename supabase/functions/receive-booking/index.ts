// @ts-nocheck
/**
 * receive-booking — Durable intake layer for Planning system.
 *
 * Responsibilities (and ONLY these):
 *   1. Validate API key
 *   2. Validate required fields (booking_id, organization_id)
 *   3. Validate event_type / payload shape
 *   4. Insert a persistent sync job into booking_sync_jobs
 *   5. Return clear success/failure response
 *
 * This function MUST NOT contain any Planning business logic.
 * It does NOT call import-bookings directly (no fire-and-forget).
 * The process-sync-jobs worker picks up pending jobs reliably.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const VALID_EVENT_TYPES = [
  'booking.confirmed',
  'booking.updated',
  'booking.cancelled',
  'booking.offer',
  'booking.created',
] as const

serve(async (req) => {
  const startTime = Date.now()

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // ── 1. Validate API key ──────────────────────────────────────────────
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')

    if (!webhookSecret || apiKey !== webhookSecret) {
      console.error('[receive-booking] unauthorized attempt')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 2. Parse and validate payload ────────────────────────────────────
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { booking_id, event_type, organization_id } = body as {
      booking_id?: string
      event_type?: string
      organization_id?: string
    }

    // ── 3. Validate required fields ──────────────────────────────────────
    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: organization_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: booking_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 4. Warn on unknown event_type ────────────────────────────────────
    if (event_type && !VALID_EVENT_TYPES.includes(event_type as any)) {
      console.warn(`[receive-booking] Unknown event_type="${event_type}" for booking=${booking_id}`)
    }

    // ── 5. Insert persistent sync job (with coalescing) ─────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Normalize event_type so legacy "booking_updated" and new
    // "booking.updated" coalesce into the same logical bucket.
    const normalizedEventType =
      (event_type || 'unknown').replace(/_/g, '.').toLowerCase()

    // Coalesce webhook bursts:
    //   - If an unfinished job already exists for this booking+org, reuse it.
    //
    // NOTE: We deliberately do NOT suppress webhooks that arrive shortly
    // after a recently completed job. The previous "cooldown" branch caused
    // silent data loss: a webhook fired right after we finished a sync was
    // dropped, and since no new pending job was enqueued the worker never
    // ran another incremental sync — the change stayed invisible until the
    // next unrelated webhook happened to arrive after the cooldown window.
    // Burst coalescing is already handled by the unfinished-job branch
    // below, which is the safe place to deduplicate.
    const { data: existingJobs, error: lookupError } = await supabase
      .from('booking_sync_jobs')
      .select('id, status, received_at, processed_at')
      .eq('booking_id', booking_id)
      .eq('organization_id', organization_id)
      .order('received_at', { ascending: false })
      .limit(5)

    if (lookupError) {
      console.warn('[receive-booking] Lookup failed, proceeding with insert', lookupError.message)
    }

    const unfinished = (existingJobs || []).find(
      (j: any) => j.status === 'pending' || j.status === 'processing'
    )
    if (unfinished) {
      console.log('[receive-booking] Coalesced into existing unfinished job', JSON.stringify({
        existing_job_id: unfinished.id,
        booking_id,
        organization_id,
        event_type: normalizedEventType,
        duration_ms: Date.now() - startTime,
      }))
      return new Response(
        JSON.stringify({
          success: true,
          accepted: true,
          coalesced: true,
          job_id: unfinished.id,
          booking_id,
          event_type: normalizedEventType,
          status: unfinished.status,
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const recentlyCompleted = (existingJobs || []).find(
      (j: any) =>
        j.status === 'completed' &&
        j.processed_at &&
        j.processed_at > cooldownIso
    )
    if (recentlyCompleted) {
      console.log('[receive-booking] Suppressed (cooldown after recent completion)', JSON.stringify({
        last_job_id: recentlyCompleted.id,
        booking_id,
        organization_id,
        event_type: normalizedEventType,
        cooldown_ms: COOLDOWN_MS,
        duration_ms: Date.now() - startTime,
      }))
      return new Response(
        JSON.stringify({
          success: true,
          accepted: true,
          coalesced: true,
          suppressed_by_cooldown: true,
          last_job_id: recentlyCompleted.id,
          booking_id,
          event_type: normalizedEventType,
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: job, error: insertError } = await supabase
      .from('booking_sync_jobs')
      .insert({
        booking_id,
        organization_id,
        event_type: normalizedEventType,
        status: 'pending',
      })
      .select('id, status, received_at')
      .single()

    if (insertError) {
      console.error('[receive-booking] Failed to create sync job', JSON.stringify({
        booking_id, organization_id, error: insertError.message,
      }))
      return new Response(
        JSON.stringify({ error: 'Failed to queue sync job', detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 6. Respond with 202 — job accepted ───────────────────────────────
    console.log('[receive-booking] Job created', JSON.stringify({
      job_id: job.id,
      booking_id,
      organization_id,
      event_type: normalizedEventType,
      duration_ms: Date.now() - startTime,
    }))

    return new Response(
      JSON.stringify({
        success: true,
        accepted: true,
        job_id: job.id,
        booking_id,
        event_type: normalizedEventType,
        status: 'pending',
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[receive-booking] Unhandled error', error.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
