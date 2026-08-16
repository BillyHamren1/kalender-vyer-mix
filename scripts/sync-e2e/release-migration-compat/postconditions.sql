-- ─────────────────────────────────────────────────────────────────────────────
-- STEG 4Z · POST-MIGRATION ASSERTIONS (release_migration_compatibility)
--
-- Körs EFTER att samtliga 12 release-migrationer applicerats på
-- compatibility-fixturen. Verifierar migrationskedjans AVSEDDA slutläge.
-- Ingen historisk grant-state antas: grants verifieras som post-condition.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE compat_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $c$
DECLARE
  n int;
  b boolean;
  def text;
BEGIN
  -- 1. Tenant-safe warehouse_calendar_events uniqueness
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname='public' AND tablename='warehouse_calendar_events'
     AND indexname='warehouse_calendar_events_org_booking_event_type_unique';
  INSERT INTO compat_results VALUES ('wce_tenant_unique_present',
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END, 'index count='||n);

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname='public' AND tablename='warehouse_calendar_events'
     AND indexname='warehouse_calendar_events_booking_event_type_unique';
  INSERT INTO compat_results VALUES ('wce_legacy_unique_removed',
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END, 'legacy index count='||n);

  -- 2. Lease/state machine-funktioner finns och är SECURITY DEFINER
  FOR def IN SELECT unnest(ARRAY['claim_sync_jobs','complete_sync_job','fail_sync_job',
                                 'finalize_sync_batch','recompute_booking_staff_for_day_v2'])
  LOOP
    SELECT bool_and(p.prosecdef) INTO b
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='public' AND p.proname=def;
    INSERT INTO compat_results VALUES ('secdef_'||def,
      CASE WHEN b THEN 'PASS' ELSE 'FAIL' END, coalesce(b::text,'missing'));
  END LOOP;

  -- 3. Lease-kolumner på booking_sync_jobs
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='booking_sync_jobs'
     AND column_name IN ('worker_token','worker_id','lease_expires_at');
  INSERT INTO compat_results VALUES ('sync_jobs_lease_columns',
    CASE WHEN n=3 THEN 'PASS' ELSE 'FAIL' END, 'kolumner='||n);

  -- 4. Tenant-safe BSA-identitet
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname='public' AND tablename='booking_staff_assignments'
     AND indexname='booking_staff_assignments_org_booking_staff_date_uidx';
  INSERT INTO compat_results VALUES ('bsa_tenant_unique_present',
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END, 'index count='||n);

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname='public' AND tablename='booking_staff_assignments'
     AND indexdef ILIKE '%UNIQUE%'
     AND indexdef ILIKE '%(booking_id, staff_id, assignment_date)%'
     AND indexdef NOT ILIKE '%organization_id%';
  INSERT INTO compat_results VALUES ('bsa_legacy_global_unique_removed',
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END, 'legacy unique count='||n);

  -- 5. V2 RPC: org-scoping i reads/deletes/inserts + tenant-safe ON CONFLICT
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='recompute_booking_staff_for_day_v2';
  INSERT INTO compat_results VALUES ('v2_on_conflict_tenant_safe',
    CASE WHEN def ILIKE '%ON CONFLICT (organization_id, booking_id, staff_id, assignment_date)%'
      THEN 'PASS' ELSE 'FAIL' END, 'on conflict target');
  INSERT INTO compat_results VALUES ('v2_reads_scoped_by_org',
    CASE WHEN def ILIKE '%b.organization_id = p_organization_id%'
          AND def ILIKE '%bsa.organization_id = p_organization_id%'
          AND def ILIKE '%sa.organization_id = p_organization_id%'
      THEN 'PASS' ELSE 'FAIL' END, 'read/delete/insert-scoping');
  INSERT INTO compat_results VALUES ('v2_fail_closed_booking_not_in_org',
    CASE WHEN def ILIKE '%booking_not_in_organization%' THEN 'PASS' ELSE 'FAIL' END, 'fail-closed');

  -- 6. Legacy BSA-runtime retired: delegerar till V2 och saknar klient-EXECUTE
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='recompute_booking_staff_for_day';
  INSERT INTO compat_results VALUES ('legacy_bsa_delegates_to_v2',
    CASE WHEN def ILIKE '%recompute_booking_staff_for_day_v2(v_org, p_booking_id, p_date)%'
      THEN 'PASS' ELSE 'FAIL' END, 'delegation');

  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='recompute_booking_staff_for_day'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  INSERT INTO compat_results VALUES ('legacy_bsa_rpc_not_client_executable',
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END, 'roller med EXECUTE='||n);

  -- 7. V2/service-role-behörigheter enligt releasekontraktet
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='recompute_booking_staff_for_day_v2'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  INSERT INTO compat_results VALUES ('v2_grants_match_release_contract',
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END, 'matchande funktioner='||n);

  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='finalize_sync_batch'
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO compat_results VALUES ('finalize_sync_batch_service_role_only',
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END, 'matchande funktioner='||n);

  -- 8. BSA-triggerfunktioner är tenant-scopade
  FOR def IN SELECT unnest(ARRAY['sync_team_pool_to_booking_assignments',
                                 'sync_task_assignments_to_bsa',
                                 'cleanup_task_bsa_on_delete',
                                 'sync_location_project_bsa',
                                 'sync_bsa_on_new_project_staff',
                                 'sync_project_staff_on_new_booking'])
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='public' AND p.proname=def;
    INSERT INTO compat_results VALUES ('bsa_trigger_tenant_scoped_'||
      substring(def from 'FUNCTION public\.([a-z_]+)'),
      CASE WHEN def ILIKE '%organization_id%'
            AND def ILIKE '%ON CONFLICT (organization_id, booking_id, staff_id, assignment_date)%'
        THEN 'PASS' ELSE 'FAIL' END, 'org-scoping + tenant-safe conflict target');
  END LOOP;

  -- 9. warehouse_assignments tenant-safe uniqueness
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname='public' AND tablename='warehouse_assignments'
     AND indexname='warehouse_assignments_org_booking_staff_date_type_uidx';
  INSERT INTO compat_results VALUES ('warehouse_assignments_tenant_unique',
    CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END, 'index count='||n);

  -- 10. Destruktiv cancellation fortfarande OFF (inga schemalagda jobb)
  BEGIN
    SELECT count(*) INTO n FROM cron.job
     WHERE command ILIKE '%reconcile%' OR command ILIKE '%cancel%';
  EXCEPTION WHEN undefined_table OR insufficient_privilege THEN n := 0;
  END;
  INSERT INTO compat_results VALUES ('destructive_cancellation_off',
    CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END, 'destruktiva cronjobb='||n);

  -- 11. Canonical error propagation: revision commit får inte ske vid fel
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='advance_booking_source_revision';
  INSERT INTO compat_results VALUES ('revision_incomparable_guard',
    CASE WHEN def ILIKE '%incomparable_source_revision%' THEN 'PASS' ELSE 'FAIL' END,
    'STEG 4C divergent-guard');
  INSERT INTO compat_results VALUES ('revision_millisecond_precision',
    CASE WHEN def LIKE '%HH24:MI:SS.MS%' THEN 'PASS' ELSE 'FAIL' END, 'ms i speglad revision');
END
$c$;

-- ── Funktionell körning: jobs-lease, batchfinalisering och cursor-policy ────
DO $f$
DECLARE
  org uuid; job_ok uuid; job_bad uuid; tok_ok uuid; tok_bad uuid;
  batch uuid; planned timestamptz := now() + interval '1 hour';
  r record; claimed int := 0; cursor_after timestamptz;
  bid text := 'COMPAT-BOOK-1'; sid text := 'COMPAT-STAFF-1'; d date := date '2031-03-03';
  res jsonb; cnt int;
BEGIN
  INSERT INTO public.organizations(name, slug) VALUES ('Compat Org A','compat-org-a') RETURNING id INTO org;

  INSERT INTO public.booking_sync_jobs(booking_id, organization_id, event_type)
  VALUES ('COMPAT-JOB-OK', org::text, 'compat') RETURNING id INTO job_ok;
  INSERT INTO public.booking_sync_jobs(booking_id, organization_id, event_type, max_attempts)
  VALUES ('COMPAT-JOB-BAD', org::text, 'compat', 1) RETURNING id INTO job_bad;
  INSERT INTO public.sync_batches(organization_id, sync_type, planned_cursor)
  VALUES (org, 'compat_bookings', planned) RETURNING id INTO batch;
  INSERT INTO public.sync_batch_jobs(batch_id, job_id) VALUES (batch, job_ok), (batch, job_bad);

  FOR r IN SELECT * FROM public.claim_sync_jobs(10, 'compat-worker', 300, 10) LOOP
    claimed := claimed + 1;
    IF r.id = job_ok THEN tok_ok := r.worker_token; END IF;
    IF r.id = job_bad THEN tok_bad := r.worker_token; END IF;
  END LOOP;
  INSERT INTO compat_results VALUES ('jobs_claim_with_lease',
    CASE WHEN claimed >= 2 AND tok_ok IS NOT NULL AND tok_bad IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    'claimade='||claimed);

  INSERT INTO compat_results VALUES ('jobs_wrong_token_rejected',
    CASE WHEN public.complete_sync_job(job_ok, gen_random_uuid()) THEN 'FAIL' ELSE 'PASS' END, 'fel token');
  INSERT INTO compat_results VALUES ('jobs_complete_with_token',
    CASE WHEN public.complete_sync_job(job_ok, tok_ok) THEN 'PASS' ELSE 'FAIL' END, 'rätt token');

  SELECT * INTO r FROM public.fail_sync_job(job_bad, tok_bad, 'compat canonical error', false, NULL);
  INSERT INTO compat_results VALUES ('jobs_permanent_fail',
    CASE WHEN r.updated AND r.new_status='failed' THEN 'PASS' ELSE 'FAIL' END,
    coalesce(r.new_status,'<null>'));

  SELECT * INTO r FROM public.finalize_sync_batch(batch);
  INSERT INTO compat_results VALUES ('batch_partial_no_cursor_move',
    CASE WHEN r.status='partial' AND r.cursor_advanced_to IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'status='||coalesce(r.status,'<null>'));

  SELECT last_sync_timestamp INTO cursor_after FROM public.sync_state
   WHERE organization_id = org AND sync_type='compat_bookings';
  INSERT INTO compat_results VALUES ('canonical_error_no_cursor_write',
    CASE WHEN cursor_after IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(cursor_after::text,'<null>'));

  -- V2 BSA-RPC tenant-beteende
  INSERT INTO public.staff_members(id, name, organization_id) VALUES (sid, 'Compat Staff', org);
  INSERT INTO public.bookings(id, client, organization_id) VALUES (bid, 'Compat Client', org);
  INSERT INTO public.staff_assignments(staff_id, team_id, assignment_date, organization_id)
  VALUES (sid, 'team-1', d, org);
  INSERT INTO public.calendar_events(booking_id, event_type, source_date, resource_id, title, start_time, end_time, organization_id)
  VALUES (bid, 'rig', d, 'team-1', 'Compat rig', d::timestamptz, d::timestamptz + interval '4 hours', org);

  res := public.recompute_booking_staff_for_day_v2(org, bid, d);
  SELECT count(*) INTO cnt FROM public.booking_staff_assignments
   WHERE organization_id = org AND booking_id = bid AND assignment_date = d;
  INSERT INTO compat_results VALUES ('v2_rpc_writes_tenant_rows',
    CASE WHEN (res->>'ok')::boolean AND cnt = 1 THEN 'PASS' ELSE 'FAIL' END, res::text);

  -- Idempotens via tenant-safe ON CONFLICT
  res := public.recompute_booking_staff_for_day_v2(org, bid, d);
  SELECT count(*) INTO cnt FROM public.booking_staff_assignments
   WHERE organization_id = org AND booking_id = bid AND assignment_date = d;
  INSERT INTO compat_results VALUES ('v2_rpc_idempotent',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END, 'rader='||cnt);

  -- Fail-closed för fel tenant
  res := public.recompute_booking_staff_for_day_v2(gen_random_uuid(), bid, d);
  INSERT INTO compat_results VALUES ('v2_rpc_fail_closed_other_tenant',
    CASE WHEN (res->>'reason') = 'booking_not_in_organization' THEN 'PASS' ELSE 'FAIL' END, res::text);

  -- Cross-tenant coexistence i warehouse_assignments
  BEGIN
    INSERT INTO public.warehouse_assignments(organization_id, booking_id, staff_id, assignment_date, assignment_type, action, title)
    VALUES (org, 'COMPAT-WH', sid, d, 'rig', 'load', 'A');
    INSERT INTO public.warehouse_assignments(organization_id, booking_id, staff_id, assignment_date, assignment_type, action, title)
    VALUES (gen_random_uuid(), 'COMPAT-WH', sid, d, 'rig', 'load', 'B');
    INSERT INTO compat_results VALUES ('warehouse_cross_tenant_coexistence','PASS','två tenants kan samexistera');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO compat_results VALUES ('warehouse_cross_tenant_coexistence','FAIL','globalt unique blockerar');
  END;
  BEGIN
    INSERT INTO public.warehouse_assignments(organization_id, booking_id, staff_id, assignment_date, assignment_type, action, title)
    VALUES (org, 'COMPAT-WH', sid, d, 'rig', 'load', 'A-dup');
    INSERT INTO compat_results VALUES ('warehouse_same_tenant_unique','FAIL','dubblett tilläts inom tenant');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO compat_results VALUES ('warehouse_same_tenant_unique','PASS','dubblett stoppas inom tenant');
  END;

  -- Cross-tenant coexistence i warehouse_calendar_events (samma booking/event_type)
  BEGIN
    INSERT INTO public.warehouse_calendar_events(organization_id, booking_id, event_type, title)
    VALUES (org, 'COMPAT-WCE', 'rig', 'A');
    INSERT INTO public.warehouse_calendar_events(organization_id, booking_id, event_type, title)
    VALUES (gen_random_uuid(), 'COMPAT-WCE', 'rig', 'B');
    INSERT INTO compat_results VALUES ('wce_cross_tenant_coexistence','PASS','två tenants kan samexistera');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO compat_results VALUES ('wce_cross_tenant_coexistence','FAIL','legacy global unikhet kvar');
  END;
  BEGIN
    INSERT INTO public.warehouse_calendar_events(organization_id, booking_id, event_type, title)
    VALUES (org, 'COMPAT-WCE', 'rig', 'A-dup');
    INSERT INTO compat_results VALUES ('wce_same_tenant_unique','FAIL','dubblett tilläts inom tenant');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO compat_results VALUES ('wce_same_tenant_unique','PASS','dubblett stoppas inom tenant');
  END;
END
$f$;

SELECT check_name, status, detail FROM compat_results ORDER BY check_name;

DO $g$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM compat_results WHERE status <> 'PASS';
  IF n > 0 THEN RAISE EXCEPTION 'POSTCONDITIONS FAILED: % checks', n; END IF;
END
$g$;

ROLLBACK;
