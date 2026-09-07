-- Production follow-up for databases that already received the first
-- priority migration before retryable was included in active uniqueness.
-- Idempotent on fresh databases because the preceding migration performs the
-- same consolidation before this one runs.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, booking_id
      ORDER BY
        priority DESC,
        CASE status WHEN 'processing' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        received_at DESC,
        id DESC
    ) AS queue_rank
  FROM public.booking_sync_jobs
  WHERE status IN ('pending', 'processing', 'retryable')
)
UPDATE public.booking_sync_jobs j
SET status = 'failed',
    processed_at = now(),
    next_attempt_at = NULL,
    worker_token = NULL,
    worker_id = NULL,
    lease_expires_at = NULL,
    error_message = LEFT(
      concat_ws(' ', NULLIF(j.error_message, ''), '[deduped active queue state]'),
      1000
    )
FROM ranked r
WHERE j.id = r.id
  AND r.queue_rank > 1;

DROP INDEX IF EXISTS public.booking_sync_jobs_active_unique;
CREATE UNIQUE INDEX booking_sync_jobs_active_unique
  ON public.booking_sync_jobs (organization_id, booking_id)
  WHERE status IN ('pending', 'processing', 'retryable');
