-- EventFlow Scanner: idempotent, tenant-scoped parcel commands.
-- Parcel metadata remains in Planning; physical picked quantity remains Bundle/WMS truth.
-- Every mutation requires fresh Bundle evidence supplied by the trusted Scanner edge gateway.

ALTER TABLE public.packing_parcels
  ADD COLUMN IF NOT EXISTS scanner_state text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS sealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sealed_by_staff_id text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'packing_parcels_scanner_state_check'
      AND conrelid = 'public.packing_parcels'::regclass
  ) THEN
    ALTER TABLE public.packing_parcels
      ADD CONSTRAINT packing_parcels_scanner_state_check
      CHECK (scanner_state IN ('OPEN', 'SEALED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.scanner_parcel_operations (
  organization_id uuid NOT NULL,
  operation_id text NOT NULL,
  request_fingerprint text NOT NULL,
  command text NOT NULL,
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  device_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMMITTED', 'REJECTED')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (organization_id, operation_id),
  CHECK (operation_id ~ '^op-[0-9a-fA-F-]{36}$'),
  CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS scanner_parcel_operations_packing_idx
  ON public.scanner_parcel_operations (organization_id, packing_id, created_at DESC);

ALTER TABLE public.scanner_parcel_operations ENABLE ROW LEVEL SECURITY;
-- No authenticated policy is intentional. The table is an internal operation ledger;
-- the service-role Scanner gateway is the only caller and bypasses RLS.

CREATE OR REPLACE FUNCTION public.scanner_parcel_projection_v1(
  p_organization_id uuid,
  p_packing_id uuid,
  p_booking_id text,
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'packingId', p_packing_id,
    'bookingId', p_booking_id,
    'reservationId', p_reservation_id,
    'parcels', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'parcelId', p.id,
          'parcelNumber', p.parcel_number,
          'label', CONCAT('Kolli ', p.parcel_number),
          'state', p.scanner_state,
          'sealedAt', p.sealed_at,
          'allocations', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'packingListItemId', a.packing_list_item_id,
                'quantity', a.quantity
              )
              ORDER BY a.created_at, a.id
            )
            FROM public.packing_list_item_allocations a
            WHERE a.organization_id = p_organization_id
              AND a.parcel_id = p.id
          ), '[]'::jsonb)
        )
        ORDER BY p.parcel_number, p.id
      )
      FROM public.packing_parcels p
      WHERE p.organization_id = p_organization_id
        AND p.packing_id = p_packing_id
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.scanner_parcel_command_v1(
  p_organization_id uuid,
  p_operation_id text,
  p_request_fingerprint text,
  p_command text,
  p_packing_id uuid,
  p_booking_id text,
  p_reservation_id uuid,
  p_actor_id text,
  p_device_id text,
  p_occurred_at timestamptz,
  p_parcel_id uuid DEFAULT NULL,
  p_packing_list_item_id uuid DEFAULT NULL,
  p_quantity integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_bundle_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_existing public.scanner_parcel_operations%ROWTYPE;
  v_packing public.packing_projects%ROWTYPE;
  v_parcel public.packing_parcels%ROWTYPE;
  v_item public.packing_list_items%ROWTYPE;
  v_next_number integer;
  v_current_allocated integer := 0;
  v_pair_allocated integer := 0;
  v_remaining integer := 0;
  v_bundle_picked integer := 0;
  v_response jsonb;
  v_projection jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_operation_id !~ '^op-[0-9a-fA-F-]{36}$' THEN
    RETURN jsonb_build_object('outcome', 'REJECTED', 'message', 'invalid_operation_id');
  END IF;
  IF p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('outcome', 'REJECTED', 'message', 'invalid_fingerprint');
  END IF;
  IF p_command NOT IN ('CREATE_PARCEL', 'ASSIGN_ITEM', 'UNASSIGN_ITEM', 'SEAL_PARCEL', 'REOPEN_PARCEL') THEN
    RETURN jsonb_build_object('outcome', 'REJECTED', 'message', 'invalid_command');
  END IF;
  IF COALESCE(btrim(p_actor_id), '') = '' OR COALESCE(btrim(p_device_id), '') = '' THEN
    RETURN jsonb_build_object('outcome', 'REJECTED', 'message', 'missing_actor_or_device');
  END IF;

  INSERT INTO public.scanner_parcel_operations (
    organization_id, operation_id, request_fingerprint, command, packing_id, actor_id, device_id
  ) VALUES (
    p_organization_id, lower(p_operation_id), p_request_fingerprint, p_command,
    p_packing_id, p_actor_id, p_device_id
  )
  ON CONFLICT (organization_id, operation_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT * INTO v_existing
    FROM public.scanner_parcel_operations
    WHERE organization_id = p_organization_id
      AND operation_id = lower(p_operation_id)
    FOR UPDATE;

    IF v_existing.request_fingerprint <> p_request_fingerprint THEN
      RETURN jsonb_build_object('outcome', 'REJECTED', 'message', 'operation_id_conflict');
    END IF;
    IF v_existing.status IN ('COMMITTED', 'REJECTED') AND v_existing.response IS NOT NULL THEN
      RETURN v_existing.response || jsonb_build_object('replay', true);
    END IF;
    RETURN jsonb_build_object('outcome', 'UNKNOWN', 'message', 'operation_pending');
  END IF;

  SELECT * INTO v_packing
  FROM public.packing_projects
  WHERE id = p_packing_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_packing.id IS NULL OR v_packing.booking_id IS DISTINCT FROM p_booking_id THEN
    v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'packing_identity_mismatch');
    UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
      WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
    RETURN v_response;
  END IF;

  -- Trusted edge gateway must bind every parcel mutation to current Bundle/WMS evidence.
  IF COALESCE((p_bundle_evidence->>'verified')::boolean, false) IS NOT TRUE
     OR p_bundle_evidence->>'booking_id' IS DISTINCT FROM p_booking_id
     OR p_bundle_evidence->>'reservation_id' IS DISTINCT FROM p_reservation_id::text
     OR COALESCE(p_bundle_evidence->>'snapshot_fingerprint', '') !~ '^[0-9a-f]{64}$' THEN
    v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'wms_evidence_required');
    UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
      WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
    RETURN v_response;
  END IF;

  IF p_command = 'CREATE_PARCEL' THEN
    SELECT COALESCE(MAX(parcel_number), 0) + 1 INTO v_next_number
    FROM public.packing_parcels
    WHERE packing_id = p_packing_id AND organization_id = p_organization_id;

    INSERT INTO public.packing_parcels (
      packing_id, parcel_number, created_by, organization_id, created_by_staff_id, scanner_state
    ) VALUES (
      p_packing_id, v_next_number, p_actor_id, p_organization_id, p_actor_id, 'OPEN'
    ) RETURNING * INTO v_parcel;

  ELSIF p_command IN ('ASSIGN_ITEM', 'UNASSIGN_ITEM') THEN
    IF p_parcel_id IS NULL OR p_packing_list_item_id IS NULL OR p_quantity IS NULL OR p_quantity < 1 THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'parcel_item_quantity_required');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;

    SELECT * INTO v_parcel
    FROM public.packing_parcels
    WHERE id = p_parcel_id
      AND packing_id = p_packing_id
      AND organization_id = p_organization_id
    FOR UPDATE;
    IF v_parcel.id IS NULL THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'parcel_not_found');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;
    IF v_parcel.scanner_state <> 'OPEN' THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'parcel_sealed');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;

    SELECT * INTO v_item
    FROM public.packing_list_items
    WHERE id = p_packing_list_item_id
      AND packing_id = p_packing_id
      AND organization_id = p_organization_id
      AND COALESCE(excluded, false) = false
    FOR UPDATE;
    IF v_item.id IS NULL OR v_item.wms_item_type_id IS NULL OR v_item.wms_line_id IS NULL THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'item_wms_identity_missing');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;

    IF p_bundle_evidence->>'packing_list_item_id' IS DISTINCT FROM p_packing_list_item_id::text
       OR p_bundle_evidence->>'item_type_id' IS DISTINCT FROM v_item.wms_item_type_id::text
       OR p_bundle_evidence->>'wms_line_id' IS DISTINCT FROM v_item.wms_line_id THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'wms_item_evidence_mismatch');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;

    BEGIN
      v_bundle_picked := (p_bundle_evidence->>'quantity_picked')::integer;
    EXCEPTION WHEN others THEN
      v_bundle_picked := -1;
    END;
    IF v_bundle_picked < 0 THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'wms_picked_quantity_missing');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;

    SELECT COALESCE(SUM(quantity), 0)::integer INTO v_current_allocated
    FROM public.packing_list_item_allocations
    WHERE organization_id = p_organization_id
      AND packing_list_item_id = p_packing_list_item_id;

    SELECT COALESCE(SUM(quantity), 0)::integer INTO v_pair_allocated
    FROM public.packing_list_item_allocations
    WHERE organization_id = p_organization_id
      AND packing_list_item_id = p_packing_list_item_id
      AND parcel_id = p_parcel_id;

    IF p_command = 'ASSIGN_ITEM' THEN
      IF v_current_allocated + p_quantity > v_bundle_picked THEN
        v_response := jsonb_build_object(
          'outcome', 'REJECTED', 'message', 'parcel_allocation_exceeds_wms_picked',
          'wmsPicked', v_bundle_picked, 'allocated', v_current_allocated
        );
        UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
          WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
        RETURN v_response;
      END IF;
      INSERT INTO public.packing_list_item_allocations (
        packing_list_item_id, parcel_id, quantity, scanned_by, organization_id
      ) VALUES (
        p_packing_list_item_id, p_parcel_id, p_quantity, p_actor_id, p_organization_id
      );
      UPDATE public.packing_list_items
        SET parcel_id = p_parcel_id
        WHERE id = p_packing_list_item_id AND organization_id = p_organization_id;
    ELSE
      IF p_quantity > v_pair_allocated THEN
        v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'parcel_unassign_exceeds_allocation');
        UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
          WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
        RETURN v_response;
      END IF;

      v_remaining := v_pair_allocated - p_quantity;
      DELETE FROM public.packing_list_item_allocations
      WHERE organization_id = p_organization_id
        AND packing_list_item_id = p_packing_list_item_id
        AND parcel_id = p_parcel_id;
      IF v_remaining > 0 THEN
        INSERT INTO public.packing_list_item_allocations (
          packing_list_item_id, parcel_id, quantity, scanned_by, organization_id
        ) VALUES (
          p_packing_list_item_id, p_parcel_id, v_remaining, p_actor_id, p_organization_id
        );
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.packing_list_item_allocations
        WHERE organization_id = p_organization_id
          AND packing_list_item_id = p_packing_list_item_id
      ) THEN
        UPDATE public.packing_list_items
          SET parcel_id = NULL
          WHERE id = p_packing_list_item_id AND organization_id = p_organization_id;
      END IF;
    END IF;

  ELSIF p_command = 'SEAL_PARCEL' THEN
    IF p_parcel_id IS NULL THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'parcel_required');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;
    SELECT * INTO v_parcel FROM public.packing_parcels
      WHERE id=p_parcel_id AND packing_id=p_packing_id AND organization_id=p_organization_id FOR UPDATE;
    IF v_parcel.id IS NULL THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'parcel_not_found');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.packing_list_item_allocations
      WHERE organization_id=p_organization_id AND parcel_id=p_parcel_id AND quantity > 0
    ) THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'empty_parcel');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;
    UPDATE public.packing_parcels
      SET scanner_state='SEALED', sealed_at=now(), sealed_by_staff_id=p_actor_id
      WHERE id=p_parcel_id AND organization_id=p_organization_id;

  ELSIF p_command = 'REOPEN_PARCEL' THEN
    IF p_parcel_id IS NULL OR length(btrim(COALESCE(p_reason, ''))) < 3 THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'reopen_reason_required');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;
    SELECT * INTO v_parcel FROM public.packing_parcels
      WHERE id=p_parcel_id AND packing_id=p_packing_id AND organization_id=p_organization_id FOR UPDATE;
    IF v_parcel.id IS NULL THEN
      v_response := jsonb_build_object('outcome', 'REJECTED', 'message', 'parcel_not_found');
      UPDATE public.scanner_parcel_operations SET status='REJECTED', response=v_response, completed_at=now()
        WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
      RETURN v_response;
    END IF;
    UPDATE public.packing_parcels
      SET scanner_state='OPEN', reopened_at=now(), reopen_reason=btrim(p_reason)
      WHERE id=p_parcel_id AND organization_id=p_organization_id;
  END IF;

  v_projection := public.scanner_parcel_projection_v1(
    p_organization_id, p_packing_id, p_booking_id, p_reservation_id
  );
  v_response := jsonb_build_object(
    'outcome', 'APPLIED',
    'message', NULL,
    'projection', v_projection,
    'serverTimestamp', now(),
    'occurredAt', p_occurred_at
  );
  UPDATE public.scanner_parcel_operations
    SET status='COMMITTED', response=v_response, completed_at=now()
    WHERE organization_id=p_organization_id AND operation_id=lower(p_operation_id);
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.scanner_parcel_projection_v1(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scanner_parcel_command_v1(uuid, text, text, text, uuid, text, uuid, text, text, timestamptz, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scanner_parcel_projection_v1(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.scanner_parcel_command_v1(uuid, text, text, text, uuid, text, uuid, text, text, timestamptz, uuid, uuid, integer, text, jsonb) TO service_role;
