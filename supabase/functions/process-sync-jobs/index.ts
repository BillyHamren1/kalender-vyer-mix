// @ts-nocheck
/**
 * process-sync-jobs — Durable worker for booking sync queue.
 *
 * NEW MODEL (per-booking refresh):
 *   - Claim a batch of pending jobs.
 *   - For each unique booking_id, call import-bookings with
 *     syncMode='single' + booking_id so the external API is asked for that
 *     specific booking and the result is actually persisted to the local
 *     `bookings`/`calendar_events` tables.
 *   - Only mark a job as completed when the import actually applied
 *     (single-booking refresh path runs inline and writes to DB).
 *
 * Why we left the old "coalesced incremental per org" model behind:
 *   It used `syncMode='incremental'` with a `since` cursor. The cursor was
 *   advanced even when the external API returned 0 rows for the window,
 *   which silently dropped real webhook updates (the booking row in Planning
 *   stayed stale while the queue showed `completed`). See booking 2605-5
 *   (2026-06-04): multiple queue rows marked completed within minutes,
 *   bookings.updated_at unchanged from the previous evening.
 *
 * Manual single-booking refreshes (admin UI etc.) still go directly to
 * import-bookings with `booking_id` — they bypass this queue entirely.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 50
const PER_BOOKING_CONCURRENCY = 3

interface ClaimedJob {
  id: string
  booking_id: string
  organization_id: string
  event_type: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Claim a batch of jobs (FOR UPDATE SKIP LOCKED) ───────────────
  const { data: claimedJobs, error: claimError } = await supabase
    .rpc('claim_sync_jobs', { batch_limit: BATCH_SIZE })

  if (claimError) {
    console.error('[process-sync-jobs] Failed to claim jobs', claimError.message)
    return new Response(
      JSON.stringify({ error: 'Failed to claim jobs' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const jobs = (claimedJobs || []) as ClaimedJob[]
  if (jobs.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: 'No pending jobs' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── 2. Group claimed job IDs by (organization_id, booking_id) ───────
  // Multiple webhook rows for the same booking coalesce into ONE import call;
  // we still update all those job rows together at the end.
  const groups = new Map<string, { organization_id: string; booking_id: string; jobIds: string[] }>()
  for (const job of jobs) {
    if (!job.booking_id || !job.organization_id) {
      // No booking_id/org → cannot refresh; mark as failed so it doesn't loop.
      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'failed',
          error_message: 'missing booking_id or organization_id',
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      continue
    }
    const key = `${job.organization_id}::${job.booking_id}`
    const entry = groups.get(key) || {
      organization_id: job.organization_id,
      booking_id: job.booking_id,
      jobIds: [],
    }
    entry.jobIds.push(job.id)
    groups.set(key, entry)
  }

  console.log(
    `[process-sync-jobs] Claimed ${jobs.length} job(s) → ${groups.size} unique booking refresh(es)`
  )

  const results: Array<{
    booking_id: string
    organization_id: string
    job_count: number
    status: 'completed' | 'failed'
    error?: string
  }> = []

  // ── 3. Run per-booking single-refresh imports with bounded concurrency ─
  const entries = Array.from(groups.values())
  let cursor = 0

  const runOne = async (group: typeof entries[number]) => {
    console.log(
      `[process-sync-jobs] → import-bookings single booking=${group.booking_id} ` +
      `org=${group.organization_id} event_type=${group.event_type ?? 'null'} ` +
      `coalesced_jobs=${group.jobIds.length}`
    )
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          // Single-booking refresh runs inline and writes to bookings/calendar_events.
          syncMode: 'single',
          booking_id: group.booking_id,
          organization_id: group.organization_id,
          event_type: group.event_type ?? null,
          quiet: false,
        }),
      })

      const bodyText = await res.text().catch(() => '')
      console.log(
        `[process-sync-jobs] ← import-bookings booking=${group.booking_id} ` +
        `status=${res.status} body_preview=${bodyText.substring(0, 200)}`
      )
      if (!res.ok) {
        throw new Error(
          `import-bookings returned ${res.status}: ${bodyText.substring(0, 500)}`
        )
      }

      // Defensive: a successful single-refresh must NOT come back as "queued".
      let parsed: any = null
      try { parsed = JSON.parse(bodyText) } catch { /* ignore */ }
      if (parsed && parsed.queued === true) {
        throw new Error('import-bookings returned queued=true for single refresh (contract regression)')
      }

      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .in('id', group.jobIds)

      results.push({
        booking_id: group.booking_id,
        organization_id: group.organization_id,
        job_count: group.jobIds.length,
        status: 'completed',
      })
      console.log(
        `[process-sync-jobs] ✓ completed booking=${group.booking_id} ` +
        `org=${group.organization_id} jobs=${group.jobIds.length}`
      )
    } catch (err: any) {
      const errMsg = String(err?.message || err).substring(0, 1000)
      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'failed',
          error_message: errMsg,
          processed_at: new Date().toISOString(),
        })
        .in('id', group.jobIds)

      results.push({
        booking_id: group.booking_id,
        organization_id: group.organization_id,
        job_count: group.jobIds.length,
        status: 'failed',
        error: errMsg,
      })
      console.error(
        `[process-sync-jobs] booking=${group.booking_id} refresh failed:`,
        errMsg
      )
    }
  }

  const workers: Promise<void>[] = []
  const next = async () => {
    while (cursor < entries.length) {
      const idx = cursor++
      await runOne(entries[idx])
    }
  }
  for (let i = 0; i < Math.min(PER_BOOKING_CONCURRENCY, entries.length); i++) {
    workers.push(next())
  }
  await Promise.all(workers)

  return new Response(
    JSON.stringify({
      processed_jobs: jobs.length,
      unique_bookings: groups.size,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
