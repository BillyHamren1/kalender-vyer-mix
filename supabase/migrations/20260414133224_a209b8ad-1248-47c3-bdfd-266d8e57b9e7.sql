-- Add show_as_project column
ALTER TABLE public.organization_locations 
ADD COLUMN show_as_project BOOLEAN NOT NULL DEFAULT false;

-- Function: auto-assign all active staff when show_as_project is toggled on
CREATE OR REPLACE FUNCTION public.sync_location_project_bsa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when show_as_project is being set to true
  IF NEW.show_as_project = true AND (TG_OP = 'INSERT' OR OLD.show_as_project = false) THEN
    -- Create BSA rows for all active staff in the organization
    -- Using 'location-{id}' as the synthetic booking_id
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT 
      'location-' || NEW.id,
      sm.id,
      'location',
      CURRENT_DATE,
      NEW.organization_id
    FROM public.staff_members sm
    WHERE sm.organization_id = NEW.organization_id
      AND sm.is_active = true
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;

  -- If show_as_project is toggled OFF, remove location BSA rows
  IF NEW.show_as_project = false AND TG_OP = 'UPDATE' AND OLD.show_as_project = true THEN
    DELETE FROM public.booking_staff_assignments
    WHERE booking_id = 'location-' || NEW.id
      AND team_id = 'location';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_location_project_bsa
AFTER INSERT OR UPDATE OF show_as_project ON public.organization_locations
FOR EACH ROW
EXECUTE FUNCTION public.sync_location_project_bsa();

-- Function: auto-assign new staff members to all location projects
CREATE OR REPLACE FUNCTION public.sync_new_staff_to_location_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_active = true THEN
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date, organization_id)
    SELECT 
      'location-' || ol.id,
      NEW.id,
      'location',
      CURRENT_DATE,
      NEW.organization_id
    FROM public.organization_locations ol
    WHERE ol.organization_id = NEW.organization_id
      AND ol.is_active = true
      AND ol.show_as_project = true
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_new_staff_to_location_projects
AFTER INSERT ON public.staff_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_new_staff_to_location_projects();