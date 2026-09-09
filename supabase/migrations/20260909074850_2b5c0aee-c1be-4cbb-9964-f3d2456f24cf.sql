CREATE OR REPLACE FUNCTION public.planning_edit_packing_list_item(
  _packing_id uuid,
  _organization_id uuid,
  _item_id uuid,
  _mode text,
  _actor_name text,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_root public.packing_list_items%ROWTYPE;
  v_root_product uuid;
  v_ids uuid[];
  v_target_ids uuid[];
  v_changed_ids uuid[];
  v_blocked int;
  v_expected boolean;
  v_verify int;
  v_affected int;
BEGIN
  IF _mode NOT IN ('exclude', 'restore') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  SELECT status INTO v_status
  FROM public.packing_projects
  WHERE id = _packing_id AND organization_id = _organization_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'packing_not_found';
  END IF;
  IF v_status <> 'planning' THEN
    RAISE EXCEPTION 'packing_not_in_planning';
  END IF;

  SELECT * INTO v_root
  FROM public.packing_list_items
  WHERE id = _item_id AND packing_id = _packing_id AND organization_id = _organization_id
  FOR UPDATE;

  IF v_root.id IS NULL THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  v_root_product := v_root.booking_product_id;

  -- Expandera paketrubrik rekursivt via booking_products (endast läsning).
  -- Båda leden är scopade till organisationen.
  IF v_root_product IS NULL THEN
    v_ids := ARRAY[v_root.id];
  ELSE
    WITH RECURSIVE tree AS (
      SELECT bp.id
      FROM public.booking_products bp
      WHERE bp.id = v_root_product
        AND bp.organization_id = _organization_id
      UNION ALL
      SELECT c.id
      FROM public.booking_products c
      JOIN tree t ON c.parent_product_id = t.id
      WHERE c.organization_id = _organization_id
    )
    SELECT array_agg(pli.id)
    INTO v_ids
    FROM public.packing_list_items pli
    WHERE pli.packing_id = _packing_id
      AND pli.organization_id = _organization_id
      AND pli.booking_product_id IN (SELECT id FROM tree);
  END IF;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  -- Lås alla berörda rader.
  PERFORM 1 FROM public.packing_list_items
  WHERE id = ANY(v_ids) FOR UPDATE;

  IF _mode = 'exclude' THEN
    SELECT count(*) INTO v_blocked
    FROM public.packing_list_items pli
    WHERE pli.id = ANY(v_ids)
      AND (
        COALESCE(pli.quantity_packed, 0) > 0
        OR pli.parcel_id IS NOT NULL
        OR pli.packed_at IS NOT NULL
        OR pli.verified_at IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.packing_list_item_allocations a
          WHERE a.packing_list_item_id = pli.id
            AND a.organization_id = _organization_id
        )
      );
    IF v_blocked > 0 THEN
      RAISE EXCEPTION 'row_touched';
    END IF;

    v_target_ids := v_ids;
    v_expected := true;

    WITH upd AS (
      UPDATE public.packing_list_items
      SET excluded = true, planning_excluded_at = now()
      WHERE id = ANY(v_target_ids)
        AND (excluded IS DISTINCT FROM true OR planning_excluded_at IS NULL)
      RETURNING id
    )
    SELECT array_agg(id) INTO v_changed_ids FROM upd;
  ELSE
    -- Endast planning-exkluderade rader får återställas härifrån.
    -- WMS-/systemexkluderade rader ska inte kunna återaktiveras från Planning.
    IF v_root.planning_excluded_at IS NULL THEN
      RAISE EXCEPTION 'not_planning_excluded';
    END IF;

    SELECT array_agg(pli.id)
    INTO v_target_ids
    FROM public.packing_list_items pli
    WHERE pli.id = ANY(v_ids)
      AND pli.planning_excluded_at IS NOT NULL;

    IF v_target_ids IS NULL OR array_length(v_target_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'not_planning_excluded';
    END IF;

    v_expected := false;

    WITH upd AS (
      UPDATE public.packing_list_items
      SET excluded = false, planning_excluded_at = NULL
      WHERE id = ANY(v_target_ids)
        AND (excluded IS DISTINCT FROM false OR planning_excluded_at IS NOT NULL)
      RETURNING id
    )
    SELECT array_agg(id) INTO v_changed_ids FROM upd;
  END IF;

  -- Verifiering i samma transaktion: alla berörda rader måste ha rätt läge.
  SELECT count(*) INTO v_verify
  FROM public.packing_list_items
  WHERE id = ANY(v_target_ids)
    AND (
      excluded IS DISTINCT FROM v_expected
      OR (_mode = 'restore' AND planning_excluded_at IS NOT NULL)
      OR (_mode = 'exclude' AND planning_excluded_at IS NULL)
    );
  IF v_verify > 0 THEN
    RAISE EXCEPTION 'verification_failed';
  END IF;

  v_affected := array_length(v_target_ids, 1);

  -- Auditera endast rader vars läge faktiskt ändrades.
  IF v_changed_ids IS NOT NULL AND array_length(v_changed_ids, 1) IS NOT NULL THEN
    INSERT INTO public.packing_work_session_events (
      organization_id, packing_id, packing_list_item_id, event_type,
      quantity_delta, product_name, before_quantity, after_quantity,
      source, metadata, staff_id, staff_name
    )
    SELECT
      _organization_id,
      _packing_id,
      pli.id,
      CASE WHEN _mode = 'exclude' THEN 'planning_exclude' ELSE 'planning_restore' END,
      0,
      COALESCE(pli.manual_name, bp.name, 'Okänd produkt'),
      pli.quantity_to_pack,
      pli.quantity_to_pack,
      'planning_web',
      jsonb_build_object(
        'booking_unchanged', true,
        'root_item_id', _item_id,
        'affected_rows', v_affected,
        'actor_user_id', _actor_id
      ),
      NULL,
      COALESCE(NULLIF(_actor_name, ''), 'Planning')
    FROM public.packing_list_items pli
    LEFT JOIN public.booking_products bp ON bp.id = pli.booking_product_id
    WHERE pli.id = ANY(v_changed_ids);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mode', _mode,
    'affected_item_ids', to_jsonb(v_target_ids),
    'affected_count', v_affected,
    'changed_count', COALESCE(array_length(v_changed_ids, 1), 0),
    'booking_unchanged', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.planning_edit_packing_list_item(uuid, uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planning_edit_packing_list_item(uuid, uuid, uuid, text, text, uuid) TO service_role;