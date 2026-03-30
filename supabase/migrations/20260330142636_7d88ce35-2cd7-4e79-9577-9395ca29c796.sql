ALTER TABLE establishment_tasks
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text;