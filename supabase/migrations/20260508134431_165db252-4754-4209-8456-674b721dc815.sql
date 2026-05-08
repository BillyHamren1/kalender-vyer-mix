-- Close remaining 5 open active_time_registrations
UPDATE active_time_registrations
SET 
  status = 'stopped',
  stopped_at = now(),
  stop_source = 'admin_bulk_close_all_running_timers',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'bulkClosed', true,
    'bulkClosedAt', now(),
    'bulkClosedReason', 'reset_all_running_timers_before_time_engine_go_live'
  )
WHERE status = 'active' OR stopped_at IS NULL;
