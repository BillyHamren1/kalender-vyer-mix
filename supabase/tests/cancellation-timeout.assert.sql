DO $$
DECLARE before_row record; after_row record;
BEGIN
  SELECT * INTO STRICT before_row FROM cancellation_timeout_before;
  SELECT * INTO STRICT after_row FROM pg_proc WHERE oid = before_row.oid;
  IF after_row.prosrc IS DISTINCT FROM before_row.prosrc
    OR after_row.proacl IS DISTINCT FROM before_row.proacl
    OR after_row.proowner IS DISTINCT FROM before_row.proowner
    OR after_row.prosecdef IS DISTINCT FROM before_row.prosecdef
  THEN RAISE EXCEPTION 'cancellation owner body/security/ACL changed'; END IF;
  IF NOT coalesce('statement_timeout=45s' = ANY(after_row.proconfig), false) THEN
    RAISE EXCEPTION 'bounded cancellation owner timeout missing';
  END IF;
  IF array(SELECT x FROM unnest(after_row.proconfig) x
      WHERE x NOT LIKE 'statement_timeout=%' ORDER BY x)
    IS DISTINCT FROM array(SELECT x FROM unnest(before_row.proconfig) x
      WHERE x NOT LIKE 'statement_timeout=%' ORDER BY x)
  THEN RAISE EXCEPTION 'unrelated owner configuration changed'; END IF;
  IF EXISTS (SELECT 1 FROM cancellation_timeout_other_functions b
    JOIN pg_proc p ON p.oid=b.oid WHERE p.proconfig IS DISTINCT FROM b.proconfig)
  THEN RAISE EXCEPTION 'unrelated function configuration changed'; END IF;
  IF EXISTS (SELECT 1 FROM cancellation_timeout_roles b JOIN pg_roles r ON r.oid=b.oid
    WHERE r.rolconfig IS DISTINCT FROM b.rolconfig)
  THEN RAISE EXCEPTION 'role timeout/lock settings changed'; END IF;
  IF NOT has_function_privilege('service_role', before_row.oid, 'EXECUTE')
    OR has_function_privilege('anon', before_row.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', before_row.oid, 'EXECUTE')
  THEN RAISE EXCEPTION 'service-only cancellation grant changed'; END IF;
  RAISE NOTICE 'PASS cancellation owner bounded timeout; body, ACL, other functions and roles unchanged';
END $$;
