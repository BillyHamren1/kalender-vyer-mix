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

  UPDATE public.sync_batches sb
  SET status = _new_status,
      succeeded_jobs = _completed,
      failed_jobs = _permanently_failed,
      total_jobs = _total,
      completed_at = _now
  WHERE sb.id = _batch_id AND sb.status = 'pending';

  IF _new_status = 'success' THEN
    SELECT ss.last_sync_timestamp INTO _current_cursor
      FROM public.sync_state ss
     WHERE ss.organization_id = _batch.organization_id
       AND ss.sync_type = _batch.sync_type
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

REVOKE ALL ON FUNCTION public.finalize_sync_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sync_batch(uuid) TO service_role;