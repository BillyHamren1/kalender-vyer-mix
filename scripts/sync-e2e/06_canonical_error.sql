-- STEG 4O · Sektion: canonical error → partial/failed, ingen revision commit, ingen cursor
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $e2e$
DECLARE
  org uuid;
  bid text := 'E2E-CANON-1';
  job uuid; tok uuid;
  batch uuid;
  planned timestamptz := now() + interval '1 hour';
  r record;
  raised boolean := false;
  applied bigint;
  cursor_after timestamptz;
BEGIN
  INSERT INTO public.organizations(name, slug) VALUES ('E2E Canon Org','e2e-canon-org') RETURNING id INTO org;

  -- Reservera revision (som en riktig worker gör innan canonical write)
  PERFORM public.advance_booking_source_revision(org, bid, now(), 5, 'CONFIRMED', 'reserve', NULL, 'worker-canon', 300);

  -- Provocera säker constraint failure: NOT NULL-brott i canonical skrivning
  BEGIN
    INSERT INTO public.bookings(id, client, organization_id) VALUES (bid, NULL, org);
  EXCEPTION WHEN not_null_violation OR check_violation OR foreign_key_violation THEN
    raised := true;
  END;
  IF raised THEN
    INSERT INTO e2e_results VALUES ('canonical_error_raised','PASS','constraint failure provocerad');
  ELSE
    INSERT INTO e2e_results VALUES ('canonical_error_raised','FAIL','ingen constraint failure – testdata ogiltigt');
  END IF;

  -- Workern misslyckas → jobbet failas, batchen blir partial
  INSERT INTO public.booking_sync_jobs(booking_id, organization_id, event_type, max_attempts)
  VALUES (bid, org::text, 'e2e', 1) RETURNING id INTO job;
  INSERT INTO public.sync_batches(organization_id, sync_type, planned_cursor)
  VALUES (org, 'e2e_canonical', planned) RETURNING id INTO batch;
  INSERT INTO public.sync_batch_jobs(batch_id, job_id) VALUES (batch, job);

  FOR r IN SELECT * FROM public.claim_sync_jobs(10, 'worker-canon', 300, 10) LOOP
    IF r.id = job THEN tok := r.worker_token; END IF;
  END LOOP;
  PERFORM public.fail_sync_job(job, tok, 'canonical_write_failed', false, NULL);

  SELECT * INTO r FROM public.finalize_sync_batch(batch);
  IF r.status = 'partial' THEN
    INSERT INTO e2e_results VALUES ('canonical_error_batch_partial','PASS','batch=partial');
  ELSE
    INSERT INTO e2e_results VALUES ('canonical_error_batch_partial','FAIL','batch='||coalesce(r.status,'<null>'));
  END IF;

  SELECT applied_source_version INTO applied
    FROM public.booking_source_state WHERE organization_id = org AND booking_id = bid;
  IF applied IS NULL THEN
    INSERT INTO e2e_results VALUES ('canonical_error_no_revision_commit','PASS','applied_source_version = NULL');
  ELSE
    INSERT INTO e2e_results VALUES ('canonical_error_no_revision_commit','FAIL','revision committad: '||applied);
  END IF;

  SELECT last_sync_timestamp INTO cursor_after
    FROM public.sync_state WHERE organization_id = org AND sync_type = 'e2e_canonical';
  IF cursor_after IS NULL THEN
    INSERT INTO e2e_results VALUES ('canonical_error_no_cursor','PASS','cursor oflyttad');
  ELSE
    INSERT INTO e2e_results VALUES ('canonical_error_no_cursor','FAIL','cursor='||cursor_after::text);
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
