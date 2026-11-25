ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS source_end_time timestamptz;
COMMENT ON COLUMN public.calendar_events.source_start_time IS 'Canonical Booking start time last applied by import (checkpoint). Local edits never change it.';
COMMENT ON COLUMN public.calendar_events.source_end_time IS 'Canonical Booking end time last applied by import (checkpoint). Local edits never change it.';

ALTER TABLE public.booking_sync_jobs ADD COLUMN IF NOT EXISTS warehouse_sync jsonb;

ALTER TABLE public.booking_source_state
  ADD COLUMN IF NOT EXISTS products_pending_source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS products_pending_source_version bigint,
  ADD COLUMN IF NOT EXISTS products_pending_source_status text,
  ADD COLUMN IF NOT EXISTS products_pending_reason text,
  ADD COLUMN IF NOT EXISTS products_pending_code text,
  ADD COLUMN IF NOT EXISTS products_pending_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_booking_sync_job_scope(
  p_job_id uuid, p_organization_id text, p_booking_id text, p_warehouse_sync jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev jsonb; v_next jsonb := p_warehouse_sync; v_restricted boolean;
BEGIN
  IF p_job_id IS NULL OR p_warehouse_sync IS NULL OR jsonb_typeof(p_warehouse_sync) <> 'object' THEN
    RETURN jsonb_build_object('decision', 'invalid_input'); END IF;
  SELECT warehouse_sync INTO v_prev FROM public.booking_sync_jobs
   WHERE id = p_job_id AND organization_id = p_organization_id AND booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'job_not_found'); END IF;
  v_restricted := coalesce(v_next->>'products_wms_accepted','') = 'false'
    OR (lower(coalesce(v_next->>'status','')) = 'attention_required' AND coalesce(v_next->>'products_wms_accepted','') <> 'true');
  IF NOT (coalesce(v_next->>'products_wms_accepted','') = 'true' OR v_restricted) AND v_prev IS NOT NULL THEN v_next := v_prev; END IF;
  UPDATE public.booking_sync_jobs SET warehouse_sync = v_next WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'recorded', 'warehouse_sync', v_next);
END $$;

CREATE OR REPLACE FUNCTION public.set_booking_products_pending(
  p_organization_id uuid, p_booking_id text, p_reservation_token uuid,
  p_pending boolean, p_reason text DEFAULT NULL, p_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.booking_source_state%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.booking_source_state WHERE organization_id = p_organization_id AND booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR p_reservation_token IS NULL OR v_row.lock_token IS DISTINCT FROM p_reservation_token
     OR v_row.lock_expires_at IS NULL OR v_row.lock_expires_at <= now() THEN
    RETURN jsonb_build_object('decision', 'not_lock_owner'); END IF;
  IF p_pending THEN
    UPDATE public.booking_source_state SET
      products_pending_source_updated_at = v_row.pending_source_updated_at,
      products_pending_source_version = v_row.pending_source_version,
      products_pending_source_status = v_row.pending_source_status,
      products_pending_reason = coalesce(p_reason, 'wms_products_not_accepted'),
      products_pending_code = p_code, products_pending_at = now(), updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
    RETURN jsonb_build_object('decision', 'set'); END IF;
  IF v_row.products_pending_at IS NULL THEN RETURN jsonb_build_object('decision', 'unchanged'); END IF;
  UPDATE public.booking_source_state SET products_pending_source_updated_at = NULL, products_pending_source_version = NULL,
    products_pending_source_status = NULL, products_pending_reason = NULL, products_pending_code = NULL, products_pending_at = NULL, updated_at = now()
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
  RETURN jsonb_build_object('decision', 'cleared');
END $$;

CREATE OR REPLACE FUNCTION public.reserve_booking_product_repair(
  p_organization_id uuid, p_booking_id text, p_source_updated_at timestamptz,
  p_source_version bigint, p_source_status text, p_owner_job_id text DEFAULT NULL, p_lease_seconds integer DEFAULT 300
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.booking_source_state%ROWTYPE; v_status text := upper(nullif(btrim(coalesce(p_source_status, '')), ''));
  v_token uuid; v_lease integer := greatest(coalesce(p_lease_seconds, 300), 30);
BEGIN
  IF p_organization_id IS NULL OR nullif(btrim(coalesce(p_booking_id,'')),'') IS NULL OR v_status IS NULL
     OR (p_source_updated_at IS NULL AND p_source_version IS NULL) THEN RETURN jsonb_build_object('decision', 'invalid_input'); END IF;
  SELECT * INTO v_row FROM public.booking_source_state WHERE organization_id = p_organization_id AND booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_current'); END IF;
  IF v_row.lock_token IS NOT NULL AND v_row.lock_expires_at > now() THEN RETURN jsonb_build_object('decision', 'booking_import_locked'); END IF;
  IF v_row.applied_source_updated_at IS DISTINCT FROM p_source_updated_at OR v_row.applied_source_version IS DISTINCT FROM p_source_version
     OR v_row.applied_source_status IS DISTINCT FROM v_status THEN RETURN jsonb_build_object('decision', 'not_current'); END IF;
  IF v_row.products_pending_at IS NULL OR v_row.products_pending_source_updated_at IS DISTINCT FROM p_source_updated_at
     OR v_row.products_pending_source_version IS DISTINCT FROM p_source_version OR v_row.products_pending_source_status IS DISTINCT FROM v_status THEN
    RETURN jsonb_build_object('decision', 'not_pending'); END IF;
  v_token := gen_random_uuid();
  UPDATE public.booking_source_state SET pending_source_updated_at = p_source_updated_at, pending_source_version = p_source_version,
    pending_source_status = v_status, pending_started_at = now(), lock_token = v_token, lock_owner_job_id = p_owner_job_id,
    lock_acquired_at = now(), lock_expires_at = now() + make_interval(secs => v_lease), updated_at = now()
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
  RETURN jsonb_build_object('decision', 'reserved', 'reservation_token', v_token, 'lock_expires_at', now() + make_interval(secs => v_lease));
END $$;

REVOKE ALL ON FUNCTION public.record_booking_sync_job_scope(uuid, text, text, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_booking_products_pending(uuid, text, uuid, boolean, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_booking_product_repair(uuid, text, timestamptz, bigint, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_booking_sync_job_scope(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_booking_products_pending(uuid, text, uuid, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_booking_product_repair(uuid, text, timestamptz, bigint, text, text, integer) TO service_role;