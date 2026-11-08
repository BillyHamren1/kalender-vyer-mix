DO $$
DECLARE before_row record; after_row record;
BEGIN
  SELECT * INTO STRICT before_row FROM cancellation_timeout_before;
  SELECT * INTO STRICT after_row FROM pg_proc WHERE oid = before_row.oid;
  IF after_row.prosrc IS DISTINCT FROM before_row.prosrc
    OR after_row.proacl IS DISTINCT FROM before_row.proacl
    OR after_row.proowner IS DISTINCT FROM before_row.proowner
    OR after_row.prosecdef IS DISTINCT FROM before_row.prosecdef
    OR after_row.proconfig IS DISTINCT FROM before_row.proconfig
  THEN RAISE EXCEPTION 'rollback did not restore exact owner metadata'; END IF;
  RAISE NOTICE 'PASS cancellation timeout rollback restores exact prior metadata';
END $$;
