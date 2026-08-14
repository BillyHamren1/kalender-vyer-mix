-- STEG 4O · Sektion: BSA tenant identity + recompute_booking_staff_for_day_v2
-- Körs i transaktion och ROLLBACKas alltid → ingen kvarlämnad data.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $e2e$
DECLARE
  org_a uuid;
  org_b uuid;
  bid   text := 'E2E-BOOK-1';
  sid   text := 'E2E-STAFF-1';
  d     date := date '2031-01-15';
  res_a jsonb;
  res_b jsonb;
  cnt_a int;
  cnt_b int;
  both_ok boolean := false;
  err text;
BEGIN
  INSERT INTO public.organizations(name, slug) VALUES ('E2E Org A','e2e-org-a') RETURNING id INTO org_a;
  INSERT INTO public.organizations(name, slug) VALUES ('E2E Org B','e2e-org-b') RETURNING id INTO org_b;

  INSERT INTO public.staff_members(id, name, organization_id) VALUES (sid, 'E2E Staff', org_a);
  INSERT INTO public.bookings(id, client, organization_id) VALUES (bid, 'E2E Client A', org_a);

  -- Samma logiska booking_id i ORG_B (cross-tenant kollision är hela poängen)
  BEGIN
    INSERT INTO public.bookings(id, client, organization_id) VALUES (bid, 'E2E Client B', org_b);
    INSERT INTO e2e_results VALUES ('bookings_pk_is_global','INFO','booking_id är global PK – ORG_B använder eget id i övriga steg');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO e2e_results VALUES ('bookings_pk_is_global','INFO','bookings.id är global PK: samma booking_id kan inte finnas i två tenants');
  END;

  INSERT INTO public.staff_assignments(staff_id, team_id, assignment_date, organization_id)
  VALUES (sid, 'team-1', d, org_a);

  INSERT INTO public.calendar_events(booking_id, event_type, source_date, resource_id, title, start_time, end_time, organization_id)
  VALUES (bid, 'rig', d, 'team-1', 'E2E rig', d::timestamptz, d::timestamptz + interval '4 hours', org_a);

  -- Fabricera en BSA-rad för ORG_B med samma logiska nyckel
  BEGIN
    INSERT INTO public.booking_staff_assignments(booking_id, staff_id, team_id, assignment_date, organization_id)
    VALUES (bid, sid, 'team-9', d, org_b);
    both_ok := true;
    INSERT INTO e2e_results VALUES ('bsa_cross_tenant_coexistence','PASS','ORG_A och ORG_B kan ha varsin BSA-rad för samma booking/staff/date');
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    INSERT INTO e2e_results VALUES ('bsa_cross_tenant_coexistence','FAIL','legacy globalt unique index blockerar cross-tenant BSA: '||err);
  END;

  -- Kör V2 RPC för ORG_A
  res_a := public.recompute_booking_staff_for_day_v2(org_a, bid, d);
  IF (res_a->>'ok')::boolean AND (res_a->>'added')::int >= 1 THEN
    INSERT INTO e2e_results VALUES ('bsa_v2_rpc_adds_for_own_org','PASS', res_a::text);
  ELSE
    INSERT INTO e2e_results VALUES ('bsa_v2_rpc_adds_for_own_org','FAIL', res_a::text);
  END IF;

  SELECT count(*) INTO cnt_a FROM public.booking_staff_assignments
   WHERE organization_id = org_a AND booking_id = bid AND assignment_date = d;
  SELECT count(*) INTO cnt_b FROM public.booking_staff_assignments
   WHERE organization_id = org_b AND booking_id = bid AND assignment_date = d;

  IF both_ok THEN
    IF cnt_b = 1 THEN
      INSERT INTO e2e_results VALUES ('bsa_org_b_untouched','PASS','ORG_B-raden oförändrad efter ORG_A-recompute');
    ELSE
      INSERT INTO e2e_results VALUES ('bsa_org_b_untouched','FAIL','ORG_B rader = '||cnt_b||' (förväntat 1)');
    END IF;
  ELSE
    INSERT INTO e2e_results VALUES ('bsa_org_b_untouched','NOT EXECUTED','ORG_B-raden kunde inte skapas (se coexistence-check)');
  END IF;

  IF cnt_a >= 1 THEN
    INSERT INTO e2e_results VALUES ('bsa_org_a_has_rows','PASS','ORG_A rader = '||cnt_a);
  ELSE
    INSERT INTO e2e_results VALUES ('bsa_org_a_has_rows','FAIL','ORG_A rader = '||cnt_a);
  END IF;

  -- Fel organisation: RPC ska vara fail-closed och INTE mutera något
  res_b := public.recompute_booking_staff_for_day_v2(org_b, bid, d);
  IF (res_b->>'ok')::boolean IS NOT TRUE AND res_b->>'reason' = 'booking_not_in_organization' THEN
    INSERT INTO e2e_results VALUES ('bsa_v2_wrong_org_fail_closed','PASS', res_b::text);
  ELSIF (res_b->>'added')::int = 0 AND (res_b->>'removed')::int = 0 THEN
    INSERT INTO e2e_results VALUES ('bsa_v2_wrong_org_fail_closed','PASS','inga mutationer: '||res_b::text);
  ELSE
    INSERT INTO e2e_results VALUES ('bsa_v2_wrong_org_fail_closed','FAIL', res_b::text);
  END IF;

  -- Saknad organisation
  res_b := public.recompute_booking_staff_for_day_v2(NULL, bid, d);
  IF (res_b->>'ok')::boolean IS NOT TRUE THEN
    INSERT INTO e2e_results VALUES ('bsa_v2_missing_org_fail_closed','PASS', res_b::text);
  ELSE
    INSERT INTO e2e_results VALUES ('bsa_v2_missing_org_fail_closed','FAIL', res_b::text);
  END IF;

  -- Unique index måste vara tenant-scopad
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='booking_staff_assignments'
       AND indexdef ILIKE '%UNIQUE%organization_id, booking_id, staff_id, assignment_date%'
  ) THEN
    INSERT INTO e2e_results VALUES ('bsa_tenant_unique_index_exists','PASS','org-scopat unique index finns');
  ELSE
    INSERT INTO e2e_results VALUES ('bsa_tenant_unique_index_exists','FAIL','saknar org-scopat unique index');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='booking_staff_assignments'
       AND indexdef ILIKE '%UNIQUE%(booking_id, staff_id, assignment_date)%'
  ) THEN
    INSERT INTO e2e_results VALUES ('bsa_legacy_global_index_removed','FAIL','legacy globalt unique index finns kvar');
  ELSE
    INSERT INTO e2e_results VALUES ('bsa_legacy_global_index_removed','PASS','legacy globalt unique index borta');
  END IF;
END
$e2e$;

SELECT check_name, status, detail FROM e2e_results ORDER BY check_name;

DO $g$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM e2e_results WHERE status = 'FAIL';
  IF n > 0 THEN RAISE EXCEPTION 'SECTION FAILED: % failing checks', n; END IF;
END
$g$;

ROLLBACK;
