ALTER TABLE large_projects
  ADD COLUMN IF NOT EXISTS start_start_time text,
  ADD COLUMN IF NOT EXISTS start_end_time text,
  ADD COLUMN IF NOT EXISTS event_start_time text,
  ADD COLUMN IF NOT EXISTS event_end_time text,
  ADD COLUMN IF NOT EXISTS end_start_time text,
  ADD COLUMN IF NOT EXISTS end_end_time text;