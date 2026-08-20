-- Canonical warehouse need from Booking (production-safe, additive migration)
--
-- Goals:
-- 1) A CONFIRMED booking with real Inventory/WMS lines can enter warehouse planning
--    without first requiring a Planning project.
-- 2) Existing project/large_project inbox rows remain valid and are not rewritten.
-- 3) New relationships are explicit so Booking -> warehouse plan -> packing is traceable.
-- 4) warehouse_project_tasks are explicitly planning work, distinct from packing_tasks
--    (packing workflow/checkpoints).

ALTER TABLE public.warehouse_project_inbox
  DROP CONSTRAINT IF EXISTS inbox_source_type_check;

ALTER TABLE public.warehouse_project_inbox
  ADD CONSTRAINT inbox_source_type_check
  CHECK (source_type IN ('booking','project','large_project'));

ALTER TABLE public.warehouse_project_inbox
  ADD COLUMN IF NOT EXISTS source_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_large_project_id uuid REFERENCES public.large_projects(id) ON DELETE SET NULL;

ALTER TABLE public.warehouse_projects
  ADD COLUMN IF NOT EXISTS source_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.warehouse_calendar_events
  ADD COLUMN IF NOT EXISTS warehouse_project_id uuid REFERENCES public.warehouse_projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS warehouse_project_task_id uuid REFERENCES public.warehouse_project_tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_warehouse_calendar_project_task
  ON public.warehouse_calendar_events (warehouse_project_task_id)
  WHERE warehouse_project_task_id IS NOT NULL;

ALTER TABLE public.warehouse_project_tasks
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'planned_work';

ALTER TABLE public.warehouse_project_tasks
  DROP CONSTRAINT IF EXISTS warehouse_project_tasks_task_kind_check;
ALTER TABLE public.warehouse_project_tasks
  ADD CONSTRAINT warehouse_project_tasks_task_kind_check
  CHECK (task_kind IN ('planned_work'));

CREATE INDEX IF NOT EXISTS idx_warehouse_inbox_source_booking
  ON public.warehouse_project_inbox (organization_id, source_booking_id)
  WHERE source_booking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_projects_org_source_booking_unique
  ON public.warehouse_projects (organization_id, source_booking_id)
  WHERE source_booking_id IS NOT NULL AND is_internal = false;

-- Do not rewrite historical inbox rows. This helper only affects new/updated source data.
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
  SELECT * INTO b
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND OR b.status IS DISTINCT FROM 'CONFIRMED' THEN
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
    RETURN;
  END IF;

  -- Already represented by a booking-aware inbox row: only refresh Booking-owned metadata.
  SELECT id INTO existing_id
  FROM public.warehouse_project_inbox
  WHERE organization_id = b.organization_id
    AND source_booking_id = b.id
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.warehouse_project_inbox
    SET source_project_number = b.booking_number,
        client_name = b.client,
        event_date = b.eventdate::date
    WHERE id = existing_id;
    RETURN;
  END IF;

  -- Compatibility: if a legacy Planning-project inbox row already represents this booking,
  -- enrich that row rather than creating a duplicate warehouse need.
  SELECT wi.id INTO existing_id
  FROM public.warehouse_project_inbox wi
  JOIN public.projects p
    ON wi.source_type = 'project'
   AND wi.source_id = p.id
  WHERE wi.organization_id = b.organization_id
    AND p.booking_id = b.id::text
  ORDER BY wi.created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.warehouse_project_inbox
    SET source_booking_id = b.id,
        source_project_number = b.booking_number,
        client_name = b.client,
        event_date = b.eventdate::date
    WHERE id = existing_id;
    RETURN;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id,
    source_type,
    source_id,
    source_booking_id,
    source_project_number,
    client_name,
    event_date,
    status
  ) VALUES (
    b.organization_id,
    'booking',
    b.id,
    b.id,
    b.booking_number,
    b.client,
    b.eventdate::date,
    'new'
  )
  ON CONFLICT (source_type, source_id) DO UPDATE
    SET source_booking_id = EXCLUDED.source_booking_id,
        source_project_number = EXCLUDED.source_project_number,
        client_name = EXCLUDED.client_name,
        event_date = EXCLUDED.event_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ensure_warehouse_need_from_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_warehouse_booking_need(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_warehouse_need_from_booking ON public.bookings;
CREATE TRIGGER trg_ensure_warehouse_need_from_booking
AFTER INSERT OR UPDATE OF status, booking_number, client, eventdate
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_ensure_warehouse_need_from_booking();

CREATE OR REPLACE FUNCTION public.trg_ensure_warehouse_need_from_booking_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_warehouse_booking_need(NEW.booking_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_warehouse_need_from_booking_product ON public.booking_products;
CREATE TRIGGER trg_ensure_warehouse_need_from_booking_product
AFTER INSERT OR UPDATE OF booking_id, inventory_item_type_id, inventory_package_id, source_missing_since
ON public.booking_products
FOR EACH ROW
EXECUTE FUNCTION public.trg_ensure_warehouse_need_from_booking_product();

-- Keep existing Planning-project behavior, but enrich/reuse the Booking warehouse need when present.
CREATE OR REPLACE FUNCTION public.notify_warehouse_on_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _booking RECORD;
  _client text;
  _event_date date;
  _project_number text;
  _booking_uuid uuid;
  _existing_booking_inbox uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    BEGIN
      _booking_uuid := NEW.booking_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      _booking_uuid := NULL;
    END;

    SELECT client, eventdate, booking_number
    INTO _booking
    FROM public.bookings
    WHERE id::text = NEW.booking_id;

    _client := _booking.client;
    _event_date := _booking.eventdate::date;
    _project_number := _booking.booking_number;

    IF _booking_uuid IS NOT NULL THEN
      PERFORM public.ensure_warehouse_booking_need(_booking_uuid);

      SELECT id INTO _existing_booking_inbox
      FROM public.warehouse_project_inbox
      WHERE organization_id = NEW.organization_id
        AND source_booking_id = _booking_uuid
      ORDER BY created_at ASC
      LIMIT 1;

      IF _existing_booking_inbox IS NOT NULL THEN
        UPDATE public.warehouse_project_inbox
        SET source_project_id = NEW.id,
            source_project_number = COALESCE(_project_number, source_project_number),
            client_name = COALESCE(_client, client_name),
            event_date = COALESCE(_event_date, event_date)
        WHERE id = _existing_booking_inbox;
        RETURN NEW;
      END IF;
    END IF;
  ELSE
    _client := NEW.name;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id, source_type, source_id, source_project_id,
    source_booking_id, source_project_number, client_name, event_date, status
  )
  VALUES (
    NEW.organization_id, 'project', NEW.id, NEW.id,
    _booking_uuid, _project_number, _client, _event_date, 'new'
  )
  ON CONFLICT (source_type, source_id) DO UPDATE
    SET source_project_id = EXCLUDED.source_project_id,
        source_booking_id = COALESCE(public.warehouse_project_inbox.source_booking_id, EXCLUDED.source_booking_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_warehouse_on_new_large_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_date date;
BEGIN
  IF NEW.event_date IS NOT NULL AND array_length(NEW.event_date, 1) > 0 THEN
    SELECT min(d::date) INTO _event_date FROM unnest(NEW.event_date) AS d WHERE d IS NOT NULL;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id, source_type, source_id, source_large_project_id,
    source_project_number, client_name, event_date, status
  )
  VALUES (
    NEW.organization_id, 'large_project', NEW.id, NEW.id,
    NEW.project_number, NEW.name, _event_date, 'new'
  )
  ON CONFLICT (source_type, source_id) DO UPDATE
    SET source_large_project_id = EXCLUDED.source_large_project_id;

  RETURN NEW;
END;
$$;
