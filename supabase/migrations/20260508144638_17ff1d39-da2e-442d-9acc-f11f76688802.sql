ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rig_start_time_external timestamptz,
  ADD COLUMN IF NOT EXISTS rig_end_time_external timestamptz,
  ADD COLUMN IF NOT EXISTS event_start_time_external timestamptz,
  ADD COLUMN IF NOT EXISTS event_end_time_external timestamptz,
  ADD COLUMN IF NOT EXISTS rigdown_start_time_external timestamptz,
  ADD COLUMN IF NOT EXISTS rigdown_end_time_external timestamptz,
  ADD COLUMN IF NOT EXISTS rig_time_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_time_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rigdown_time_locked boolean NOT NULL DEFAULT false;