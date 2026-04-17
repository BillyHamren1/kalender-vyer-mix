SELECT cron.unschedule('auto-close-location-entries') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-close-location-entries');

SELECT cron.schedule(
  'auto-close-location-entries',
  '55 22 * * *',
  $$ SELECT public.auto_close_open_location_entries(); $$
);