ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rig_dates date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS event_dates date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rigdown_dates date[] NOT NULL DEFAULT '{}';