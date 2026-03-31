
ALTER TABLE public.booking_staff_assignments
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'field';

COMMENT ON COLUMN public.booking_staff_assignments.role IS 'Team role: field (default for calendar-scheduled staff), project_manager, coordinator';
