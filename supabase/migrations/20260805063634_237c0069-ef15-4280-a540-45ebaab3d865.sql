DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'advance_booking_source_revision';

  IF v_def IS NOT NULL AND position('ARRAY[''source_revision'']::text[]' in v_def) > 0 THEN
    v_new := replace(v_def, 'ARRAY[''source_revision'']::text[]', 'to_jsonb(ARRAY[''source_revision''])');
    EXECUTE v_new;
    RAISE NOTICE 'advance_booking_source_revision: changed_fields cast fixed';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_booking_cancellation_atomic';

  IF v_def IS NOT NULL AND position('ARRAY[''status'']::text[]' in v_def) > 0 THEN
    v_new := replace(v_def, 'ARRAY[''status'']::text[]', 'to_jsonb(ARRAY[''status''])');
    EXECUTE v_new;
    RAISE NOTICE 'apply_booking_cancellation_atomic: changed_fields cast fixed';
  END IF;
END
$do$;