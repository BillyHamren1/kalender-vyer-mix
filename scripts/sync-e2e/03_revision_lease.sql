-- STEG 4O · Sektion: revision lease (reservation, blockering, takeover, commit-avslag)
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_results(check_name text, status text, detail text) ON COMMIT DROP;

DO $e2e$
DECLARE
  org uuid;
  bid text := 'E2E-REV-1';
  a jsonb; b jsonb; c jsonb; d jsonb;
  token_a uuid; token_b uuid;
  ts timestamptz := now();
BEGIN
  INSERT INTO public.organizations(name, slug) VALUES ('E2E Rev Org','e2e-rev-org') RETURNING id INTO org;

  -- Worker A tar lease
  a := public.advance_booking_source_revision(org, bid, ts, 1, 'CONFIRMED', 'reserve', NULL, 'worker-a', 300);
  token_a := (a->>'reservation_token')::uuid;
  IF token_a IS NOT NULL THEN
    INSERT INTO e2e_results VALUES ('lease_worker_a_acquires','PASS', a::text);
  ELSE
    INSERT INTO e2e_results VALUES ('lease_worker_a_acquires','FAIL', a::text);
  END IF;

  -- Worker B blockeras medan leaset lever
  b := public.advance_booking_source_revision(org, bid, ts, 1, 'CONFIRMED', 'reserve', NULL, 'worker-b', 300);
  IF (b->>'reservation_token') IS NULL OR (b->>'reservation_token')::uuid IS DISTINCT FROM token_a THEN
    IF (b->>'reservation_token') IS NULL THEN
      INSERT INTO e2e_results VALUES ('lease_worker_b_blocked','PASS', b::text);
    ELSE
      INSERT INTO e2e_results VALUES ('lease_worker_b_blocked','FAIL','worker B fick eget token trots aktivt lease: '||b::text);
    END IF;
  ELSE
    INSERT INTO e2e_results VALUES ('lease_worker_b_blocked','FAIL','worker B fick samma token: '||b::text);
  END IF;

  -- Låt leaset gå ut → takeover
  UPDATE public.booking_source_state
     SET lock_expires_at = now() - interval '1 minute'
   WHERE organization_id = org AND booking_id = bid;

  c := public.advance_booking_source_revision(org, bid, ts, 1, 'CONFIRMED', 'reserve', NULL, 'worker-b', 300);
  token_b := (c->>'reservation_token')::uuid;
  IF token_b IS NOT NULL AND token_b IS DISTINCT FROM token_a THEN
    INSERT INTO e2e_results VALUES ('lease_expiry_takeover','PASS', c::text);
  ELSE
    INSERT INTO e2e_results VALUES ('lease_expiry_takeover','FAIL', c::text);
  END IF;

  -- Worker A försöker committa efter takeover → måste nekas
  d := public.advance_booking_source_revision(org, bid, ts, 1, 'CONFIRMED', 'commit', token_a, 'worker-a', 300);
  IF d->>'decision' IN ('reservation_lost','stale_token','rejected','conflict') THEN
    INSERT INTO e2e_results VALUES ('lease_stale_commit_rejected','PASS', d::text);
  ELSE
    INSERT INTO e2e_results VALUES ('lease_stale_commit_rejected','FAIL','stale worker fick committa: '||d::text);
  END IF;

  -- Revision får inte ha applicerats av den stale committen
  IF EXISTS (
    SELECT 1 FROM public.booking_source_state
     WHERE organization_id = org AND booking_id = bid
       AND applied_source_version IS DISTINCT FROM 1
  ) OR NOT EXISTS (
    SELECT 1 FROM public.booking_source_state
     WHERE organization_id = org AND booking_id = bid AND applied_source_version = 1
  ) THEN
    INSERT INTO e2e_results VALUES ('lease_no_revision_commit_after_takeover','PASS','applied_source_version ej satt av stale worker');
  ELSE
    INSERT INTO e2e_results VALUES ('lease_no_revision_commit_after_takeover','FAIL','revision committades av stale worker');
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
