CREATE OR REPLACE FUNCTION public.prevent_internal_booking_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_internal = true THEN
    RAISE EXCEPTION 'Interna bokningar (Lager m.fl.) kan inte raderas';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_internal_booking_delete_trigger ON public.bookings;
CREATE TRIGGER prevent_internal_booking_delete_trigger
BEFORE DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_internal_booking_delete();

CREATE OR REPLACE FUNCTION public.prevent_internal_project_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_internal = true THEN
    RAISE EXCEPTION 'Interna projekt (Lager m.fl.) kan inte raderas';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_internal_project_delete_trigger ON public.projects;
CREATE TRIGGER prevent_internal_project_delete_trigger
BEFORE DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.prevent_internal_project_delete();

-- bookings.id är text, så _booking_id ska vara text
CREATE OR REPLACE FUNCTION public.ensure_internal_lager_setup(_org_id uuid, _location_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _booking_id text;
  _project_id uuid;
  _booking_number text;
BEGIN
  SELECT id INTO _booking_id
  FROM public.bookings
  WHERE organization_id = _org_id AND is_internal = true AND internal_type = 'warehouse'
  LIMIT 1;

  IF _booking_id IS NULL THEN
    _booking_id := gen_random_uuid()::text;
    _booking_number := 'LAGER-' || substr(_org_id::text, 1, 8);
    INSERT INTO public.bookings (
      id, organization_id, client, status, is_internal, internal_type,
      booking_number, eventdate, assigned_to_project
    ) VALUES (
      _booking_id, _org_id, 'Lager', 'CONFIRMED', true, 'warehouse',
      _booking_number, CURRENT_DATE, true
    );
  ELSE
    UPDATE public.bookings SET assigned_to_project = true
    WHERE id = _booking_id AND (assigned_to_project IS NULL OR assigned_to_project = false);
  END IF;

  SELECT id INTO _project_id
  FROM public.projects
  WHERE organization_id = _org_id AND is_internal = true
  LIMIT 1;

  IF _project_id IS NULL THEN
    _project_id := gen_random_uuid();
    INSERT INTO public.projects (
      id, organization_id, name, is_internal, location_id, booking_id, status
    ) VALUES (
      _project_id, _org_id, 'Lager', true, _location_id, _booking_id, 'in_progress'
    );
  ELSE
    UPDATE public.projects
    SET booking_id = COALESCE(booking_id, _booking_id),
        location_id = COALESCE(location_id, _location_id)
    WHERE id = _project_id;
  END IF;

  RETURN _booking_id;
END;
$$;

-- Bakåtkompatibel wrapper (samma signatur som tidigare migration använder)
DROP FUNCTION IF EXISTS public.ensure_internal_lager_booking(uuid);
CREATE OR REPLACE FUNCTION public.ensure_internal_lager_booking(_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.ensure_internal_lager_setup(_org_id, NULL);
END;
$$;

UPDATE public.bookings
SET booking_number = 'LAGER-' || substr(organization_id::text, 1, 8)
WHERE is_internal = true AND internal_type = 'warehouse' AND booking_number = 'LAGER';

CREATE OR REPLACE FUNCTION public.auto_create_internal_project_for_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.ensure_internal_lager_setup(NEW.organization_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_internal_project_for_location_trigger ON public.organization_locations;
CREATE TRIGGER auto_create_internal_project_for_location_trigger
AFTER INSERT ON public.organization_locations
FOR EACH ROW EXECUTE FUNCTION public.auto_create_internal_project_for_location();

DO $$
DECLARE
  _org record;
  _loc_id uuid;
BEGIN
  FOR _org IN
    SELECT DISTINCT org_id FROM (
      SELECT organization_id AS org_id FROM public.organization_locations
      UNION
      SELECT organization_id FROM public.projects WHERE is_internal = true
      UNION
      SELECT organization_id FROM public.bookings WHERE is_internal = true
    ) o
  LOOP
    SELECT id INTO _loc_id FROM public.organization_locations
    WHERE organization_id = _org.org_id LIMIT 1;
    PERFORM public.ensure_internal_lager_setup(_org.org_id, _loc_id);
  END LOOP;
END $$;

UPDATE public.bookings SET assigned_to_project = true WHERE is_internal = true;