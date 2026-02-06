
-- 1. Create trigger function to handle booking deletions -> complete linked projects/jobs
CREATE OR REPLACE FUNCTION public.handle_booking_delete_projects()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set linked projects to completed
  UPDATE public.projects 
  SET status = 'completed', updated_at = now() 
  WHERE booking_id = OLD.id 
  AND status != 'completed';
  
  -- Set linked jobs to completed
  UPDATE public.jobs 
  SET status = 'completed', updated_at = now() 
  WHERE booking_id = OLD.id 
  AND status != 'completed';
  
  RETURN OLD;
END;
$function$;

-- 2. Create trigger on bookings table
CREATE TRIGGER on_booking_delete_complete_projects
  BEFORE DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_delete_projects();

-- 3. Fix existing projects with invalid 'cancelled' status
UPDATE public.projects SET status = 'completed', updated_at = now() WHERE status = 'cancelled';

-- 4. Fix existing projects linked to non-confirmed bookings
UPDATE public.projects 
SET status = 'completed', updated_at = now()
FROM public.bookings
WHERE projects.booking_id = bookings.id
AND bookings.status IN ('OFFER', 'CANCELLED', 'Offert', 'Avbokad')
AND projects.status NOT IN ('completed');

-- 5. Fix existing jobs linked to non-confirmed bookings
UPDATE public.jobs 
SET status = 'completed', updated_at = now()
FROM public.bookings
WHERE jobs.booking_id = bookings.id
AND bookings.status IN ('OFFER', 'CANCELLED', 'Offert', 'Avbokad')
AND jobs.status NOT IN ('completed');
