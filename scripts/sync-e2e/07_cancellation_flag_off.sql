-- STEG 4O · Sektion: destruktiv cancellation ska vara AV under hela E2E
-- Detta test slår ALDRIG på flaggan. Det verifierar bara att den är av.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $e2e$
DECLARE
  cron_jobs int := 0;
BEGIN
  BEGIN
    SELECT count(*) INTO cron_jobs
      FROM cron.job
     WHERE command ILIKE '%reconcile%' OR command ILIKE '%cancel%';
  EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
    cron_jobs := 0;
  END;

  IF cron_jobs = 0 THEN
    INSERT INTO e2e_results VALUES ('no_destructive_cron_scheduled','PASS','inga reconcile/cancel-cronjobb i testmiljön');
  ELSE
    INSERT INTO e2e_results VALUES ('no_destructive_cron_scheduled','FAIL', cron_jobs||' destruktiva cronjobb schemalagda');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings WHERE id LIKE 'E2E-%' AND status ILIKE '%cancel%'
  ) THEN
    INSERT INTO e2e_results VALUES ('no_cancellations_during_e2e','FAIL','E2E-bokning cancellerad');
  ELSE
    INSERT INTO e2e_results VALUES ('no_cancellations_during_e2e','PASS','inga cancelleringar utförda');
  END IF;
END
$e2e$;

SELECT check_name, status, detail FROM e2e_results ORDER BY check_name;

DO $g$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM e2e_results WHERE status='FAIL';
  IF n > 0 THEN RAISE EXCEPTION 'SECTION FAILED: % failing checks', n; END IF;
END
$g$;

ROLLBACK;
