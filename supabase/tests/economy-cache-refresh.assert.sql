DO $$
DECLARE
  org_a uuid := '11111111-1111-4111-8111-111111111111';
  org_b uuid := '22222222-2222-4222-8222-222222222222';
  booking_a text := 'booking-a';
  booking_b text := 'booking-b';
  old_generation bigint;
  latest_generation bigint;
  saved_cost text;
BEGIN
  INSERT INTO public.economy_cache (booking_id, organization_id, data)
  VALUES
    (booking_a, org_a, '{"product_costs":{"total_cost":10}}'),
    (booking_b, org_b, '{"product_costs":{"total_cost":20}}');

  SELECT generation INTO old_generation
  FROM public.claim_economy_cache_refresh(org_a, ARRAY[booking_a]);
  IF old_generation <> 1 THEN RAISE EXCEPTION 'first generation should be 1'; END IF;
  IF EXISTS (SELECT 1 FROM public.economy_cache WHERE booking_id = booking_a AND organization_id = org_a) THEN
    RAISE EXCEPTION 'claim must invalidate only its tenant cache row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.economy_cache WHERE booking_id = booking_b AND organization_id = org_b) THEN
    RAISE EXCEPTION 'claim deleted another tenant cache row';
  END IF;

  SELECT generation INTO latest_generation
  FROM public.claim_economy_cache_refresh(org_a, ARRAY[booking_a]);
  IF latest_generation <> old_generation + 1 THEN RAISE EXCEPTION 'generation did not advance'; END IF;

  -- Simulate two overlapping refreshes where the older upstream response
  -- completes after the newer one.
  IF NOT public.write_economy_cache_if_current(
    org_a, booking_a, latest_generation, '{"product_costs":{"total_cost":250}}'
  ) THEN RAISE EXCEPTION 'latest generation write was rejected'; END IF;
  IF public.write_economy_cache_if_current(
    org_a, booking_a, old_generation, '{"product_costs":{"total_cost":100}}'
  ) THEN RAISE EXCEPTION 'stale generation overwrote newer cache'; END IF;
  SELECT data #>> '{product_costs,total_cost}' INTO saved_cost
  FROM public.economy_cache WHERE booking_id = booking_a AND organization_id = org_a;
  IF saved_cost <> '250' THEN RAISE EXCEPTION 'newer cache amount was not preserved'; END IF;

  -- A globally unique booking ID collision across tenants must fail closed.
  PERFORM public.claim_economy_cache_refresh(org_a, ARRAY[booking_b]);
  IF public.write_economy_cache_if_current(
    org_a, booking_b, 1, '{"product_costs":{"total_cost":999}}'
  ) THEN RAISE EXCEPTION 'cross-tenant cache conflict was accepted'; END IF;
  IF (SELECT data #>> '{product_costs,total_cost}' FROM public.economy_cache WHERE booking_id = booking_b) <> '20' THEN
    RAISE EXCEPTION 'cross-tenant cache value was modified';
  END IF;

  IF has_function_privilege('authenticated', 'public.claim_economy_cache_refresh(uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated role must not claim service cache refreshes';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_economy_cache_refresh(uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role must be able to claim cache refreshes';
  END IF;
END;
$$;
