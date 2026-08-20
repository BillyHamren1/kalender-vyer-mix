-- Warehouse need lifecycle hardening
-- Additive only: never deletes or auto-cancels an already planned warehouse project.

ALTER TABLE public.warehouse_project_inbox
  ADD COLUMN IF NOT EXISTS dismissal_reason text;

CREATE OR REPLACE FUNCTION public.ensure_warehouse_booking_need(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  has_inventory boolean := false;
  existing_id uuid;
BEGIN
  IF p_booking_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO b
  FROM public.bookings
  WHERE id = p_booking_id::text;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Only untouched/unconverted needs may be auto-dismissed.
  -- Converted rows and warehouse_projects are deliberately left unchanged.
  IF b.status IS DISTINCT FROM 'CONFIRMED' THEN
    UPDATE public.warehouse_project_inbox
    SET status = 'dismissed',
        dismissal_reason = 'booking_not_confirmed',
        processed_at = now()
    WHERE organization_id = b.organization_id
      AND source_booking_id = p_booking_id
      AND status = 'new';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.booking_products bp
    WHERE bp.booking_id = b.id
      AND bp.organization_id = b.organization_id
      AND bp.source_missing_since IS NULL
      AND (bp.inventory_item_type_id IS NOT NULL OR bp.inventory_package_id IS NOT NULL)
  ) INTO has_inventory;

  IF NOT has_inventory THEN
    UPDATE public.warehouse_project_inbox
    SET status = 'dismissed',
        dismissal_reason = 'inventory_need_removed',
        processed_at = now()
    WHERE organization_id = b.organization_id
      AND source_booking_id = p_booking_id
      AND status = 'new';
    RETURN;
  END IF;

  SELECT id INTO existing_id
  FROM public.warehouse_project_inbox
  WHERE organization_id = b.organization_id
    AND source_booking_id = p_booking_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.warehouse_project_inbox
    SET source_project_number = b.booking_number,
        client_name = b.client,
        event_date = b.eventdate::date,
        status = CASE
          WHEN status = 'dismissed'
           AND dismissal_reason IN ('booking_not_confirmed', 'inventory_need_removed')
          THEN 'new'
          ELSE status
        END,
        processed_at = CASE
          WHEN status = 'dismissed'
           AND dismissal_reason IN ('booking_not_confirmed', 'inventory_need_removed')
          THEN NULL
          ELSE processed_at
        END,
        dismissal_reason = CASE
          WHEN status = 'dismissed'
           AND dismissal_reason IN ('booking_not_confirmed', 'inventory_need_removed')
          THEN NULL
          ELSE dismissal_reason
        END
    WHERE id = existing_id;
    RETURN;
  END IF;

  SELECT wi.id INTO existing_id
  FROM public.warehouse_project_inbox wi
  JOIN public.projects p
    ON wi.source_type = 'project'
   AND wi.source_id = p.id
  WHERE wi.organization_id = b.organization_id
    AND p.booking_id = b.id
  ORDER BY wi.created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.warehouse_project_inbox
    SET source_booking_id = p_booking_id,
        source_project_number = b.booking_number,
        client_name = b.client,
        event_date = b.eventdate::date,
        status = CASE
          WHEN status = 'dismissed'
           AND dismissal_reason IN ('booking_not_confirmed', 'inventory_need_removed')
          THEN 'new'
          ELSE status
        END,
        processed_at = CASE
          WHEN status = 'dismissed'
           AND dismissal_reason IN ('booking_not_confirmed', 'inventory_need_removed')
          THEN NULL
          ELSE processed_at
        END,
        dismissal_reason = CASE
          WHEN status = 'dismissed'
           AND dismissal_reason IN ('booking_not_confirmed', 'inventory_need_removed')
          THEN NULL
          ELSE dismissal_reason
        END
    WHERE id = existing_id;
    RETURN;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id, source_type, source_id, source_booking_id,
    source_project_number, client_name, event_date, status, dismissal_reason
  ) VALUES (
    b.organization_id, 'booking', p_booking_id, p_booking_id,
    b.booking_number, b.client, b.eventdate::date, 'new', NULL
  )
  ON CONFLICT (source_type, source_id) DO UPDATE
    SET source_booking_id = EXCLUDED.source_booking_id,
        source_project_number = EXCLUDED.source_project_number,
        client_name = EXCLUDED.client_name,
        event_date = EXCLUDED.event_date;
END;
$$;

-- Re-evaluate both sides of a booking_product change. This covers:
-- * insert of the first inventory row
-- * source_missing_since / inventory-ref changes
-- * moving a row between bookings
-- * physical deletion of the last inventory row
CREATE OR REPLACE FUNCTION public.trg_ensure_warehouse_need_from_booking_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_uuid uuid;
  _old_uuid uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.booking_id IS NOT NULL THEN
    BEGIN
      _new_uuid := NEW.booking_id::uuid;
      PERFORM public.ensure_warehouse_booking_need(_new_uuid);
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.booking_id IS NOT NULL THEN
    BEGIN
      _old_uuid := OLD.booking_id::uuid;
      IF _new_uuid IS NULL OR _old_uuid IS DISTINCT FROM _new_uuid OR TG_OP = 'DELETE' THEN
        PERFORM public.ensure_warehouse_booking_need(_old_uuid);
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_warehouse_need_from_booking_product ON public.booking_products;
CREATE TRIGGER trg_ensure_warehouse_need_from_booking_product
AFTER INSERT OR UPDATE OF booking_id, inventory_item_type_id, inventory_package_id, source_missing_since OR DELETE
ON public.booking_products
FOR EACH ROW
EXECUTE FUNCTION public.trg_ensure_warehouse_need_from_booking_product();
