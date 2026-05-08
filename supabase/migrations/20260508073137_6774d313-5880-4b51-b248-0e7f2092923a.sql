ALTER TABLE public.active_time_registrations
  ALTER COLUMN staff_id TYPE text,
  ALTER COLUMN started_by TYPE text,
  ALTER COLUMN stopped_by TYPE text,
  ALTER COLUMN start_target_id TYPE text,
  ALTER COLUMN current_target_id TYPE text,
  ALTER COLUMN manual_override_target_id TYPE text;