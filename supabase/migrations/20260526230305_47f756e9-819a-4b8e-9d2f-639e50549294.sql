-- AKUT STABILISERING 2026-05-26: Sänk frekvensen på två cron-jobb som
-- överbelastar Supabase (CPU/Disk IO). Ingen logik ändras, ingen data
-- raderas — bara schemat.
--
-- 1) gps-heartbeat-pulse: varje minut → var 10:e minut
-- 2) sync-staff-day-report-cache: var 10:e minut → var 60:e minut

-- Avregistrera gamla scheman om de finns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gps-heartbeat-pulse-every-minute') THEN
    PERFORM cron.unschedule('gps-heartbeat-pulse-every-minute');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gps-heartbeat-pulse-every-10min') THEN
    PERFORM cron.unschedule('gps-heartbeat-pulse-every-10min');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-staff-day-report-cache-every-10min') THEN
    PERFORM cron.unschedule('sync-staff-day-report-cache-every-10min');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-staff-day-report-cache-hourly') THEN
    PERFORM cron.unschedule('sync-staff-day-report-cache-hourly');
  END IF;
END $$;

-- 1) Schemalägg gps-heartbeat-pulse var 10:e minut
SELECT cron.schedule(
  'gps-heartbeat-pulse-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/gps-heartbeat-pulse',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2) Schemalägg sync-staff-day-report-cache var 60:e minut (tillfälligt)
SELECT cron.schedule(
  'sync-staff-day-report-cache-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/sync-staff-day-report-cache',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body:='{"engineVersion":"large-project-target-fix-v1","batchSize":10}'::jsonb
  ) AS request_id;
  $$
);