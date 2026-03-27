-- Atomic job claiming function: prevents two workers from grabbing the same job
CREATE OR REPLACE FUNCTION public.claim_sync_jobs(batch_limit integer DEFAULT 10)
RETURNS SETOF booking_sync_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE booking_sync_jobs
  SET status = 'processing',
      started_at = now(),
      attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM booking_sync_jobs
    WHERE status = 'pending'
       OR (status = 'failed' AND attempts < max_attempts)
    ORDER BY received_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_limit
  )
  RETURNING *;
$$;