-- 1. Retry-fältet
ALTER TABLE public.booking_sync_jobs
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

-- 2. claim_sync_jobs respekterar next_attempt_at
CREATE OR REPLACE FUNCTION public.claim_sync_jobs(batch_limit integer DEFAULT 10)
RETURNS SETOF booking_sync_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE booking_sync_jobs
  SET status = 'processing',
      started_at = now(),
      attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM booking_sync_jobs
    WHERE (status = 'pending' OR (status = 'failed' AND attempts < max_attempts))
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ORDER BY received_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_limit
  )
  RETURNING *;
$function$;

-- 3. Städa dubblett-jobb i kön så partial unique kan skapas.
--    För varje (org, booking) med flera pending/processing rader: behåll den
--    senaste (högst received_at); demota övriga till 'completed' med audit-anteckning.
WITH dups AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, booking_id
           ORDER BY received_at DESC, id DESC
         ) AS rn
  FROM public.booking_sync_jobs
  WHERE status IN ('pending','processing')
)
UPDATE public.booking_sync_jobs j
SET status = 'completed',
    processed_at = now(),
    error_message = COALESCE(j.error_message,'') || ' [deduped by sync_batch_jobs migration]'
FROM dups d
WHERE j.id = d.id AND d.rn > 1;

-- 4. Partial unique index: bara ETT aktivt jobb per (org, booking).
CREATE UNIQUE INDEX IF NOT EXISTS booking_sync_jobs_active_unique
  ON public.booking_sync_jobs (organization_id, booking_id)
  WHERE status IN ('pending','processing');

-- 5. Kopplingstabell many-to-many mellan batcher och jobb.
CREATE TABLE IF NOT EXISTS public.sync_batch_jobs (
  batch_id uuid NOT NULL REFERENCES public.sync_batches(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.booking_sync_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, job_id)
);

GRANT ALL ON public.sync_batch_jobs TO service_role;

ALTER TABLE public.sync_batch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_batch_jobs service role only" ON public.sync_batch_jobs;
CREATE POLICY "sync_batch_jobs service role only"
  ON public.sync_batch_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sync_batch_jobs_batch ON public.sync_batch_jobs (batch_id);
CREATE INDEX IF NOT EXISTS idx_sync_batch_jobs_job ON public.sync_batch_jobs (job_id);

-- 6. Backfill: bevara befintliga batch_id-kopplingar från booking_sync_jobs.
INSERT INTO public.sync_batch_jobs (batch_id, job_id)
SELECT batch_id, id
FROM public.booking_sync_jobs
WHERE batch_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 7. Atomisk finaliserings-RPC.
--    Låser batchraden, räknar jobb via sync_batch_jobs, uppdaterar sync_state
--    med monoton cursor. Endast en samtidig anropare kan finalisera batchen.
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
  _completed integer := 0;
  _failed integer := 0;
  _permanently_failed integer := 0;
  _retryable_failed integer := 0;
  _total integer := 0;
  _new_status text;
  _now timestamptz := now();
  _rows integer;
  _current_cursor timestamptz;
BEGIN
  -- Lås batchraden. En parallell finaliserare blockeras tills vi commitar.
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
    -- Redan finaliserad av annan worker.
    RETURN QUERY SELECT false, _batch.status, 0, 0, 0, NULL::timestamptz, false;
    RETURN;
  END IF;

  -- Räkna jobb via kopplingstabellen (many-to-many).
  SELECT
    COALESCE(SUM(CASE WHEN j.status = 'pending' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'processing' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'failed' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'failed' AND j.attempts >= j.max_attempts THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.status = 'failed' AND j.attempts < j.max_attempts THEN 1 ELSE 0 END), 0),
    COUNT(*)
  INTO _pending, _processing, _completed, _failed, _permanently_failed, _retryable_failed, _total
  FROM public.sync_batch_jobs sbj
  JOIN public.booking_sync_jobs j ON j.id = sbj.job_id
  WHERE sbj.batch_id = _batch_id;

  -- Retryable failed räknas som "pending" (batchen väntar på retry).
  IF _pending + _processing + _retryable_failed > 0 THEN
    RETURN QUERY SELECT false, 'pending'::text, _completed, _permanently_failed,
                        (_pending + _processing + _retryable_failed), NULL::timestamptz, false;
    RETURN;
  END IF;

  -- Tom batch = success + cursor.
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
    -- Monoton cursor: uppdatera bara om ny > befintlig (eller om ingen finns).
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
          last_sync_status = 'success',
          last_sync_mode = 'incremental',
          metadata = EXCLUDED.metadata,
          updated_at = _now
      WHERE public.sync_state.last_sync_timestamp IS NULL
         OR public.sync_state.last_sync_timestamp < EXCLUDED.last_sync_timestamp;
      GET DIAGNOSTICS _rows = ROW_COUNT;

      IF _rows = 0 THEN
        RAISE NOTICE 'finalize_sync_batch: batch % cursor NOT advanced (monotonic skip; existing >= %)', _batch_id, _batch.planned_cursor;
        RETURN QUERY SELECT true, _new_status, _completed, _permanently_failed, 0, NULL::timestamptz, true;
        RETURN;
      END IF;

      RETURN QUERY SELECT true, _new_status, _completed, _permanently_failed, 0, _batch.planned_cursor, false;
      RETURN;
    ELSE
      RAISE NOTICE 'finalize_sync_batch: batch % cursor NOT advanced (existing % >= planned %)', _batch_id, _current_cursor, _batch.planned_cursor;
      RETURN QUERY SELECT true, _new_status, _completed, _permanently_failed, 0, NULL::timestamptz, true;
      RETURN;
    END IF;
  ELSE
    -- Partial: skriv status utan att röra cursor.
    INSERT INTO public.sync_state (
      sync_type, organization_id, last_sync_status, metadata, updated_at
    ) VALUES (
      _batch.sync_type, _batch.organization_id, 'partial',
      jsonb_build_object(
        'batch_id', _batch_id,
        'succeeded_jobs', _completed,
        'failed_jobs', _permanently_failed,
        'cursor_held_at_previous_success', true
      ),
      _now
    )
    ON CONFLICT (organization_id, sync_type) DO UPDATE
    SET last_sync_status = 'partial',
        metadata = EXCLUDED.metadata,
        updated_at = _now;

    RETURN QUERY SELECT true, _new_status, _completed, _permanently_failed, 0, NULL::timestamptz, false;
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_sync_batch(uuid) TO service_role;