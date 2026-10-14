-- Pair with process-sync-jobs' x-cron-secret authentication. Preserve the
-- installed endpoint, schedule, owner and active state; never embed a secret.
DO $migration$
DECLARE
  worker record;
  endpoint text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  SELECT jobid, command INTO worker FROM cron.job
    WHERE jobname = 'process-sync-jobs-every-minute';
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'CRON_SECRET') THEN
    RAISE EXCEPTION 'CRON_SECRET must be provisioned before securing booking sync';
  END IF;
  endpoint := substring(worker.command FROM 'https://[a-z0-9.-]+/functions/v1/process-sync-jobs');
  IF endpoint IS NULL THEN
    RAISE EXCEPTION 'Cannot identify existing booking sync endpoint';
  END IF;
  PERFORM cron.alter_job(worker.jobid, command := format($command$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name = 'CRON_SECRET' LIMIT 1)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $command$, endpoint));
END;
$migration$;
