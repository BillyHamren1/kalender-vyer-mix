-- Pair with process-sync-jobs' x-cron-secret authentication. Preserve the
-- installed endpoint, schedule, owner and active state; never embed a secret.
DO $migration$
DECLARE
  worker record;
  endpoint text;
  secured_command text;
  replacement_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  SELECT jobid, command, username, schedule, active INTO worker FROM cron.job
    WHERE jobname = 'process-sync-jobs-every-minute';
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'CRON_SECRET') THEN
    RAISE EXCEPTION 'CRON_SECRET must be provisioned before securing booking sync';
  END IF;
  endpoint := substring(worker.command FROM 'https://[a-z0-9.-]+/functions/v1/process-sync-jobs');
  IF endpoint IS NULL THEN
    RAISE EXCEPTION 'Cannot identify existing booking sync endpoint';
  END IF;
  secured_command := format($command$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name = 'CRON_SECRET' LIMIT 1)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $command$, endpoint);
  IF worker.username = current_user THEN
    PERFORM cron.alter_job(worker.jobid, command := secured_command);
  ELSE
    -- Do not bypass another role's job ownership. Install a separately owned
    -- authenticated replacement. The old anon request is rejected by the
    -- worker and must be removed later by its owner; it cannot claim jobs.
    IF worker.command LIKE '%x-cron-secret%' OR worker.command LIKE '%vault.%' THEN
      RAISE EXCEPTION 'Existing foreign-owned worker already uses private credentials; owner review required';
    END IF;
    replacement_id := cron.schedule('process-sync-jobs-authenticated-every-minute', worker.schedule, secured_command);
    PERFORM cron.alter_job(replacement_id, active := worker.active);
  END IF;
END;
$migration$;
