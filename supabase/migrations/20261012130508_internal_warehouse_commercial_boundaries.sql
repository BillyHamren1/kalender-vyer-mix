-- Requires the additive internal_project_classification migration.
-- Preserve customer inbox behavior verbatim; no existing rows are modified.
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
  -- Internal work does not imply physical equipment demand. Existing Lager
  -- activity uses its dedicated task path. Project equipment remains opt-in
  -- only after the versioned WMS/Scanner contract is activated.
  IF COALESCE(NEW.project_kind, CASE WHEN NEW.is_internal THEN 'internal_activity' ELSE 'customer' END) <> 'customer' THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_id IS NOT NULL THEN
    BEGIN
      _booking_uuid := NEW.booking_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      _booking_uuid := NULL;
    END;

    SELECT client, eventdate, booking_number
    INTO _booking
    FROM public.bookings
    WHERE id = NEW.booking_id;

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
