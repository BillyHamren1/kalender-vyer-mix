-- Make booking_id nullable so time reports can be linked to projects only
ALTER TABLE public.time_reports ALTER COLUMN booking_id DROP NOT NULL;

-- Ensure at least one link exists
ALTER TABLE public.time_reports ADD CONSTRAINT time_reports_has_link
  CHECK (booking_id IS NOT NULL OR large_project_id IS NOT NULL);