ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS rig_dates,
  DROP COLUMN IF EXISTS event_dates,
  DROP COLUMN IF EXISTS rigdown_dates;