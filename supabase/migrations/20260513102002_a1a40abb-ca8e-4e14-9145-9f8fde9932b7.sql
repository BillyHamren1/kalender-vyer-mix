-- Safety-net: poll Booking system every 5 min for missed webhooks
SELECT cron.schedule(
  'incremental-sync-all-orgs-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/incremental-sync-all-orgs',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);