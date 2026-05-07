-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop any prior schedule with the same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('location-update-cron-every-minute');
EXCEPTION WHEN OTHERS THEN
  -- ignore if not present
  NULL;
END $$;

SELECT cron.schedule(
  'location-update-cron-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/location-update-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body := concat('{"trigger":"cron","at":"', now(), '"}')::jsonb
  ) AS request_id;
  $cron$
);