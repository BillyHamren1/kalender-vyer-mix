-- STEG 4O · Sektion: claim/complete/fail jobs + finalize_sync_batch + cursor-policy
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $e2e$
DECLARE
  org uuid;
  job_ok uuid; job_bad uuid;
  tok_ok uuid; tok_bad uuid;
  batch uuid;
  planned timestamptz := now() + interval '1 hour';
  r record;
  claimed int;
  cursor_after timestamptz;
BEGIN
  INSERT INTO public.organizations(name, slug) VALUES ('E2E Batch Org','e2e-batch-org') RETURNING id INTO org;

  INSERT INTO public.booking_sync_jobs(booking_id, organization_id, event_type)
  VALUES ('E2E-JOB-OK', org::text, 'e2e') RETURNING id INTO job_ok;
  INSERT INTO public.booking_sync_jobs(booking_id, organization_id, event_type, max_attempts)
  VALUES ('E2E-JOB-BAD', org::text, 'e2e', 1) RETURNING id INTO job_bad;

  INSERT INTO public.sync_batches(organization_id, sync_type, planned_cursor)
  VALUES (org, 'e2e_bookings', planned) RETURNING id INTO batch;
  INSERT INTO public.sync_batch_jobs(batch_id, job_id) VALUES (batch, job_ok), (batch, job_bad);

  -- Claim
  claimed := 0;
  FOR r IN SELECT * FROM public.claim_sync_jobs(10, 'worker-e2e', 300, 10) LOOP
    claimed := claimed + 1;
    IF r.id = job_ok THEN tok_ok := r.worker_token; END IF;
    IF r.id = job_bad THEN tok_bad := r.worker_token; END IF;
  END LOOP;
  IF claimed >= 2 AND tok_ok IS NOT NULL AND tok_bad IS NOT NULL THEN
    INSERT INTO e2e_results VALUES ('jobs_claim','PASS','claimade '||claimed||' jobb med worker_token');
  ELSE
    INSERT INTO e2e_results VALUES ('jobs_claim','FAIL','claimade '||claimed||' jobb');
  END IF;

  -- Fel token får inte kunna completa
  IF public.complete_sync_job(job_ok, gen_random_uuid()) THEN
    INSERT INTO e2e_results VALUES ('jobs_wrong_token_rejected','FAIL','fel worker_token fick completa jobbet');
  ELSE
    INSERT INTO e2e_results VALUES ('jobs_wrong_token_rejected','PASS','fel worker_token nekas');
  END IF;

  IF public.complete_sync_job(job_ok, tok_ok) THEN
    INSERT INTO e2e_results VALUES ('jobs_complete','PASS','jobb completat med rätt token');
  ELSE
    INSERT INTO e2e_results VALUES ('jobs_complete','FAIL','complete_sync_job misslyckades');
  END IF;

  -- Permanent fail (retriable=false)
  SELECT * INTO r FROM public.fail_sync_job(job_bad, tok_bad, 'e2e canonical error', false, NULL);
  IF r.updated AND r.new_status = 'failed' THEN
    INSERT INTO e2e_results VALUES ('jobs_fail_permanent','PASS','status=failed');
  ELSE
    INSERT INTO e2e_results VALUES ('jobs_fail_permanent','FAIL', coalesce(r.new_status,'<null>'));
  END IF;

  -- Batch med ett failat jobb → partial, cursorn får INTE flyttas
  SELECT * INTO r FROM public.finalize_sync_batch(batch);
  IF r.status = 'partial' AND r.cursor_advanced_to IS NULL THEN
    INSERT INTO e2e_results VALUES ('batch_partial_no_cursor','PASS','status=partial, cursor oflyttad');
  ELSE
    INSERT INTO e2e_results VALUES ('batch_partial_no_cursor','FAIL','status='||coalesce(r.status,'<null>')||' cursor='||coalesce(r.cursor_advanced_to::text,'<null>'));
  END IF;

  SELECT last_sync_timestamp INTO cursor_after
    FROM public.sync_state WHERE organization_id = org AND sync_type = 'e2e_bookings';
  IF cursor_after IS NULL THEN
    INSERT INTO e2e_results VALUES ('cursor_not_written_on_partial','PASS','ingen sync_state-rad skapad');
  ELSE
    INSERT INTO e2e_results VALUES ('cursor_not_written_on_partial','FAIL','cursor skrevs: '||cursor_after::text);
  END IF;

  -- Ny batch, allt lyckas → cursor får flyttas monotont
  INSERT INTO public.booking_sync_jobs(booking_id, organization_id, event_type)
  VALUES ('E2E-JOB-OK2', org::text, 'e2e') RETURNING id INTO job_ok;
  INSERT INTO public.sync_batches(organization_id, sync_type, planned_cursor)
  VALUES (org, 'e2e_bookings', planned) RETURNING id INTO batch;
  INSERT INTO public.sync_batch_jobs(batch_id, job_id) VALUES (batch, job_ok);

  FOR r IN SELECT * FROM public.claim_sync_jobs(10, 'worker-e2e', 300, 10) LOOP
    IF r.id = job_ok THEN tok_ok := r.worker_token; END IF;
  END LOOP;
  PERFORM public.complete_sync_job(job_ok, tok_ok);

  SELECT * INTO r FROM public.finalize_sync_batch(batch);
  IF r.status = 'success' AND r.cursor_advanced_to = planned THEN
    INSERT INTO e2e_results VALUES ('batch_success_cursor_advances','PASS','cursor flyttad till planned_cursor');
  ELSE
    INSERT INTO e2e_results VALUES ('batch_success_cursor_advances','FAIL','status='||coalesce(r.status,'<null>')||' cursor='||coalesce(r.cursor_advanced_to::text,'<null>'));
  END IF;

  -- Bakåtflytt måste blockeras (monotonic)
  INSERT INTO public.booking_sync_jobs(booking_id, organization_id, event_type)
  VALUES ('E2E-JOB-OK3', org::text, 'e2e') RETURNING id INTO job_ok;
  INSERT INTO public.sync_batches(organization_id, sync_type, planned_cursor)
  VALUES (org, 'e2e_bookings', planned - interval '2 hours') RETURNING id INTO batch;
  INSERT INTO public.sync_batch_jobs(batch_id, job_id) VALUES (batch, job_ok);
  FOR r IN SELECT * FROM public.claim_sync_jobs(10, 'worker-e2e', 300, 10) LOOP
    IF r.id = job_ok THEN tok_ok := r.worker_token; END IF;
  END LOOP;
  PERFORM public.complete_sync_job(job_ok, tok_ok);
  SELECT * INTO r FROM public.finalize_sync_batch(batch);

  SELECT last_sync_timestamp INTO cursor_after
    FROM public.sync_state WHERE organization_id = org AND sync_type = 'e2e_bookings';
  IF cursor_after = planned THEN
    INSERT INTO e2e_results VALUES ('cursor_monotonic','PASS','cursor flyttades inte bakåt');
  ELSE
    INSERT INTO e2e_results VALUES ('cursor_monotonic','FAIL','cursor='||coalesce(cursor_after::text,'<null>'));
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
