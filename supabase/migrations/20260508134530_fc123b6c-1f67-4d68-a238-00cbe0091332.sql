-- Close remaining open active_time_registration
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
WHERE id = '8e5b8326-7b1d-41bb-8053-ec8a70d827a0';
