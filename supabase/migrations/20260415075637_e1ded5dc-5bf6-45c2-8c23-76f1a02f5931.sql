
-- Drop old check constraint and add one that includes 'cancelled'
ALTER TABLE public.projects DROP CONSTRAINT projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check 
  CHECK (status = ANY (ARRAY['planning', 'in_progress', 'delivered', 'completed', 'cancelled']));

-- Fix the specific stuck project
UPDATE public.projects 
SET status = 'cancelled', updated_at = now() 
WHERE booking_id = '1a2bdc2f-6102-42de-a60a-0a5d1b4eefdf' AND status != 'cancelled';

UPDATE public.jobs 
SET status = 'cancelled', updated_at = now() 
WHERE booking_id = '1a2bdc2f-6102-42de-a60a-0a5d1b4eefdf' AND status != 'cancelled';

-- Create a trigger function that syncs project/job status on booking status changes
CREATE OR REPLACE FUNCTION public.sync_project_status_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  upper_status TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  upper_status := UPPER(COALESCE(NEW.status, ''));

  IF upper_status = 'CANCELLED' THEN
    UPDATE public.projects 
    SET status = 'cancelled', updated_at = now() 
    WHERE booking_id = NEW.id AND status != 'cancelled';

    UPDATE public.jobs 
    SET status = 'cancelled', updated_at = now() 
    WHERE booking_id = NEW.id AND status != 'cancelled';

  ELSIF upper_status = 'CONFIRMED' AND UPPER(COALESCE(OLD.status, '')) = 'CANCELLED' THEN
    UPDATE public.projects 
    SET status = 'planning', updated_at = now() 
    WHERE booking_id = NEW.id AND status = 'cancelled';

    UPDATE public.jobs 
    SET status = 'active', updated_at = now() 
    WHERE booking_id = NEW.id AND status = 'cancelled';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_project_status_on_booking_change
AFTER UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.sync_project_status_on_booking_change();
