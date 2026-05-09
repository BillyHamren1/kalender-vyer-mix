ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS times_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calendar_events_times_locked
  ON public.calendar_events (times_locked)
  WHERE times_locked = true;

COMMENT ON COLUMN public.calendar_events.times_locked IS
  'When true, this event date/time is locked: drag/move/resize and bulk time updates must skip it.';