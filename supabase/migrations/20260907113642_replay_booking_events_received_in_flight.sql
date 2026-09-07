-- A webhook can arrive while the worker is already reading the same booking.
-- Keep the current lease valid, mark the row dirty, and replay it only after
-- that worker finishes. This guarantees the last source state wins without
-- running two writes for one booking concurrently.

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

REVOKE ALL ON FUNCTION public.enqueue_booking_sync_job(text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_booking_sync_job(text, text, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_sync_job(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sync_job(uuid, uuid)
  TO service_role;
