// @ts-nocheck
/**
 * process-sync-jobs — Durable worker for booking sync queue.
 *
 * BATCH-MODEL (server-authoritative cursor):
 *   - Ett jobb kan tillhöra flera batcher samtidigt via `sync_batch_jobs`.
 *   - När ett jobb blir terminalt (completed/failed) letar vi upp ALLA batcher
 *     som pekar på jobbet och kör `finalize_sync_batch` för var och en.
 *   - RPC:n låser batchen atomiskt och flyttar cursorn ENDAST framåt.
 *
 * RETRY-POLICY:
 *   - Retriable fel (nätverk/timeouts/5xx) → status='pending',
 *     next_attempt_at = now() + 30s * attempts (exponential backoff).
 *   - Permanent fel eller attempts >= max_attempts → status='failed'.
 *   - Batchen håller cursorn så länge det finns retriable jobb kvar.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { finalizeBatchIfDone } from '../_shared/syncBatch.ts'
import { validateSingleBookingResult } from '../_shared/singleBookingResult.ts'
import {
  classifyJobFailure,
  nextAttemptAtIso,
  JOB_LEASE_SECONDS,
  resolveMaxAttempts,
} from '../_shared/syncJobLifecycle.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 50
const PER_BOOKING_CONCURRENCY = 3
const MAX_JOBS_PER_ORG = 10

interface ClaimedJob {
  id: string
  booking_id: string
  organization_id: string
  event_type: string | null
  batch_id: string | null
  attempts: number
  max_attempts: number
  worker_token: string | null
}

/** Klassar felmeddelanden. Nätverks-/timeout-/5xx-fel är retriable. */
function isRetriableError(errMsg: string): boolean {
  const m = errMsg.toLowerCase()
  if (m.includes('timeout') || m.includes('etimedout')) return true
  if (m.includes('econnreset') || m.includes('econnrefused')) return true
  if (m.includes('fetch failed') || m.includes('network')) return true
  // 5xx från externa API:t
  if (/\b5\d\d\b/.test(m)) return true
  // 429 rate limit
  if (m.includes('429') || m.includes('rate limit')) return true
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Claim en batch jobb (FOR UPDATE SKIP LOCKED) ───────────────
  const workerId = `worker-${crypto.randomUUID()}`
  const { data: claimedJobs, error: claimError } = await supabase
    .rpc('claim_sync_jobs', {
      batch_limit: BATCH_SIZE,
      p_worker_id: workerId,
      p_lease_seconds: JOB_LEASE_SECONDS,
      // Poison job-isolering: en enskild org får aldrig äta hela batchen.
      p_max_per_org: MAX_JOBS_PER_ORG,
    })

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

  // ── 2. Gruppera per (organization_id, booking_id) ───────────────────
  const groups = new Map<string, {
    organization_id: string
    booking_id: string
    event_type: string | null
    jobIds: string[]
    tokens: Record<string, string | null>
    attempts: number
    max_attempts: number
  }>()

  const jobIdList: string[] = []
  for (const job of jobs) {
    if (!job.booking_id || !job.organization_id) {
      await supabase
        .from('booking_sync_jobs')
        .update({
          status: 'failed',
          error_message: 'missing booking_id or organization_id',
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      jobIdList.push(job.id)
      continue
    }
    const key = `${job.organization_id}::${job.booking_id}`
    const entry = groups.get(key) || {
      organization_id: job.organization_id,
      booking_id: job.booking_id,
      event_type: job.event_type ?? null,
      jobIds: [],
      tokens: {},
      attempts: job.attempts ?? 0,
      max_attempts: job.max_attempts ?? 3,
    }
    if (!entry.event_type && job.event_type) entry.event_type = job.event_type
    entry.jobIds.push(job.id)
    entry.tokens[job.id] = job.worker_token ?? null
    entry.attempts = Math.max(entry.attempts, job.attempts ?? 0)
    entry.max_attempts = Math.max(entry.max_attempts, job.max_attempts ?? 3)
    jobIdList.push(job.id)
    groups.set(key, entry)
  }

  console.log(
    `[process-sync-jobs] Claimed ${jobs.length} job(s) → ${groups.size} unique booking refresh(es)`
  )

  const results: Array<{
    booking_id: string
    organization_id: string
    job_count: number
    status: 'completed' | 'failed' | 'retry' | 'lease_lost'
    error?: string
    reason?: string
  }> = []

  const entries = Array.from(groups.values())
  let cursor = 0

  const runOne = async (group: typeof entries[number]) => {
    console.log(
      `[process-sync-jobs] → import-bookings single booking=${group.booking_id} ` +
      `org=${group.organization_id} event_type=${group.event_type ?? 'null'} ` +
      `coalesced_jobs=${group.jobIds.length} attempt=${group.attempts}`
    )
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
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

      let parsed: any = null
      try { parsed = JSON.parse(bodyText) } catch { /* ignore */ }

      // STRIKT KONTRAKTSVALIDERING: endast ett exakt matchande svar med
      // outcome applied/already_current får markera jobbet som completed.
      const validation = validateSingleBookingResult(
        parsed,
        { bookingId: group.booking_id, organizationId: group.organization_id },
        { ok: res.ok, status: res.status },
      )
      if (!validation.ok) {
        const err = new Error(
          `import-bookings contract check failed (${validation.reason}) http=${res.status} body=${bodyText.substring(0, 300)}`
        )
        ;(err as any).permanent = validation.permanent
        throw err
      }
      console.log(
        `[process-sync-jobs] contract ok booking=${group.booking_id} outcome=${validation.outcome}`
      )

      // Token-skyddad commit: en worker som förlorat sin lease kan inte skriva.
      let committed = 0
      for (const jobId of group.jobIds) {
        const { data: ok, error: completeErr } = await supabase.rpc('complete_sync_job', {
          _job_id: jobId,
          _worker_token: group.tokens[jobId],
        })
        if (completeErr) {
          console.error(`[process-sync-jobs] complete_sync_job failed job=${jobId}`, completeErr.message)
          continue
        }
        if (ok === true) committed++
        else console.warn(`[process-sync-jobs] lease lost, commit ignored job=${jobId}`)
      }

      results.push({
        booking_id: group.booking_id,
        organization_id: group.organization_id,
        job_count: group.jobIds.length,
        status: committed > 0 ? 'completed' : 'lease_lost',
      })
    } catch (err: any) {
      const errMsg = String(err?.message || err).substring(0, 1000)
      const permanent = err?.permanent === true
      const retriable = !permanent && (err?.permanent === false || isRetriableError(errMsg))
      const outcome = classifyJobFailure({
        permanent,
        retriable,
        attempts: group.attempts,
        maxAttempts: group.max_attempts,
      })
      const nextAt = outcome.status === 'retryable' ? nextAttemptAtIso(group.attempts) : null

      let finalStatus: string = outcome.status
      for (const jobId of group.jobIds) {
        const { data, error: failErr } = await supabase.rpc('fail_sync_job', {
          _job_id: jobId,
          _worker_token: group.tokens[jobId],
          _error: `[attempt ${group.attempts}/${group.max_attempts}] ${errMsg}`,
          _retriable: outcome.status === 'retryable',
          _next_attempt_at: nextAt,
        })
        if (failErr) {
          console.error(`[process-sync-jobs] fail_sync_job failed job=${jobId}`, failErr.message)
          continue
        }
        const row = Array.isArray(data) ? data[0] : data
        if (row?.updated !== true) {
          console.warn(`[process-sync-jobs] lease lost, failure write ignored job=${jobId}`)
        } else if (row?.new_status) {
          finalStatus = row.new_status
        }
      }

      results.push({
        booking_id: group.booking_id,
        organization_id: group.organization_id,
        job_count: group.jobIds.length,
        status: finalStatus === 'retryable' ? 'retry' : 'failed',
        error: errMsg,
        reason: outcome.reason,
      })
      if (finalStatus === 'retryable') {
        console.warn(`[process-sync-jobs] booking=${group.booking_id} RETRY at ${nextAt}: ${errMsg}`)
      } else {
        console.error(`[process-sync-jobs] booking=${group.booking_id} FAILED (${outcome.reason}): ${errMsg}`)
      }
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

  // ── 3. Hitta ALLA batcher som pekar på de bearbetade jobben ─────────
  //    Ett jobb kan tillhöra flera aktiva batcher — vi måste finalisera alla.
  const allBatchIds = new Set<string>()
  if (jobIdList.length > 0) {
    const { data: batchLinks, error: linkErr } = await supabase
      .from('sync_batch_jobs')
      .select('batch_id')
      .in('job_id', jobIdList)
    if (linkErr) {
      console.warn('[process-sync-jobs] failed to lookup sync_batch_jobs:', linkErr.message)
    } else {
      for (const link of batchLinks ?? []) {
        if (link?.batch_id) allBatchIds.add(link.batch_id)
      }
    }
  }

  // ── 4. Finalisera varje batch atomiskt via RPC ──────────────────────
  const finalizations: Array<Awaited<ReturnType<typeof finalizeBatchIfDone>>> = []
  for (const batchId of allBatchIds) {
    try {
      const res = await finalizeBatchIfDone(supabase, batchId)
      finalizations.push(res)
    } catch (err: any) {
      console.error(`[process-sync-jobs] finalize batch=${batchId} failed`, err?.message ?? err)
    }
  }

  return new Response(
    JSON.stringify({
      processed_jobs: jobs.length,
      unique_bookings: groups.size,
      results,
      batches_probed: finalizations.length,
      batches_finalized: finalizations.filter((f) => f.finalized).length,
      cursors_advanced: finalizations.filter((f) => f.cursorAdvancedTo).length,
      monotonic_skips: finalizations.filter((f) => f.monotonicSkip).length,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
