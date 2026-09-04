ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS internal_lager_enabled boolean NOT NULL DEFAULT false;

UPDATE public.organizations
SET internal_lager_enabled = true
WHERE id = 'f5e5cade-f08b-4833-a105-56461f15b191';

CREATE OR REPLACE FUNCTION public.org_internal_lager_enabled(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT internal_lager_enabled FROM public.organizations WHERE id = _org_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.org_internal_lager_enabled(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.create_internal_project_for_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.internal_lager_enabled THEN
    PERFORM public.ensure_internal_project(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_internal_project(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id
  FROM public.projects
  WHERE organization_id = _org_id AND is_internal = true
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  IF NOT public.org_internal_lager_enabled(_org_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.projects (
    organization_id, name, status, is_internal
  ) VALUES (
    _org_id, 'Lager', 'in_progress', true
  )
  RETURNING id INTO _existing_id;

  RETURN _existing_id;
END;
$$;

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
  IF NOT public.org_internal_lager_enabled(_org_id) THEN
    RETURN NULL;
  END IF;

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