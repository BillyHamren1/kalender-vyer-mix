ALTER TABLE public.day_timeline_events
  ADD COLUMN IF NOT EXISTS end_ts timestamptz,
  ADD COLUMN IF NOT EXISTS duration_min integer,
  ADD COLUMN IF NOT EXISTS planned boolean DEFAULT false;