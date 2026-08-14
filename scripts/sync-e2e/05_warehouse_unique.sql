-- STEG 4O · Sektion: warehouse_assignments tenant-uniqueness + idempotens
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $e2e$
DECLARE
  org_a uuid; org_b uuid;
  bid text := 'E2E-WH-1';
  sid text := 'E2E-WH-STAFF';
  d date := date '2031-02-02';
  n int;
BEGIN
  INSERT INTO public.organizations(name, slug) VALUES ('E2E WH A','e2e-wh-a') RETURNING id INTO org_a;
  INSERT INTO public.organizations(name, slug) VALUES ('E2E WH B','e2e-wh-b') RETURNING id INTO org_b;

  INSERT INTO public.warehouse_assignments(organization_id, staff_id, assignment_date, assignment_type, action, title, booking_id)
  VALUES (org_a, sid, d, 'rig', 'load', 'E2E WH A', bid);

  BEGIN
    INSERT INTO public.warehouse_assignments(organization_id, staff_id, assignment_date, assignment_type, action, title, booking_id)
    VALUES (org_b, sid, d, 'rig', 'load', 'E2E WH B', bid);
    INSERT INTO e2e_results VALUES ('warehouse_cross_tenant_coexistence','PASS','samma booking/rig kan finnas i två tenants');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO e2e_results VALUES ('warehouse_cross_tenant_coexistence','FAIL','globalt unique index blockerar cross-tenant warehouse-rad');
  END;

  -- Duplicate inom samma tenant/key ska hanteras idempotent (unique eller no-op)
  BEGIN
    INSERT INTO public.warehouse_assignments(organization_id, staff_id, assignment_date, assignment_type, action, title, booking_id)
    VALUES (org_a, sid, d, 'rig', 'load', 'E2E WH A dup', bid);
    SELECT count(*) INTO n FROM public.warehouse_assignments
     WHERE organization_id = org_a AND booking_id = bid AND assignment_date = d AND assignment_type = 'rig';
    IF n = 1 THEN
      INSERT INTO e2e_results VALUES ('warehouse_same_tenant_idempotent','PASS','1 rad kvar efter dubblettförsök');
    ELSE
      INSERT INTO e2e_results VALUES ('warehouse_same_tenant_idempotent','FAIL','dubbletter tillåtna inom tenant: '||n||' rader');
    END IF;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO e2e_results VALUES ('warehouse_same_tenant_idempotent','PASS','unique constraint stoppar dubblett inom tenant');
  END;
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
