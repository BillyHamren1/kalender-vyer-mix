DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE command ILIKE '%reconcile-booking-status%'
       OR jobname ILIKE '%reconcile-booking-status%'
  LOOP
    -- Idempotent: unschedule tar bort jobbet helt. Övriga cronjobb rörs inte.
    PERFORM cron.unschedule(r.jobid);
    RAISE NOTICE 'Unscheduled cancellation cron job % (%)', r.jobid, r.jobname;
  END LOOP;
END $$;