-- Schemalägg sync-staff-day-report-cache var 10:e minut för dagens datum.
-- Behåll det befintliga hourly-jobbet (today+yesterday sweep).
select cron.unschedule(jobid) from cron.job where jobname = 'sync-staff-day-report-cache-today-10min';

select cron.schedule(
  'sync-staff-day-report-cache-today-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url:='https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/sync-staff-day-report-cache',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body:='{"engineVersion":"large-project-target-fix-v1","batchSize":100,"mode":"today"}'::jsonb
  ) as request_id;
  $$
);