-- Fix misassigned data: move all records from wrong org (Doomie Design) to correct org (Frans August AB)
UPDATE bookings SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_products SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_attachments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_changes SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE warehouse_calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

-- Also fix the set_organization_id trigger fallback to prevent future issues
CREATE OR REPLACE FUNCTION public.set_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := get_user_organization_id(auth.uid());
  END IF;
  -- If still null, RAISE instead of guessing
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required and could not be resolved from auth context';
  END IF;
  RETURN NEW;
END;
$function$;