
-- =========================================================
-- Lager 10: Sync warehouse_calendar_events / packing_projects /
-- bookings changes into warehouse_assignments automatically.
-- =========================================================

-- ---------- 1) warehouse_calendar_events -> warehouse_assignments ----------
CREATE OR REPLACE FUNCTION public.sync_warehouse_assignments_on_event_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.warehouse_assignments wa
  SET
    start_time       = (NEW.start_time AT TIME ZONE 'Europe/Stockholm')::time,
    end_time         = (NEW.end_time   AT TIME ZONE 'Europe/Stockholm')::time,
    assignment_date  = (NEW.start_time AT TIME ZONE 'Europe/Stockholm')::date,
    title            = COALESCE(NEW.title, wa.title),
    customer_name    = COALESCE(NEW.title, wa.customer_name),
    delivery_address = COALESCE(NEW.delivery_address, wa.delivery_address),
    booking_id       = COALESCE(NEW.booking_id, wa.booking_id),
    booking_number   = COALESCE(NEW.booking_number, wa.booking_number),
    metadata         = COALESCE(wa.metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'resource_id', NEW.resource_id,
                             'event_type', NEW.event_type
                           ),
    updated_at = now()
  WHERE wa.warehouse_event_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_wa_on_event_change ON public.warehouse_calendar_events;
CREATE TRIGGER trg_sync_wa_on_event_change
AFTER UPDATE OF start_time, end_time, title, delivery_address, booking_id, booking_number, resource_id, event_type
ON public.warehouse_calendar_events
FOR EACH ROW EXECUTE FUNCTION public.sync_warehouse_assignments_on_event_change();

-- Cascade delete: remove warehouse_assignments when their warehouse_calendar_event is gone.
CREATE OR REPLACE FUNCTION public.cleanup_warehouse_assignments_on_event_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.warehouse_assignments
  WHERE warehouse_event_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_wa_on_event_delete ON public.warehouse_calendar_events;
CREATE TRIGGER trg_cleanup_wa_on_event_delete
BEFORE DELETE ON public.warehouse_calendar_events
FOR EACH ROW EXECUTE FUNCTION public.cleanup_warehouse_assignments_on_event_delete();

-- ---------- 2) packing_projects -> warehouse_assignments ----------
CREATE OR REPLACE FUNCTION public.sync_warehouse_assignments_on_packing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_status text;
BEGIN
  -- Map packing_projects.status -> warehouse_assignments.status.
  _new_status := CASE
    WHEN NEW.status IN ('cancelled')                 THEN 'cancelled'
    WHEN NEW.status IN ('completed','delivered',
                        'returned','packed')         THEN 'completed'
    WHEN NEW.status IN ('in_progress','packing',
                        'returning','back')          THEN 'in_progress'
    WHEN NEW.status IN ('planning','planned')        THEN 'planned'
    ELSE NULL
  END;

  UPDATE public.warehouse_assignments wa
  SET
    status           = COALESCE(_new_status, wa.status),
    title            = COALESCE(NEW.name, wa.title),
    customer_name    = COALESCE(NEW.client_name, wa.customer_name),
    delivery_address = COALESCE(NEW.delivery_address, wa.delivery_address),
    booking_id       = COALESCE(NEW.booking_id, wa.booking_id),
    assignment_type  = CASE
                         WHEN NEW.status IN ('returning','back','returned')
                           THEN 'return'
                         ELSE wa.assignment_type
                       END,
    metadata         = COALESCE(wa.metadata, '{}'::jsonb)
                        || jsonb_build_object('packing_status', NEW.status),
    updated_at = now()
  WHERE wa.packing_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_wa_on_packing_change ON public.packing_projects;
CREATE TRIGGER trg_sync_wa_on_packing_change
AFTER UPDATE OF status, name, client_name, delivery_address, booking_id
ON public.packing_projects
FOR EACH ROW EXECUTE FUNCTION public.sync_warehouse_assignments_on_packing_change();

-- ---------- 3) bookings.delivery_address -> warehouse_assignments ----------
CREATE OR REPLACE FUNCTION public.sync_warehouse_assignments_on_booking_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.deliveryaddress IS DISTINCT FROM OLD.deliveryaddress
     OR NEW.client       IS DISTINCT FROM OLD.client THEN
    UPDATE public.warehouse_assignments wa
    SET
      delivery_address = COALESCE(NEW.deliveryaddress, wa.delivery_address),
      customer_name    = COALESCE(NEW.client, wa.customer_name),
      updated_at = now()
    WHERE wa.booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_wa_on_booking_address ON public.bookings;
CREATE TRIGGER trg_sync_wa_on_booking_address
AFTER UPDATE OF deliveryaddress, client ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_warehouse_assignments_on_booking_address();
