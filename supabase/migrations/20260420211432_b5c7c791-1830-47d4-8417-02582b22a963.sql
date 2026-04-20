-- Enable cron + net for scheduling edge functions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schedule infer-home-location daily at 06:00 Europe/Stockholm (≈ 04:00 UTC summer / 05:00 UTC winter; use 04:00 UTC)
select cron.schedule(
  'infer-home-location-daily',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/infer-home-location',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpaHJobHRpbmhld2hveGVmanh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNDQ4NjksImV4cCI6MjA2MjkyMDg2OX0.O6n8eaVB-ZcKPLWFK0EhWK22bMS31PFulNgksw5RSVk"}'::jsonb,
    body := concat('{"time":"', now(), '"}')::jsonb
  );
  $$
);