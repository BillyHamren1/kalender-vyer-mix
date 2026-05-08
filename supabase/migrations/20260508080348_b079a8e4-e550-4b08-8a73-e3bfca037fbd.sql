UPDATE public.active_time_registrations
SET status = 'stopped',
    stopped_at = now(),
    stop_source = 'debug-time-intelligence/manual_stop_test'
WHERE id = '9f1d9381-247d-4dd1-a863-6fd17ef77e35'
  AND status = 'active';