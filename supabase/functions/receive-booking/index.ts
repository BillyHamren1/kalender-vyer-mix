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
import {
  bookingSyncPriority,
  normalizeBookingSyncEvent,
} from '../_shared/bookingSyncPriority.ts'

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

async function wakeSyncWorker(
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
): Promise<void> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/process-sync-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ trigger: 'critical_webhook', job_id: jobId }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn(
        `[receive-booking] critical worker wake failed status=${response.status} detail=${detail.substring(0, 300)}`,
      )
    }
  } catch (error) {
    // The durable queue remains authoritative; cron retries even if this
    // latency optimization fails.
    console.warn('[receive-booking] critical worker wake threw', error?.message ?? error)
  }
}
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
    const normalizedEventType = normalizeBookingSyncEvent(event_type)
    const priority = bookingSyncPriority(normalizedEventType)

    // One transactional RPC owns both coalescing and insertion. This removes
    // the SELECT -> INSERT race between webhooks and the incremental poller.
    // If a critical event meets an existing routine job, the existing job is
    // promoted instead of silently keeping its old event type and priority.
    const { data: enqueueRows, error: enqueueError } = await supabase.rpc(
      'enqueue_booking_sync_job',
      {
        p_booking_id: booking_id,
        p_organization_id: organization_id,
        p_event_type: normalizedEventType,
        p_priority: priority,
      },
    )

    const job = Array.isArray(enqueueRows) ? enqueueRows[0] : enqueueRows
    if (enqueueError || !job?.job_id) {
      console.error('[receive-booking] Failed to create sync job', JSON.stringify({
        booking_id,
        organization_id,
        error: enqueueError?.message ?? 'enqueue returned no job',
      }))
      return new Response(
        JSON.stringify({
          error: 'Failed to queue sync job',
          detail: enqueueError?.message ?? 'enqueue returned no job',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 6. Respond with 202 — job accepted ───────────────────────────────
    console.log('[receive-booking] Job accepted', JSON.stringify({
      job_id: job.job_id,
      booking_id,
      organization_id,
      event_type: job.job_event_type,
      priority: job.job_priority,
      coalesced: job.coalesced,
      duration_ms: Date.now() - startTime,
    }))

    if (job.job_priority === 100) {
      EdgeRuntime.waitUntil(wakeSyncWorker(supabaseUrl, serviceRoleKey, job.job_id))
    }

    return new Response(
      JSON.stringify({
        success: true,
        accepted: true,
        job_id: job.job_id,
        booking_id,
        event_type: job.job_event_type,
        priority: job.job_priority,
        coalesced: job.coalesced,
        status: job.job_status,
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
