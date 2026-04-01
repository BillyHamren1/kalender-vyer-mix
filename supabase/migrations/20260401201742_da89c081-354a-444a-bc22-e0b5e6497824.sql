ALTER TABLE public.large_projects
  DROP COLUMN IF EXISTS start_start_time,
  DROP COLUMN IF EXISTS start_end_time,
  DROP COLUMN IF EXISTS event_start_time,
  DROP COLUMN IF EXISTS event_end_time,
  DROP COLUMN IF EXISTS end_start_time,
  DROP COLUMN IF EXISTS end_end_time;