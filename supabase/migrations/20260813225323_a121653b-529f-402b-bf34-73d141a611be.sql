DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'advance_booking_source_revision';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'advance_booking_source_revision not found';
  END IF;

  v_new := v_def;

  -- STEG 4C: divergent 'both' (ett fält äldre + ett nyare) är ALDRIG stale.
  IF position('IF v_has_older AND v_has_newer THEN' in v_new) = 0 THEN
    v_new := replace(
      v_new,
      '    IF v_has_older THEN',
      '    IF v_has_older AND v_has_newer THEN' || chr(10) ||
      '      RETURN jsonb_build_object(''decision'', ''incomparable_source_revision'');' || chr(10) ||
      '    END IF;' || chr(10) ||
      '    IF v_has_older THEN'
    );
  END IF;

  -- STEG 4C: speglad/auditad revision får inte tappa millisekunder.
  v_new := replace(
    v_new,
    'YYYY-MM-DD"T"HH24:MI:SS"Z"',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  IF v_new IS DISTINCT FROM v_def THEN
    EXECUTE v_new;
    RAISE NOTICE 'advance_booking_source_revision: STEG 4C revision contract applied';
  END IF;
END
$do$;