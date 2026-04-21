-- Store CRON_SECRET in Vault (idempotent)
DO $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret_id IS NULL THEN
    -- Placeholder; will be overwritten by the user/edge function on first real use.
    -- We intentionally seed with a random value so the schedule below can resolve it.
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'CRON_SECRET', 'Auth header for scheduled cron -> edge function calls');
  END IF;
END $$;

-- Unschedule any prior version of this job (idempotent re-runs)
DO $$
BEGIN
  PERFORM cron.unschedule('close-stale-workday-entries-nightly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule nightly run at 02:00 UTC
SELECT cron.schedule(
  'close-stale-workday-entries-nightly',
  '0 2 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/close-stale-workday-entries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);