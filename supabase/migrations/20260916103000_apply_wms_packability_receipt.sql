-- WMS-first warehouse packability projection.
-- The canonical reservation line is mutated before this RPC is called. This
-- function accepts only a verified upstream receipt and atomically projects it
-- to Planning with tenant, identity, revision, touched-row and audit guards.

ALTER TABLE public.packing_list_items
  ADD COLUMN IF NOT EXISTS product_packable_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_packability_override boolean,
  ADD COLUMN IF NOT EXISTS warehouse_packability_override boolean,
  ADD COLUMN IF NOT EXISTS is_packable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS packability_source text NOT NULL DEFAULT 'product_default',
  ADD COLUMN IF NOT EXISTS packability_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packability_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS packability_updated_by uuid;

CREATE TABLE IF NOT EXISTS public.packing_packability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  operation_id uuid NOT NULL,
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  packing_list_item_id uuid NOT NULL REFERENCES public.packing_list_items(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  actor_name text,
  source text NOT NULL CHECK (source IN ('warehouse_web', 'booking_sync', 'wms_sync')),
  old_warehouse_override boolean,
  new_warehouse_override boolean,
  old_is_packable boolean NOT NULL,
  new_is_packable boolean NOT NULL,
  old_revision bigint NOT NULL,
  new_revision bigint NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, operation_id)
);

ALTER TABLE public.packing_packability_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.packing_packability_events FROM anon, authenticated;

-- An older local-first RPC must never be callable by a browser. Keep it only
-- for service compatibility if another migration created it.
DO $$
BEGIN
  IF to_regprocedure('public.set_packing_list_item_packability(uuid,uuid,uuid,boolean,uuid,bigint,text,uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_packing_list_item_packability(uuid,uuid,uuid,boolean,uuid,bigint,text,uuid) FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_wms_packability_receipt(
  _packing_id uuid,
  _organization_id uuid,
  _item_id uuid,
  _wms_line_id text,
  _requested_override boolean,
  _operation_id uuid,
  _expected_local_revision bigint,
  _wms_receipt jsonb,
  _actor_name text,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_event public.packing_packability_events%ROWTYPE;
  v_status text;
  v_item public.packing_list_items%ROWTYPE;
  v_receipt_override boolean;
  v_receipt_product_default boolean;
  v_receipt_booking_override boolean;
  v_receipt_is_packable boolean;
  v_receipt_source text;
  v_receipt_revision bigint;
  v_receipt_updated_at timestamptz;
  v_projection_receipt jsonb;
BEGIN
  IF _operation_id IS NULL OR _actor_id IS NULL THEN RAISE EXCEPTION 'operation_id_required'; END IF;
  IF _wms_line_id IS NULL OR btrim(_wms_line_id) = '' THEN RAISE EXCEPTION 'wms_line_id_missing'; END IF;
  IF _expected_local_revision IS NULL OR _expected_local_revision < 1 THEN RAISE EXCEPTION 'invalid_expected_revision'; END IF;
  IF _wms_receipt IS NULL OR jsonb_typeof(_wms_receipt) <> 'object' THEN RAISE EXCEPTION 'verification_failed'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_organization_id::text || ':' || _operation_id::text, 0));

  SELECT * INTO v_existing_event
  FROM public.packing_packability_events
  WHERE organization_id = _organization_id AND operation_id = _operation_id;
  IF v_existing_event.id IS NOT NULL THEN
    IF v_existing_event.packing_id IS DISTINCT FROM _packing_id
       OR v_existing_event.packing_list_item_id IS DISTINCT FROM _item_id
       OR v_existing_event.new_warehouse_override IS DISTINCT FROM _requested_override THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing_event.receipt;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _actor_id
      AND ur.organization_id = _organization_id
      AND ur.role IN ('admin'::public.app_role, 'lager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status INTO v_status
  FROM public.packing_projects
  WHERE id = _packing_id AND organization_id = _organization_id
  FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'packing_not_found'; END IF;
  IF lower(v_status) NOT IN ('planning', 'in_progress') THEN RAISE EXCEPTION 'packing_not_editable'; END IF;

  SELECT * INTO v_item
  FROM public.packing_list_items
  WHERE id = _item_id AND packing_id = _packing_id AND organization_id = _organization_id
  FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
  IF v_item.wms_line_id IS NULL OR v_item.wms_line_id IS DISTINCT FROM _wms_line_id THEN
    RAISE EXCEPTION 'wms_line_id_missing';
  END IF;
  IF v_item.packability_revision IS DISTINCT FROM _expected_local_revision THEN
    RAISE EXCEPTION 'local_projection_conflict';
  END IF;

  -- Validate identity and every projected value. No value is recomputed locally.
  IF _wms_receipt->>'operation_id' IS DISTINCT FROM _operation_id::text
     OR _wms_receipt->>'line_id' IS DISTINCT FROM _wms_line_id
     OR NOT (_wms_receipt ? 'product_packable_default')
     OR NOT (_wms_receipt ? 'booking_packability_override')
     OR NOT (_wms_receipt ? 'warehouse_packability_override')
     OR NOT (_wms_receipt ? 'is_packable')
     OR NOT (_wms_receipt ? 'packability_source')
     OR NOT (_wms_receipt ? 'packability_revision')
     OR NOT (_wms_receipt ? 'updated_at')
     OR NOT (_wms_receipt ? 'idempotent') THEN
    RAISE EXCEPTION 'verification_failed';
  END IF;

  IF jsonb_typeof(_wms_receipt->'product_packable_default') <> 'boolean'
     OR jsonb_typeof(_wms_receipt->'is_packable') <> 'boolean'
     OR jsonb_typeof(_wms_receipt->'packability_revision') <> 'number'
     OR jsonb_typeof(_wms_receipt->'updated_at') <> 'string'
     OR jsonb_typeof(_wms_receipt->'idempotent') <> 'boolean'
     OR jsonb_typeof(_wms_receipt->'booking_packability_override') NOT IN ('boolean', 'null')
     OR jsonb_typeof(_wms_receipt->'warehouse_packability_override') NOT IN ('boolean', 'null') THEN
    RAISE EXCEPTION 'verification_failed';
  END IF;

  v_receipt_product_default := (_wms_receipt->>'product_packable_default')::boolean;
  v_receipt_booking_override := CASE WHEN jsonb_typeof(_wms_receipt->'booking_packability_override') = 'null' THEN NULL ELSE (_wms_receipt->>'booking_packability_override')::boolean END;
  v_receipt_override := CASE WHEN jsonb_typeof(_wms_receipt->'warehouse_packability_override') = 'null' THEN NULL ELSE (_wms_receipt->>'warehouse_packability_override')::boolean END;
  v_receipt_is_packable := (_wms_receipt->>'is_packable')::boolean;
  v_receipt_source := _wms_receipt->>'packability_source';
  v_receipt_revision := (_wms_receipt->>'packability_revision')::bigint;
  v_receipt_updated_at := (_wms_receipt->>'updated_at')::timestamptz;

  IF v_receipt_override IS DISTINCT FROM _requested_override
     OR v_receipt_source NOT IN ('product_default', 'booking_override', 'warehouse_override')
     OR v_receipt_revision < _expected_local_revision
     OR v_receipt_revision > _expected_local_revision + 1
     OR (_requested_override IS NOT NULL AND v_receipt_is_packable IS DISTINCT FROM _requested_override)
     OR (_requested_override IS NOT NULL AND v_receipt_source <> 'warehouse_override') THEN
    RAISE EXCEPTION 'verification_failed';
  END IF;

  IF v_item.is_packable IS DISTINCT FROM false
     AND v_receipt_is_packable = false
     AND (
       COALESCE(v_item.quantity_packed, 0) > 0
       OR v_item.parcel_id IS NOT NULL
       OR v_item.packed_at IS NOT NULL
       OR v_item.verified_at IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM public.packing_list_item_allocations a
         WHERE a.packing_list_item_id = v_item.id AND a.organization_id = _organization_id
       )
     ) THEN
    RAISE EXCEPTION 'row_touched';
  END IF;

  UPDATE public.packing_list_items
  SET product_packable_default = v_receipt_product_default,
      booking_packability_override = v_receipt_booking_override,
      warehouse_packability_override = v_receipt_override,
      is_packable = v_receipt_is_packable,
      packability_source = v_receipt_source,
      packability_revision = v_receipt_revision,
      packability_updated_at = v_receipt_updated_at,
      packability_updated_by = _actor_id
  WHERE id = v_item.id AND packing_id = _packing_id AND organization_id = _organization_id;

  v_projection_receipt := jsonb_build_object(
    'ok', true,
    'operation_id', _operation_id,
    'item_id', v_item.id,
    'wms_line_id', _wms_line_id,
    'affected_item_ids', jsonb_build_array(v_item.id),
    'affected_count', 1,
    'changed_count', CASE WHEN v_item.product_packable_default IS DISTINCT FROM v_receipt_product_default
      OR v_item.booking_packability_override IS DISTINCT FROM v_receipt_booking_override
      OR v_item.warehouse_packability_override IS DISTINCT FROM v_receipt_override
      OR v_item.is_packable IS DISTINCT FROM v_receipt_is_packable
      OR v_item.packability_source IS DISTINCT FROM v_receipt_source
      OR v_item.packability_revision IS DISTINCT FROM v_receipt_revision THEN 1 ELSE 0 END,
    'product_packable_default', v_receipt_product_default,
    'booking_packability_override', v_receipt_booking_override,
    'warehouse_packability_override', v_receipt_override,
    'is_packable', v_receipt_is_packable,
    'packability_source', v_receipt_source,
    'packability_revision', v_receipt_revision,
    'updated_at', v_receipt_updated_at,
    'upstream_idempotent', COALESCE((_wms_receipt->>'idempotent')::boolean, false),
    'booking_unchanged', true
  );

  INSERT INTO public.packing_packability_events (
    organization_id, operation_id, packing_id, packing_list_item_id,
    actor_id, actor_name, source, old_warehouse_override, new_warehouse_override,
    old_is_packable, new_is_packable, old_revision, new_revision, receipt
  ) VALUES (
    _organization_id, _operation_id, _packing_id, v_item.id,
    _actor_id, NULLIF(_actor_name, ''), 'warehouse_web',
    v_item.warehouse_packability_override, v_receipt_override,
    v_item.is_packable, v_receipt_is_packable,
    v_item.packability_revision, v_receipt_revision, v_projection_receipt
  );

  RETURN v_projection_receipt;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'verification_failed';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_wms_packability_receipt(
  uuid, uuid, uuid, text, boolean, uuid, bigint, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wms_packability_receipt(
  uuid, uuid, uuid, text, boolean, uuid, bigint, jsonb, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.apply_wms_packability_receipt(
  uuid, uuid, uuid, text, boolean, uuid, bigint, jsonb, text, uuid
) IS 'Service-only projection of a verified canonical WMS packability receipt; never a local source of truth.';
