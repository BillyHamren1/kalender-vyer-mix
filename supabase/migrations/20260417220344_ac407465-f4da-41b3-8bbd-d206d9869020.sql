-- Enable required extensions for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Unschedule any prior version of the job to make this idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('arrival-reminder-every-5-min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule the arrival-reminder edge function to run every 5 minutes
SELECT cron.schedule(
  'arrival-reminder-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/arrival-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  ) AS request_id;
  $$
);