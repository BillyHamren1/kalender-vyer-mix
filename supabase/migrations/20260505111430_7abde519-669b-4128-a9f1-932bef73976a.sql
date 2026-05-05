ALTER TABLE public.location_time_entries
  ADD COLUMN IF NOT EXISTS stop_source text,
  ADD COLUMN IF NOT EXISTS stop_reason text,
  ADD COLUMN IF NOT EXISTS stopped_by text,
  ADD COLUMN IF NOT EXISTS stop_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill legacy closed rows
UPDATE public.location_time_entries
SET stop_source = 'legacy_unknown',
    stop_reason = 'unknown'
WHERE exited_at IS NOT NULL
  AND stop_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_lte_stop_source ON public.location_time_entries(stop_source) WHERE stop_source IS NOT NULL;

COMMENT ON COLUMN public.location_time_entries.stop_source IS 'user_manual|admin_manual|foreground_geofence_exit|server_background_gps_switch|server_background_gps_stale|time_report_saved|watchdog_auto_close|admin_reprocess|legacy_unknown';
COMMENT ON COLUMN public.location_time_entries.stop_reason IS 'user_pressed_stop|user_saved_time_report|stable_exit_detected|switched_to_new_work_site|stale_timer_closed|day_boundary_clamp|admin_adjustment|duplicate_or_reconciled|unknown';