UPDATE public.active_time_registrations
SET status = 'stopped',
    stopped_at = now(),
    stop_source = 'debug_health_check_admin_stop',
    stopped_by = 'time-engine-health-check',
    updated_at = now()
WHERE id = '8e6d61ec-c308-46ee-9593-c9d61ac301c7'
  AND status = 'active';