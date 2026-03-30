
-- Fix the trigger function to cast booking_id properly
CREATE OR REPLACE FUNCTION public.bump_project_on_task_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id uuid;
  _large_project_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _booking_id := OLD.booking_id;
    _large_project_id := OLD.large_project_id;
  ELSE
    _booking_id := NEW.booking_id;
    _large_project_id := NEW.large_project_id;
  END IF;

  IF _large_project_id IS NOT NULL THEN
    UPDATE large_projects SET updated_at = now() WHERE id = _large_project_id;
  END IF;

  IF _booking_id IS NOT NULL THEN
    UPDATE projects SET updated_at = now() WHERE booking_id = _booking_id::text;
    UPDATE jobs SET updated_at = now() WHERE booking_id = _booking_id::text;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Add assigned_to_ids column to establishment_tasks for multi-staff assignment
ALTER TABLE public.establishment_tasks 
ADD COLUMN IF NOT EXISTS assigned_to_ids text[] DEFAULT '{}';

-- Migrate existing assigned_to data to assigned_to_ids
UPDATE public.establishment_tasks 
SET assigned_to_ids = ARRAY[assigned_to::text]
WHERE assigned_to IS NOT NULL AND (assigned_to_ids IS NULL OR assigned_to_ids = '{}');
