-- ============================================================
-- STEG 4B: härda retry, jobs och batcher
-- ============================================================

-- 1. Nya kolumner: lease-ägarskap
ALTER TABLE public.booking_sync_jobs
  ADD COLUMN IF NOT EXISTS worker_token uuid,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS booking_sync_jobs_claimable_idx
  ON public.booking_sync_jobs (status, next_attempt_at, received_at);
CREATE INDEX IF NOT EXISTS booking_sync_jobs_lease_idx
  ON public.booking_sync_jobs (status, lease_expires_at);

-- 2. Hårt tak för antal försök + skydd mot att request höjer max_attempts
CREATE OR REPLACE FUNCTION public.enforce_sync_job_attempt_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _hard_cap integer := 5;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.max_attempts IS NULL OR NEW.max_attempts < 1 THEN
      NEW.max_attempts := 3;
    END IF;
    IF NEW.max_attempts > _hard_cap THEN
      NEW.max_attempts := _hard_cap;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: max_attempts får aldrig höjas utifrån.
  IF NEW.max_attempts IS DISTINCT FROM OLD.max_attempts THEN
    NEW.max_attempts := OLD.max_attempts;
  END IF;
  -- attempts får aldrig minska (ingen retry-nollställning utifrån).
  IF NEW.attempts < OLD.attempts THEN
    NEW.attempts := OLD.attempts;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_job_attempt_policy ON public.booking_sync_jobs;
CREATE TRIGGER trg_sync_job_attempt_policy
  BEFORE INSERT OR UPDATE ON public.booking_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sync_job_attempt_policy();

-- 3. State machine: blockera ogiltiga transitions
CREATE OR REPLACE FUNCTION public.enforce_sync_job_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _ok boolean := false;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending','processing','retryable','completed','failed') THEN
    RAISE EXCEPTION 'invalid sync job status: %', NEW.status;
  END IF;

  _ok := CASE OLD.status
    WHEN 'pending'    THEN NEW.status IN ('processing','failed')
    WHEN 'processing' THEN NEW.status IN ('completed','failed','retryable','pending')
    WHEN 'retryable'  THEN NEW.status IN ('processing','failed')
    -- terminala states
    WHEN 'completed'  THEN false
    WHEN 'failed'     THEN false
    ELSE false
  END;

  IF NOT _ok THEN
    RAISE EXCEPTION 'invalid sync job transition % -> % (job %)', OLD.status, NEW.status, OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_job_transition ON public.booking_sync_jobs;
CREATE TRIGGER trg_sync_job_transition
  BEFORE UPDATE OF status ON public.booking_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sync_job_transition();

-- 4. Claim med lease, fair share per organisation och takeover av utgångna leases
CREATE OR REPLACE FUNCTION public.claim_sync_jobs(
  batch_limit integer DEFAULT 10,
  p_worker_id text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 300,
  p_max_per_org integer DEFAULT NULL
)
RETURNS SETOF booking_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lease integer := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 1800));
  _per_org integer := COALESCE(p_max_per_org, GREATEST(1, batch_limit));
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT j.id,
           row_number() OVER (PARTITION BY j.organization_id ORDER BY j.received_at ASC) AS org_rank
    FROM public.booking_sync_jobs j
    WHERE j.attempts < j.max_attempts
      AND (
        (j.status IN ('pending','retryable')
          AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now()))
        OR (j.status = 'processing'
          AND j.lease_expires_at IS NOT NULL
          AND j.lease_expires_at <= now())
      )
  ),
  picked AS (
    SELECT c.id
    FROM claimable c
    WHERE c.org_rank <= _per_org
    ORDER BY c.org_rank ASC, c.id ASC
    LIMIT batch_limit
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
      worker_token = gen_random_uuid(),
      worker_id = p_worker_id,
      lease_expires_at = now() + make_interval(secs => _lease)
  WHERE t.id IN (SELECT id FROM locked)
  RETURNING t.*;
END;
$$;

-- 5. Resultatskrivning kräver giltig lease-token (gammal worker kan inte commit:a)
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
  SET status = 'completed',
      processed_at = now(),
      error_message = NULL,
      next_attempt_at = NULL,
      lease_expires_at = NULL,
      worker_token = NULL
  WHERE id = _job_id
    AND status = 'processing'
    AND worker_token = _worker_token;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_sync_job(
  _job_id uuid,
  _worker_token uuid,
  _error text,
  _retriable boolean,
  _next_attempt_at timestamptz DEFAULT NULL
)
RETURNS TABLE(updated boolean, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job RECORD;
  _status text;
  _rows integer;
BEGIN
  SELECT id, attempts, max_attempts, status
    INTO _job
  FROM public.booking_sync_jobs
  WHERE id = _job_id
    AND status = 'processing'
    AND worker_token = _worker_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  IF _retriable AND _job.attempts < _job.max_attempts THEN
    _status := 'retryable';
  ELSE
    _status := 'failed';
  END IF;

  UPDATE public.booking_sync_jobs
  SET status = _status,
      error_message = LEFT(COALESCE(_error, ''), 1000),
      next_attempt_at = CASE WHEN _status = 'retryable' THEN COALESCE(_next_attempt_at, now() + interval '30 seconds') ELSE NULL END,
      processed_at = CASE WHEN _status = 'failed' THEN now() ELSE NULL END,
      lease_expires_at = NULL,
      worker_token = NULL
  WHERE id = _job_id;
  GET DIAGNOSTICS _rows = ROW_COUNT;

  RETURN QUERY SELECT _rows > 0, _status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_sync_jobs(integer, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_sync_job(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_sync_job(uuid, uuid, text, boolean, timestamptz) TO service_role;

-- 6. Batch-finalisering: retryable/processing blockerar avslut och cursorflytt
CREATE OR REPLACE FUNCTION public.finalize_sync_batch(_batch_id uuid)
RETURNS TABLE(finalized boolean, status text, succeeded integer, failed integer, remaining integer, cursor_advanced_to timestamp with time zone, monotonic_skip boolean)
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
  SELECT id, organization_id, sync_type, planned_cursor, status
    INTO _batch
  FROM public.sync_batches
  WHERE id = _batch_id
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
    COALESCE(SUM(CASE WHEN j.status = 'pending' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'processing' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'retryable' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'failed' THEN 1 ELSE 0 END), 0),
    COUNT(*)
  INTO _pending, _processing, _retryable, _completed, _permanently_failed, _total
  FROM public.sync_batch_jobs sbj
  JOIN public.booking_sync_jobs j ON j.id = sbj.job_id
  WHERE sbj.batch_id = _batch_id;

  IF _pending + _processing + _retryable > 0 THEN
    RETURN QUERY SELECT false, 'pending'::text, _completed, _permanently_failed,
                        (_pending + _processing + _retryable), NULL::timestamptz, false;
    RETURN;
  END IF;

  IF _total = 0 THEN
    _new_status := 'success';
  ELSIF _permanently_failed > 0 THEN
    _new_status := 'partial';
  ELSE
    _new_status := 'success';
  END IF;

  UPDATE public.sync_batches
  SET status = _new_status,
      succeeded_jobs = _completed,
      failed_jobs = _permanently_failed,
      total_jobs = _total,
      completed_at = _now
  WHERE id = _batch_id AND status = 'pending';

  IF _new_status = 'success' THEN
    SELECT last_sync_timestamp INTO _current_cursor
      FROM public.sync_state
     WHERE organization_id = _batch.organization_id
       AND sync_type = _batch.sync_type
     FOR UPDATE;

    IF _current_cursor IS NULL OR _current_cursor < _batch.planned_cursor THEN
      INSERT INTO public.sync_state (
        sync_type, organization_id, last_sync_timestamp, last_sync_status,
        last_sync_mode, metadata, updated_at
      ) VALUES (
        _batch.sync_type, _batch.organization_id, _batch.planned_cursor, 'success',
        'incremental',
        jsonb_build_object(
          'batch_id', _batch_id,
          'cursor_advanced_to', _batch.planned_cursor,
          'succeeded_jobs', _completed,
          'failed_jobs', 0
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
  END IF;

  RETURN QUERY SELECT true, _new_status, _completed, _permanently_failed, 0, _advanced, _monotonic_skip;
END;
$$;
