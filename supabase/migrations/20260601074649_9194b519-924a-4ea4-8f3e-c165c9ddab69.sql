ALTER TABLE public.large_project_booking_plan_items
  ADD COLUMN IF NOT EXISTS times_locked boolean NOT NULL DEFAULT false;