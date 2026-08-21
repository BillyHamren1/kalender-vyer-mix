-- Warehouse authoritative-plan guard
--
-- Purpose:
-- 1) Keep Booking-generated packing/return rows as planning suggestions.
-- 2) Let the manager-approved warehouse plan replace the suggestion without
--    colliding with UNIQUE(organization_id, booking_id, event_type).
-- 3) Support multi-day approved work while keeping event_type='packing'/'return'
--    so existing calendar/worker code continues to behave normally.
-- 4) Prevent later Booking imports from moving an approved manager plan back to
--    the automatically suggested dates.
--
-- This is additive and does not rewrite historical rows.

ALTER TABLE public.warehouse_calendar_events
  ADD COLUMN IF NOT EXISTS source_booking_id text;

CREATE INDEX IF NOT EXISTS idx_warehouse_calendar_source_booking
  ON public.warehouse_calendar_events (organization_id, source_booking_id)
  WHERE source_booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_authoritative_warehouse_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing RECORD;
  _source_changed boolean := false;
BEGIN
  -- Manager-approved rows are identifiable by warehouse_project_task_id.
  -- The application currently inserts one packing/return row per approved day.
  IF TG_OP = 'INSERT'
     AND NEW.warehouse_project_task_id IS NOT NULL
     AND NEW.event_type IN ('packing', 'return') THEN

    NEW.source_booking_id := COALESCE(NEW.source_booking_id, NEW.booking_id);

    IF NEW.booking_id IS NOT NULL THEN
      SELECT
        id,
        start_time,
        warehouse_project_task_id,
        manually_adjusted
      INTO _existing
      FROM public.warehouse_calendar_events
      WHERE organization_id = NEW.organization_id
        AND booking_id = NEW.booking_id
        AND event_type = NEW.event_type
      ORDER BY created_at ASC
      LIMIT 1;

      IF FOUND THEN
        -- First approved day replaces the Booking-generated suggestion in place.
        -- A retry for the same approved day is also idempotent here.
        IF _existing.warehouse_project_task_id IS NULL
           OR _existing.start_time::date = NEW.start_time::date THEN
          UPDATE public.warehouse_calendar_events
          SET booking_number = NEW.booking_number,
              title = NEW.title,
              start_time = NEW.start_time,
              end_time = NEW.end_time,
              resource_id = NEW.resource_id,
              delivery_address = NEW.delivery_address,
              source_rig_date = NEW.source_rig_date,
              source_event_date = NEW.source_event_date,
              source_rigdown_date = NEW.source_rigdown_date,
              has_source_changes = false,
              change_details = NULL,
              manually_adjusted = true,
              viewed = true,
              warehouse_project_id = NEW.warehouse_project_id,
              warehouse_project_task_id = NEW.warehouse_project_task_id,
              source_booking_id = COALESCE(NEW.source_booking_id, NEW.booking_id)
          WHERE id = _existing.id;

          -- The approved plan has been materialized by updating the suggestion;
          -- skip the conflicting INSERT row.
          RETURN NULL;
        END IF;

        -- Additional approved days for the same task keep the canonical booking
        -- in source_booking_id, but use NULL booking_id so the existing unique
        -- Booking suggestion key is not violated. PostgreSQL UNIQUE permits
        -- multiple NULL booking_id rows.
        NEW.booking_id := NULL;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- Booking import uses UPSERT on the canonical base event type. Once that row
  -- has been converted into an approved manager plan, preserve its operational
  -- date/resource/task linkage. Booking may still refresh descriptive/source
  -- information, but it must not take ownership of the plan again.
  IF TG_OP = 'UPDATE'
     AND OLD.warehouse_project_task_id IS NOT NULL
     AND OLD.manually_adjusted IS TRUE
     AND NEW.manually_adjusted IS DISTINCT FROM TRUE
     AND OLD.event_type IN ('packing', 'return') THEN

    _source_changed :=
      OLD.source_rig_date IS DISTINCT FROM NEW.source_rig_date
      OR OLD.source_event_date IS DISTINCT FROM NEW.source_event_date
      OR OLD.source_rigdown_date IS DISTINCT FROM NEW.source_rigdown_date;

    NEW.start_time := OLD.start_time;
    NEW.end_time := OLD.end_time;
    NEW.resource_id := OLD.resource_id;
    NEW.booking_id := OLD.booking_id;
    NEW.event_type := OLD.event_type;
    NEW.manually_adjusted := true;
    NEW.viewed := OLD.viewed;
    NEW.warehouse_project_id := OLD.warehouse_project_id;
    NEW.warehouse_project_task_id := OLD.warehouse_project_task_id;
    NEW.source_booking_id := COALESCE(OLD.source_booking_id, OLD.booking_id);
    NEW.has_source_changes := COALESCE(OLD.has_source_changes, false) OR _source_changed;
    NEW.change_details := CASE
      WHEN _source_changed THEN COALESCE(
        OLD.change_details,
        'Booking-datum har ändrats efter att lagerplanen godkändes'
      )
      ELSE OLD.change_details
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_authoritative_warehouse_plan
  ON public.warehouse_calendar_events;

CREATE TRIGGER trg_guard_authoritative_warehouse_plan
BEFORE INSERT OR UPDATE ON public.warehouse_calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.guard_authoritative_warehouse_plan();

-- Extra approved days have booking_id=NULL to avoid the canonical suggestion
-- key. Restore the real booking id on concrete worker assignments so the Time
-- app/scanner still opens the correct Booking/packing context.
CREATE OR REPLACE FUNCTION public.restore_warehouse_assignment_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _booking_id text;
BEGIN
  IF NEW.warehouse_event_id IS NULL OR NEW.booking_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(wce.source_booking_id, wce.booking_id)
  INTO _booking_id
  FROM public.warehouse_calendar_events wce
  WHERE wce.id = NEW.warehouse_event_id;

  IF _booking_id IS NOT NULL THEN
    NEW.booking_id := _booking_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_warehouse_assignment_booking
  ON public.warehouse_assignments;

CREATE TRIGGER trg_restore_warehouse_assignment_booking
BEFORE INSERT OR UPDATE OF warehouse_event_id, booking_id
ON public.warehouse_assignments
FOR EACH ROW
EXECUTE FUNCTION public.restore_warehouse_assignment_booking();
