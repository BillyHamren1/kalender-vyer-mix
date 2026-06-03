// @ts-nocheck
/**
 * process-sync-jobs — Durable worker for booking sync queue.
 *
 * NEW MODEL (coalesced incremental sync):
 *   - Claim all currently pending jobs (batch).
 *   - Group them by organization_id.
 *   - For each organization, call import-bookings ONCE with
 *     syncMode='incremental' — NO booking_id, NO per-booking external fetch.
 *   - Mark all jobs in that org as completed if the incremental sync succeeded.
 *
 * Why: the previous design called import-bookings once per booking with
 * `syncMode: 'single'` + `booking_id`. That caused Planning to hammer the
 * external export_bookings endpoint with per-booking lookups in a tight
 * loop. Webhook bursts multiplied the storm. The external system is the
 * single source of truth and already supports a `since`-cursor sync —
 * one batched incremental call per org delivers the same data far more
 * efficiently and naturally coalesces bursts.
 *
 * Manual single-booking refreshes (admin UI etc.) still go directly to
 * import-bookings with `booking_id` — they do NOT pass through this queue.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 200

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Claim a generous batch of jobs (FOR UPDATE SKIP LOCKED) ──────
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

  // ── 2. Group jobs by organization_id ────────────────────────────────
  const jobsByOrg = new Map<string, any[]>()
  for (const job of claimedJobs) {
    if (!job.organization_id) continue
    const list = jobsByOrg.get(job.organization_id) || []
    list.push(job)
    jobsByOrg.set(job.organization_id, list)
  }

  console.log(
    `[process-sync-jobs] Claimed ${claimedJobs.length} jobs across ${jobsByOrg.size} org(s); coalescing into incremental sync per org`
  )

  const orgResults: Array<{
    organization_id: string
    job_count: number
    status: 'completed' | 'failed'
    error?: string
  }> = []

  // ── 3. ONE incremental sync per organization ────────────────────────
  for (const [organizationId, jobs] of jobsByOrg.entries()) {
    const jobIds = jobs.map((j: any) => j.id)
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          // Coalesced incremental sync — NO booking_id.
          // import-bookings reads sync_state.last_sync_timestamp and asks
          // the external system for everything changed since then.
          syncMode: 'incremental',
          organization_id: organizationId,
          quiet: true,
        }),
      })

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'no body')
        throw new Error(
          `import-bookings returned ${res.status}: ${errorBody.substring(0, 500)}`
        )
      }

      // Consume body to prevent resource leak
      await res.text().catch(() => '')

      // Mark every claimed job in this org as completed
      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .in('id', jobIds)

      console.log(
        `[process-sync-jobs] org=${organizationId} coalesced ${jobs.length} job(s) into 1 incremental sync — OK`
      )
      orgResults.push({
        organization_id: organizationId,
        job_count: jobs.length,
        status: 'completed',
      })
    } catch (err: any) {
      const errMsg = String(err?.message || err).substring(0, 1000)
      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'failed',
          error_message: errMsg,
          processed_at: new Date().toISOString(),
        })
        .in('id', jobIds)

      console.error(
        `[process-sync-jobs] org=${organizationId} incremental sync failed for ${jobs.length} job(s):`,
        errMsg
      )
      orgResults.push({
        organization_id: organizationId,
        job_count: jobs.length,
        status: 'failed',
        error: errMsg,
      })
    }
  }

  return new Response(
    JSON.stringify({
      processed_jobs: claimedJobs.length,
      organizations: jobsByOrg.size,
      results: orgResults,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
