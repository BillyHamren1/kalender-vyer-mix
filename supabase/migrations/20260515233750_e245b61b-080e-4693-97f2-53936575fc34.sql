ALTER TABLE public.staff_day_submissions
  ADD COLUMN IF NOT EXISTS user_edits_json jsonb,
  ADD COLUMN IF NOT EXISTS ai_validation_json jsonb,
  ADD COLUMN IF NOT EXISTS display_timeline_snapshot_json jsonb;