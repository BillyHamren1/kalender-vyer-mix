-- Booking -> Planning critical-path hardening.
--
-- Goals:
--   * confirmation/cancellation jobs pass routine incremental work
--   * webhook coalescing is atomic and preserves the highest-priority signal
--   * legacy processing rows without leases become recoverable
--   * terminal poison jobs do not hold the global incremental cursor forever
--   * missed batch-finalization callbacks are swept by the worker

ALTER TABLE public.booking_sync_jobs
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 0;

-- The retry worker and transition trigger already use status='retryable', but
-- the original table check still allowed only pending/processing/completed/
-- failed. That made every retriable failure violate the table constraint.
ALTER TABLE public.booking_sync_jobs
  DROP CONSTRAINT IF EXISTS booking_sync_jobs_status_check;
ALTER TABLE public.booking_sync_jobs
  ADD CONSTRAINT booking_sync_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'retryable', 'completed', 'failed'))
  NOT VALID;
ALTER TABLE public.booking_sync_jobs
  VALIDATE CONSTRAINT booking_sync_jobs_status_check;

ALTER TABLE public.booking_sync_jobs
  DROP CONSTRAINT IF EXISTS booking_sync_jobs_priority_range;
ALTER TABLE public.booking_sync_jobs
  ADD CONSTRAINT booking_sync_jobs_priority_range
  CHECK (priority BETWEEN 0 AND 100) NOT VALID;

UPDATE public.booking_sync_jobs
SET priority = CASE replace(lower(event_type), '_', '.')
  WHEN 'booking.confirmed' THEN 100
  WHEN 'booking.cancelled' THEN 100
  WHEN 'booking.updated' THEN 60
  WHEN 'booking.created' THEN 40
  WHEN 'booking.offer' THEN 20
  ELSE 0
END
WHERE status IN ('pending', 'processing', 'retryable');

ALTER TABLE public.booking_sync_jobs
  VALIDATE CONSTRAINT booking_sync_jobs_priority_range;

CREATE INDEX IF NOT EXISTS booking_sync_jobs_priority_claimable_idx
  ON public.booking_sync_jobs (status, priority DESC, next_attempt_at, received_at)
  WHERE status IN ('pending', 'processing', 'retryable');

-- Rows created by the pre-lease worker can have status=processing forever
-- because lease_expires_at is NULL. Recover only rows that have been inactive
-- for more than twice the normal five-minute lease.
UPDATE public.booking_sync_jobs
SET status = CASE WHEN attempts < max_attempts THEN 'retryable' ELSE 'failed' END,
    next_attempt_at = CASE WHEN attempts < max_attempts THEN now() ELSE NULL END,
    processed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE processed_at END,
    worker_token = NULL,
    worker_id = NULL,
    lease_expires_at = NULL,
    error_message = LEFT(
      concat_ws(' ', NULLIF(error_message, ''), '[recovered legacy job without lease]'),
      1000
    )
WHERE status = 'processing'
  AND lease_expires_at IS NULL
  AND COALESCE(started_at, received_at, created_at) <= now() - interval '10 minutes';

-- Retryable is an active queue state too. Older code excluded it from the
-- partial unique index, so a later poll could create a second pending row for
-- the same booking. Keep the most important row and retain the others as
-- terminal audit records before widening the uniqueness guarantee.
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

-- Atomic intake. An advisory transaction lock serializes the same
-- (organization, booking) key even when webhook and poller arrive together.
CREATE OR REPLACE FUNCTION public.enqueue_booking_sync_job(
  p_booking_id text,
  p_organization_id text,
  p_event_type text DEFAULT 'unknown',
  p_priority integer DEFAULT 0
)
RETURNS TABLE(
  job_id uuid,
  job_status text,
  job_event_type text,
  job_priority smallint,
  coalesced boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job public.booking_sync_jobs%ROWTYPE;
  _event_type text := replace(lower(trim(COALESCE(p_event_type, 'unknown'))), '_', '.');
  _priority smallint := LEAST(100, GREATEST(0, COALESCE(p_priority, 0)))::smallint;
BEGIN
  IF NULLIF(trim(p_booking_id), '') IS NULL THEN
    RAISE EXCEPTION 'booking_id is required';
  END IF;
  IF NULLIF(trim(p_organization_id), '') IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_organization_id || E'\x1f' || p_booking_id, 0)
  );

  SELECT j.*
    INTO _job
  FROM public.booking_sync_jobs j
  WHERE j.organization_id = p_organization_id
    AND j.booking_id = p_booking_id
    AND j.status IN ('pending', 'processing', 'retryable')
  ORDER BY j.priority DESC, j.received_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.booking_sync_jobs j
    SET priority = GREATEST(j.priority, _priority),
        event_type = CASE
          WHEN _priority > j.priority OR _priority = 100 THEN _event_type
          ELSE j.event_type
        END,
        next_attempt_at = CASE
          -- An event that arrives while the booking is already being read
          -- marks the row dirty. complete_sync_job turns it into a retry only
          -- after the current worker has finished writing, preventing an old
          -- in-flight response from winning the race against the new state.
          WHEN j.status = 'processing' THEN now()
          WHEN j.status = 'retryable' AND _priority = 100 THEN now()
          ELSE j.next_attempt_at
        END
    WHERE j.id = _job.id
    RETURNING j.* INTO _job;

    RETURN QUERY SELECT _job.id, _job.status, _job.event_type,
                        _job.priority, true;
    RETURN;
  END IF;

  INSERT INTO public.booking_sync_jobs (
    booking_id, organization_id, event_type, priority, status
  ) VALUES (
    p_booking_id, p_organization_id, _event_type, _priority, 'pending'
  )
  RETURNING * INTO _job;

  RETURN QUERY SELECT _job.id, _job.status, _job.event_type,
                      _job.priority, false;
END;
$$;

-- next_attempt_at is also the in-flight dirty marker. A valid worker result
-- is accepted, but a webhook received during that worker's lease causes the
-- same row to be re-read immediately instead of being marked terminal.
CREATE OR REPLACE FUNCTION public.complete_sync_job(_job_id uuid, _worker_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows integer;
BEGIN
  UPDATE public.booking_sync_jobs
  SET status = CASE WHEN next_attempt_at IS NULL THEN 'completed' ELSE 'retryable' END,
      processed_at = CASE WHEN next_attempt_at IS NULL THEN now() ELSE NULL END,
      error_message = NULL,
      next_attempt_at = CASE WHEN next_attempt_at IS NULL THEN NULL ELSE now() END,
      lease_expires_at = NULL,
      worker_token = NULL,
      worker_id = NULL
  WHERE id = _job_id
    AND status = 'processing'
    AND worker_token = _worker_token;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;

-- Fair, priority-aware claim with takeover of both expired leases and the
-- legacy NULL-lease form. The per-org rank prevents one tenant from starving
-- all others, while the outer order ensures critical jobs are considered first.
CREATE OR REPLACE FUNCTION public.claim_sync_jobs(
  batch_limit integer DEFAULT 10,
  p_worker_id text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 300,
  p_max_per_org integer DEFAULT NULL
)
RETURNS SETOF public.booking_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer := GREATEST(1, LEAST(COALESCE(batch_limit, 10), 500));
  _lease integer := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 1800));
  _per_org integer := GREATEST(1, COALESCE(p_max_per_org, _limit));
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT
      j.id,
      j.priority,
      j.received_at,
      row_number() OVER (
        PARTITION BY j.organization_id
        ORDER BY j.priority DESC, j.received_at ASC, j.id ASC
      ) AS org_rank
    FROM public.booking_sync_jobs j
    WHERE j.attempts < j.max_attempts
      AND (
        (j.status IN ('pending', 'retryable')
          AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now()))
        OR
        (j.status = 'processing' AND (
          (j.lease_expires_at IS NOT NULL AND j.lease_expires_at <= now())
          OR
          (j.lease_expires_at IS NULL
            AND COALESCE(j.started_at, j.received_at, j.created_at)
              <= now() - make_interval(secs => _lease))
        ))
      )
  ),
  picked AS (
    SELECT c.id
    FROM claimable c
    WHERE c.org_rank <= _per_org
    ORDER BY c.priority DESC, c.org_rank ASC, c.received_at ASC, c.id ASC
    LIMIT _limit
  ),
  locked AS (
    SELECT j.id
    FROM public.booking_sync_jobs j
    WHERE j.id IN (SELECT id FROM picked)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.booking_sync_jobs t
  SET status = 'processing',
      started_at = now(),
      attempts = t.attempts + 1,
      next_attempt_at = NULL,
      worker_token = gen_random_uuid(),
      worker_id = p_worker_id,
      lease_expires_at = now() + make_interval(secs => _lease)
  WHERE t.id IN (SELECT id FROM locked)
  RETURNING t.*;
END;
$$;

-- Terminal failures are already retained as a durable dead-letter record in
-- booking_sync_jobs. Once every job is terminal, advancing the cursor is safe:
-- it prevents a single poison booking from replaying the same global window
-- forever while preserving that failed booking for targeted reconciliation.
CREATE OR REPLACE FUNCTION public.finalize_sync_batch(_batch_id uuid)
RETURNS TABLE(
  finalized boolean,
  status text,
  succeeded integer,
  failed integer,
  remaining integer,
  cursor_advanced_to timestamptz,
  monotonic_skip boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _batch RECORD;
  _pending integer := 0;
  _processing integer := 0;
  _retryable integer := 0;
  _completed integer := 0;
  _permanently_failed integer := 0;
  _total integer := 0;
  _new_status text;
  _now timestamptz := now();
  _current_cursor timestamptz;
  _monotonic_skip boolean := false;
  _advanced timestamptz := NULL;
BEGIN
  SELECT sb.id, sb.organization_id, sb.sync_type, sb.planned_cursor, sb.status
    INTO _batch
  FROM public.sync_batches sb
  WHERE sb.id = _batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'unknown'::text, 0, 0, 0, NULL::timestamptz, false;
    RETURN;
  END IF;

  IF _batch.status <> 'pending' THEN
    RETURN QUERY SELECT false, _batch.status, 0, 0, 0, NULL::timestamptz, false;
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM((j.status = 'pending')::integer), 0),
    COALESCE(SUM((j.status = 'processing')::integer), 0),
    COALESCE(SUM((j.status = 'retryable')::integer), 0),
    COALESCE(SUM((j.status = 'completed')::integer), 0),
    COALESCE(SUM((j.status = 'failed')::integer), 0),
    COUNT(*)
  INTO _pending, _processing, _retryable, _completed, _permanently_failed, _total
  FROM public.sync_batch_jobs sbj
  JOIN public.booking_sync_jobs j ON j.id = sbj.job_id
  WHERE sbj.batch_id = _batch_id;

  IF _pending + _processing + _retryable > 0 THEN
    RETURN QUERY SELECT false, 'pending'::text, _completed, _permanently_failed,
                        _pending + _processing + _retryable, NULL::timestamptz, false;
    RETURN;
  END IF;

  _new_status := CASE WHEN _permanently_failed > 0 THEN 'partial' ELSE 'success' END;

  UPDATE public.sync_batches sb
  SET status = _new_status,
      succeeded_jobs = _completed,
      failed_jobs = _permanently_failed,
      total_jobs = _total,
      completed_at = _now
  WHERE sb.id = _batch_id AND sb.status = 'pending';

  SELECT ss.last_sync_timestamp
    INTO _current_cursor
  FROM public.sync_state ss
  WHERE ss.organization_id = _batch.organization_id
    AND ss.sync_type = _batch.sync_type
  FOR UPDATE;

  IF _current_cursor IS NULL OR _current_cursor < _batch.planned_cursor THEN
    INSERT INTO public.sync_state (
      sync_type, organization_id, last_sync_timestamp, last_sync_status,
      last_sync_mode, metadata, updated_at
    ) VALUES (
      _batch.sync_type, _batch.organization_id, _batch.planned_cursor, _new_status,
      'incremental',
      jsonb_build_object(
        'batch_id', _batch_id,
        'cursor_advanced_to', _batch.planned_cursor,
        'succeeded_jobs', _completed,
        'failed_jobs', _permanently_failed,
        'failed_jobs_retained_for_reconciliation', _permanently_failed > 0
      ),
      _now
    )
    ON CONFLICT (organization_id, sync_type) DO UPDATE
    SET last_sync_timestamp = EXCLUDED.last_sync_timestamp,
        last_sync_status = EXCLUDED.last_sync_status,
        last_sync_mode = EXCLUDED.last_sync_mode,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at;
    _advanced := _batch.planned_cursor;
  ELSE
    _monotonic_skip := true;
  END IF;

  RETURN QUERY SELECT true, _new_status, _completed, _permanently_failed,
                      0, _advanced, _monotonic_skip;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ready_sync_batches(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _batch RECORD;
  _finalized integer := 0;
  _limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
BEGIN
  FOR _batch IN
    SELECT sb.id
    FROM public.sync_batches sb
    WHERE sb.status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public.sync_batch_jobs sbj
        JOIN public.booking_sync_jobs j ON j.id = sbj.job_id
        WHERE sbj.batch_id = sb.id
          AND j.status IN ('pending', 'processing', 'retryable')
      )
    ORDER BY sb.started_at ASC, sb.id ASC
    LIMIT _limit
    FOR UPDATE OF sb SKIP LOCKED
  LOOP
    PERFORM public.finalize_sync_batch(_batch.id);
    _finalized := _finalized + 1;
  END LOOP;

  RETURN _finalized;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_booking_sync_job(text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_booking_sync_job(text, text, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_sync_jobs(integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sync_jobs(integer, text, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_sync_job(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sync_job(uuid, uuid)
  TO service_role;

-- Keep the legacy one-argument overload inaccessible so new callers cannot
-- accidentally bypass leases and priority ordering.
REVOKE ALL ON FUNCTION public.claim_sync_jobs(integer)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.finalize_sync_batch(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sync_batch(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_ready_sync_batches(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ready_sync_batches(integer)
  TO service_role;

COMMENT ON COLUMN public.booking_sync_jobs.priority IS
  'Operational priority: 100 critical status transition, 60 update, 40 create, 20 offer, 0 batch polling.';
