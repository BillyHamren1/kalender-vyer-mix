-- STEG 4O · Sektion: SECURITY DEFINER-ytor som syncen använder
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $e2e$
DECLARE
  fn text;
  needed text[] := ARRAY[
    'recompute_booking_staff_for_day_v2',
    'advance_booking_source_revision',
    'apply_booking_cancellation_atomic',
    'claim_sync_jobs',
    'complete_sync_job',
    'fail_sync_job',
    'finalize_sync_batch'
  ];
  ok boolean;
  legacy_grants int;
BEGIN
  FOREACH fn IN ARRAY needed LOOP
    SELECT bool_and(p.prosecdef) INTO ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname = fn;
    IF ok IS NULL THEN
      INSERT INTO e2e_results VALUES ('secdef_'||fn,'FAIL','funktionen saknas i test-DB');
    ELSIF ok THEN
      INSERT INTO e2e_results VALUES ('secdef_'||fn,'PASS','SECURITY DEFINER + search_path låst');
    ELSE
      INSERT INTO e2e_results VALUES ('secdef_'||fn,'FAIL','ej SECURITY DEFINER');
    END IF;
  END LOOP;

  -- search_path måste vara satt på alla definer-funktioner ovan
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname = ANY(needed) AND p.prosecdef
       AND (p.proconfig IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  ) THEN
    INSERT INTO e2e_results VALUES ('secdef_search_path','FAIL','minst en definer-funktion saknar search_path');
  ELSE
    INSERT INTO e2e_results VALUES ('secdef_search_path','PASS','search_path satt överallt');
  END IF;

  -- Legacy BSA-RPC får inte vara körbar för anon/authenticated
  SELECT count(*) INTO legacy_grants
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='recompute_booking_staff_for_day'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF legacy_grants > 0 THEN
    INSERT INTO e2e_results VALUES ('legacy_bsa_rpc_revoked','FAIL','anon/authenticated kan fortfarande köra legacy-RPC');
  ELSE
    INSERT INTO e2e_results VALUES ('legacy_bsa_rpc_revoked','PASS','legacy-RPC ej körbar för klientroller');
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
