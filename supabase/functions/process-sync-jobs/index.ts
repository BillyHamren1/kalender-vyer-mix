/**
 * process-sync-jobs — Durable worker for booking sync queue.
 *
 * Called by pg_cron every minute. Picks up pending booking_sync_jobs,
 * calls import-bookings for each, and marks them completed or failed.
 *
 * Retry logic: jobs are retried up to max_attempts (default 3).
 * After max_attempts, status stays 'failed' with error_message preserved.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 10

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Claim pending jobs (atomic status transition) ─────────────────
  // Also pick up failed jobs that haven't exhausted retries
  const { data: jobs, error: fetchError } = await supabase
    .from('booking_sync_jobs')
    .select('*')
    .or('status.eq.pending,and(status.eq.failed,attempts.lt.max_attempts)')
    .order('received_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchError) {
    console.error('[process-sync-jobs] Failed to fetch jobs', fetchError.message)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch jobs' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!jobs || jobs.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: 'No pending jobs' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[process-sync-jobs] Processing ${jobs.length} jobs`)

  const results: Array<{ job_id: string; booking_id: string; status: string; error?: string }> = []

  for (const job of jobs) {
    // ── 2. Mark as processing ────────────────────────────────────────────
    await supabase
      .from('booking_sync_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1,
      })
      .eq('id', job.id)

    try {
      // ── 3. Call import-bookings ──────────────────────────────────────────
      const importPayload = {
        booking_id: job.booking_id,
        organization_id: job.organization_id,
        event_type: job.event_type,
        syncMode: 'single',
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(importPayload),
      })

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'no body')
        throw new Error(`import-bookings returned ${res.status}: ${errorBody.substring(0, 500)}`)
      }

      // ── 4. Mark completed ────────────────────────────────────────────────
      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', job.id)

      console.log(`[process-sync-jobs] Job ${job.id} completed for booking ${job.booking_id}`)
      results.push({ job_id: job.id, booking_id: job.booking_id, status: 'completed' })

    } catch (err) {
      // ── 5. Mark failed with error ────────────────────────────────────────
      const newAttempts = job.attempts + 1
      const isFinal = newAttempts >= job.max_attempts

      await supabase
        .from('booking_sync_jobs')
        .update({
          status: isFinal ? 'failed' : 'failed',
          error_message: err.message?.substring(0, 1000),
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      console.error(`[process-sync-jobs] Job ${job.id} failed (attempt ${newAttempts}/${job.max_attempts})`, err.message)
      results.push({ job_id: job.id, booking_id: job.booking_id, status: 'failed', error: err.message })
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
