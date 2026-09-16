-- Packability contract v1 (additive, backwards compatible).
-- Existing product/order/packing rows remain packable. Packability changes do
-- not mutate price, invoice, reservation quantity or commercial order data.

ALTER TABLE public.booking_products
  ADD COLUMN IF NOT EXISTS product_packable_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS packability_override boolean,
  ADD COLUMN IF NOT EXISTS is_packable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS packability_source text NOT NULL DEFAULT 'product_default',
  ADD COLUMN IF NOT EXISTS packability_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packability_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS packability_updated_by uuid;

ALTER TABLE public.booking_products
  DROP CONSTRAINT IF EXISTS booking_products_packability_source_check;
ALTER TABLE public.booking_products
  ADD CONSTRAINT booking_products_packability_source_check
  CHECK (packability_source IN ('product_default', 'booking_override', 'warehouse_override'));

ALTER TABLE public.packing_list_items
  ADD COLUMN IF NOT EXISTS product_packable_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_packability_override boolean,
  ADD COLUMN IF NOT EXISTS warehouse_packability_override boolean,
  ADD COLUMN IF NOT EXISTS is_packable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS packability_source text NOT NULL DEFAULT 'product_default',
  ADD COLUMN IF NOT EXISTS packability_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packability_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS packability_updated_by uuid;

ALTER TABLE public.packing_list_items
  DROP CONSTRAINT IF EXISTS packing_list_items_packability_source_check;
ALTER TABLE public.packing_list_items
  ADD CONSTRAINT packing_list_items_packability_source_check
  CHECK (packability_source IN ('product_default', 'booking_override', 'warehouse_override'));

CREATE INDEX IF NOT EXISTS packing_list_items_packable_lookup_idx
  ON public.packing_list_items (organization_id, packing_id, is_packable)
  WHERE excluded IS DISTINCT FROM true;

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

DROP POLICY IF EXISTS packing_packability_events_select_org
  ON public.packing_packability_events;
CREATE POLICY packing_packability_events_select_org
  ON public.packing_packability_events
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.packing_packability_events
  FROM anon, authenticated;
GRANT SELECT ON public.packing_packability_events TO authenticated;

CREATE OR REPLACE FUNCTION public.set_packing_list_item_packability(
  _packing_id uuid,
  _organization_id uuid,
  _item_id uuid,
  _warehouse_override boolean,
  _operation_id uuid,
  _expected_revision bigint,
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
  v_effective boolean;
  v_source text;
  v_revision bigint;
  v_changed integer := 0;
  v_receipt jsonb;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'operation_id_required';
  END IF;
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  -- Serialize retries carrying the same idempotency key so concurrent network
  -- retries return one receipt instead of racing the unique constraint.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_organization_id::text || ':' || _operation_id::text, 0)
  );

  SELECT * INTO v_existing_event
  FROM public.packing_packability_events
  WHERE organization_id = _organization_id AND operation_id = _operation_id;
  IF v_existing_event.id IS NOT NULL THEN
    IF v_existing_event.packing_id IS DISTINCT FROM _packing_id
       OR v_existing_event.packing_list_item_id IS DISTINCT FROM _item_id
       OR v_existing_event.new_warehouse_override IS DISTINCT FROM _warehouse_override THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing_event.receipt;
  END IF;

  -- The RPC is service-only; actor provenance still has to prove membership
  -- and a warehouse-capable role in the exact tenant.
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
  IF lower(v_status) NOT IN ('planning', 'in_progress') THEN
    RAISE EXCEPTION 'packing_not_editable';
  END IF;

  SELECT * INTO v_item
  FROM public.packing_list_items
  WHERE id = _item_id
    AND packing_id = _packing_id
    AND organization_id = _organization_id
  FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;

  IF _expected_revision IS NOT NULL
     AND v_item.packability_revision <> _expected_revision THEN
    RAISE EXCEPTION 'revision_conflict';
  END IF;

  v_effective := COALESCE(
    _warehouse_override,
    v_item.booking_packability_override,
    v_item.product_packable_default,
    true
  );
  v_source := CASE
    WHEN _warehouse_override IS NOT NULL THEN 'warehouse_override'
    WHEN v_item.booking_packability_override IS NOT NULL THEN 'booking_override'
    ELSE 'product_default'
  END;

  -- Never make already handled physical work disappear from completion.
  IF v_item.is_packable IS DISTINCT FROM false
     AND v_effective = false
     AND (
       COALESCE(v_item.quantity_packed, 0) > 0
       OR v_item.parcel_id IS NOT NULL
       OR v_item.packed_at IS NOT NULL
       OR v_item.verified_at IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM public.packing_list_item_allocations a
         WHERE a.packing_list_item_id = v_item.id
           AND a.organization_id = _organization_id
       )
     ) THEN
    RAISE EXCEPTION 'row_touched';
  END IF;

  IF v_item.warehouse_packability_override IS DISTINCT FROM _warehouse_override
     OR v_item.is_packable IS DISTINCT FROM v_effective
     OR v_item.packability_source IS DISTINCT FROM v_source THEN
    v_changed := 1;
    v_revision := v_item.packability_revision + 1;
    UPDATE public.packing_list_items
    SET warehouse_packability_override = _warehouse_override,
        is_packable = v_effective,
        packability_source = v_source,
        packability_revision = v_revision,
        packability_updated_at = now(),
        packability_updated_by = _actor_id
    WHERE id = v_item.id;
  ELSE
    v_revision := v_item.packability_revision;
  END IF;

  v_receipt := jsonb_build_object(
    'ok', true,
    'operation_id', _operation_id,
    'item_id', v_item.id,
    'affected_item_ids', jsonb_build_array(v_item.id),
    'affected_count', 1,
    'changed_count', v_changed,
    'warehouse_packability_override', _warehouse_override,
    'is_packable', v_effective,
    'packability_source', v_source,
    'packability_revision', v_revision,
    'booking_unchanged', true
  );

  INSERT INTO public.packing_packability_events (
    organization_id, operation_id, packing_id, packing_list_item_id,
    actor_id, actor_name, source, old_warehouse_override,
    new_warehouse_override, old_is_packable, new_is_packable,
    old_revision, new_revision, receipt
  ) VALUES (
    _organization_id, _operation_id, _packing_id, v_item.id,
    _actor_id, NULLIF(_actor_name, ''), 'warehouse_web',
    v_item.warehouse_packability_override, _warehouse_override,
    v_item.is_packable, v_effective,
    v_item.packability_revision, v_revision, v_receipt
  );

  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.set_packing_list_item_packability(
  uuid, uuid, uuid, boolean, uuid, bigint, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_packing_list_item_packability(
  uuid, uuid, uuid, boolean, uuid, bigint, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.set_packing_list_item_packability(
  uuid, uuid, uuid, boolean, uuid, bigint, text, uuid
) IS 'Service-only, tenant/role-verified, idempotent warehouse override boundary. NULL resets the warehouse override.';
