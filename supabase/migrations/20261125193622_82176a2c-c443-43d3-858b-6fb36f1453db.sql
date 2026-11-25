CREATE TABLE public.booking_delivery_scope_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  booking_id text NOT NULL,
  event_id text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  scope text NOT NULL CHECK (scope IN ('partial','full')),
  wms_code text,
  job_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, booking_id, event_id, scope)
);
CREATE INDEX booking_delivery_scope_receipts_rev_idx
  ON public.booking_delivery_scope_receipts (organization_id, booking_id, scope, source_updated_at);
GRANT ALL ON public.booking_delivery_scope_receipts TO service_role;
ALTER TABLE public.booking_delivery_scope_receipts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.booking_delivery_scope_receipts IS
  'Revision-bound Sales delivery receipts (partial=schedule_metadata/WMS not accepted, full=verified full snapshot). Product write mandate source.';

CREATE OR REPLACE FUNCTION public.enqueue_booking_sync_job_scoped(
  p_booking_id text, p_organization_id text, p_event_type text, p_priority integer,
  p_scope text, p_event_id text, p_source_updated_at timestamptz, p_wms_code text DEFAULT NULL
) RETURNS TABLE(job_id uuid, job_status text, job_event_type text, job_priority smallint, coalesced boolean, receipt text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_receipt text := 'none'; v_rows integer;
BEGIN
  IF p_scope NOT IN ('partial','full','neutral') THEN RAISE EXCEPTION 'invalid scope %', p_scope; END IF;
  IF p_scope <> 'neutral' AND (nullif(btrim(coalesce(p_event_id,'')),'') IS NULL OR p_source_updated_at IS NULL) THEN
    RAISE EXCEPTION 'scoped delivery requires event_id and source_updated_at';
  END IF;
  SELECT * INTO r FROM public.enqueue_booking_sync_job(p_booking_id, p_organization_id, p_event_type, p_priority);
  IF p_scope <> 'neutral' THEN
    INSERT INTO public.booking_delivery_scope_receipts
      (organization_id, booking_id, event_id, source_updated_at, scope, wms_code, job_id)
    VALUES (p_organization_id::uuid, p_booking_id, p_event_id, p_source_updated_at, p_scope, p_wms_code, r.job_id)
    ON CONFLICT (organization_id, booking_id, event_id, scope) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_receipt := CASE WHEN v_rows > 0 THEN p_scope || '_recorded' ELSE p_scope || '_replay' END;
  END IF;
  RETURN QUERY SELECT r.job_id, r.job_status, r.job_event_type, r.job_priority, r.coalesced, v_receipt;
END $$;

CREATE OR REPLACE FUNCTION public.product_write_mandate(
  p_organization_id uuid, p_booking_id text, p_source_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.booking_delivery_scope_receipts
                 WHERE organization_id = p_organization_id AND booking_id = p_booking_id AND scope = 'partial') THEN
    RETURN jsonb_build_object('decision','allowed_legacy','allowed',true);
  END IF;
  IF p_source_updated_at IS NULL THEN
    RETURN jsonb_build_object('decision','deferred_invalid_revision','allowed',false);
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_delivery_scope_receipts
             WHERE organization_id = p_organization_id AND booking_id = p_booking_id
               AND scope = 'full' AND source_updated_at = p_source_updated_at) THEN
    RETURN jsonb_build_object('decision','allowed_exact_full','allowed',true);
  END IF;
  SELECT p.wms_code INTO v_code FROM public.booking_delivery_scope_receipts p
   WHERE p.organization_id = p_organization_id AND p.booking_id = p_booking_id AND p.scope = 'partial'
     AND NOT EXISTS (SELECT 1 FROM public.booking_delivery_scope_receipts f
                     WHERE f.organization_id = p.organization_id AND f.booking_id = p.booking_id
                       AND f.scope = 'full' AND f.source_updated_at >= p.source_updated_at)
   ORDER BY p.source_updated_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('decision','deferred_partial','allowed',false,'code',v_code);
  END IF;
  RETURN jsonb_build_object('decision','deferred_no_mandate','allowed',false);
END $$;

CREATE OR REPLACE FUNCTION public.product_scope_tracked_bookings(p_organization_id uuid)
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT booking_id FROM public.booking_delivery_scope_receipts
  WHERE organization_id = p_organization_id AND scope = 'partial'
$$;

REVOKE ALL ON FUNCTION public.enqueue_booking_sync_job_scoped(text,text,text,integer,text,text,timestamptz,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_write_mandate(uuid,text,timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_scope_tracked_bookings(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_booking_sync_job_scoped(text,text,text,integer,text,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.product_write_mandate(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.product_scope_tracked_bookings(uuid) TO service_role;