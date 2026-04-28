// @ts-nocheck
/**
 * process-sync-jobs — Durable worker for booking sync queue.
 *
 * Called by pg_cron every minute. Uses claim_sync_jobs() RPC for atomic
 * job claiming with FOR UPDATE SKIP LOCKED — no two workers can grab
 * the same job concurrently.
 *
 * Retry logic: jobs are retried up to max_attempts (default 3).
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

  // ── 1. Atomically claim jobs (SELECT FOR UPDATE SKIP LOCKED) ────────
  const { data: claimedJobs, error: claimError } = await supabase
    .rpc('claim_sync_jobs', { batch_limit: BATCH_SIZE })

  if (claimError) {
    console.error('[process-sync-jobs] Failed to claim jobs', claimError.message)
    return new Response(
      JSON.stringify({ error: 'Failed to claim jobs' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!claimedJobs || claimedJobs.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: 'No pending jobs' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[process-sync-jobs] Claimed ${claimedJobs.length} jobs`)

  const results: Array<{ job_id: string; booking_id: string; status: string; error?: string }> = []

  for (const job of claimedJobs) {
    try {
      // ── 2. Call import-bookings ──────────────────────────────────────────
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

      // ── 3. Mark completed ────────────────────────────────────────────────
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
      // ── 4. Mark failed with error ────────────────────────────────────────
      const isFinal = job.attempts >= job.max_attempts

      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'failed',
          error_message: err.message?.substring(0, 1000),
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      console.error(`[process-sync-jobs] Job ${job.id} failed (attempt ${job.attempts}/${job.max_attempts}${isFinal ? ' FINAL' : ''})`, err.message)
      results.push({ job_id: job.id, booking_id: job.booking_id, status: 'failed', error: err.message })
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})