ALTER TABLE public.booking_source_state
  ADD COLUMN IF NOT EXISTS products_repaired_source_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_booking_products_pending(
  p_organization_id uuid, p_booking_id text, p_reservation_token uuid,
  p_pending boolean, p_reason text DEFAULT NULL, p_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.booking_source_state%ROWTYPE; v_had_partial boolean;
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
  v_had_partial := EXISTS (SELECT 1 FROM public.booking_delivery_scope_receipts
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id AND scope = 'partial'
      AND source_updated_at = v_row.pending_source_updated_at);
  IF v_row.products_pending_at IS NULL AND NOT v_had_partial THEN RETURN jsonb_build_object('decision', 'unchanged'); END IF;
  UPDATE public.booking_source_state SET products_pending_source_updated_at = NULL, products_pending_source_version = NULL,
    products_pending_source_status = NULL, products_pending_reason = NULL, products_pending_code = NULL, products_pending_at = NULL,
    products_repaired_source_updated_at = CASE WHEN v_had_partial THEN v_row.pending_source_updated_at ELSE products_repaired_source_updated_at END,
    updated_at = now()
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
  RETURN jsonb_build_object('decision', 'cleared');
END $$;

CREATE OR REPLACE FUNCTION public.reserve_booking_product_repair(
  p_organization_id uuid, p_booking_id text, p_source_updated_at timestamptz,
  p_source_version bigint, p_source_status text, p_owner_job_id text DEFAULT NULL, p_lease_seconds integer DEFAULT 300
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.booking_source_state%ROWTYPE; v_status text := upper(nullif(btrim(coalesce(p_source_status, '')), ''));
  v_token uuid; v_lease integer := greatest(coalesce(p_lease_seconds, 300), 30); v_marker boolean; v_receipts boolean;
BEGIN
  IF p_organization_id IS NULL OR nullif(btrim(coalesce(p_booking_id,'')),'') IS NULL OR v_status IS NULL
     OR (p_source_updated_at IS NULL AND p_source_version IS NULL) THEN RETURN jsonb_build_object('decision', 'invalid_input'); END IF;
  SELECT * INTO v_row FROM public.booking_source_state WHERE organization_id = p_organization_id AND booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_current'); END IF;
  IF v_row.lock_token IS NOT NULL AND v_row.lock_expires_at > now() THEN RETURN jsonb_build_object('decision', 'booking_import_locked'); END IF;
  IF v_row.applied_source_updated_at IS DISTINCT FROM p_source_updated_at OR v_row.applied_source_version IS DISTINCT FROM p_source_version
     OR v_row.applied_source_status IS DISTINCT FROM v_status THEN RETURN jsonb_build_object('decision', 'not_current'); END IF;
  v_marker := v_row.products_pending_at IS NOT NULL
     AND v_row.products_pending_source_updated_at IS NOT DISTINCT FROM p_source_updated_at
     AND v_row.products_pending_source_version IS NOT DISTINCT FROM p_source_version
     AND v_row.products_pending_source_status IS NOT DISTINCT FROM v_status;
  v_receipts := p_source_updated_at IS NOT NULL
     AND v_row.products_repaired_source_updated_at IS DISTINCT FROM p_source_updated_at
     AND EXISTS (SELECT 1 FROM public.booking_delivery_scope_receipts WHERE organization_id = p_organization_id
                 AND booking_id = p_booking_id AND scope = 'partial' AND source_updated_at = p_source_updated_at)
     AND EXISTS (SELECT 1 FROM public.booking_delivery_scope_receipts WHERE organization_id = p_organization_id
                 AND booking_id = p_booking_id AND scope = 'full' AND source_updated_at = p_source_updated_at);
  IF NOT (v_marker OR v_receipts) THEN RETURN jsonb_build_object('decision', 'not_pending'); END IF;
  v_token := gen_random_uuid();
  UPDATE public.booking_source_state SET pending_source_updated_at = p_source_updated_at, pending_source_version = p_source_version,
    pending_source_status = v_status, pending_started_at = now(), lock_token = v_token, lock_owner_job_id = p_owner_job_id,
    lock_acquired_at = now(), lock_expires_at = now() + make_interval(secs => v_lease), updated_at = now()
  WHERE organization_id = p_organization_id AND booking_id = p_booking_id;
  RETURN jsonb_build_object('decision', 'reserved', 'reservation_token', v_token, 'lock_expires_at', now() + make_interval(secs => v_lease));
END $$;

REVOKE ALL ON FUNCTION public.set_booking_products_pending(uuid, text, uuid, boolean, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_booking_product_repair(uuid, text, timestamptz, bigint, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_booking_products_pending(uuid, text, uuid, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_booking_product_repair(uuid, text, timestamptz, bigint, text, text, integer) TO service_role;