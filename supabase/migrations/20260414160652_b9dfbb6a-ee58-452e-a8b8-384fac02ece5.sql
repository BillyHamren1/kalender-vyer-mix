
CREATE OR REPLACE FUNCTION public.auto_add_to_large_project_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.large_project_staff (large_project_id, staff_id, organization_id, role)
  SELECT lpb.large_project_id, NEW.staff_id, lpb.organization_id, 'field'
  FROM public.large_project_bookings lpb
  WHERE lpb.booking_id = NEW.booking_id
  ON CONFLICT (large_project_id, staff_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_to_large_project_staff
AFTER INSERT ON public.booking_staff_assignments
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_to_large_project_staff();
