-- Durable per-booking generations prevent out-of-order Economy cache writes
-- when overlapping requests finish in a different order.
CREATE TABLE public.economy_cache_refresh_state (
  organization_id uuid NOT NULL,
  booking_id text NOT NULL,
  generation bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, booking_id)
);

ALTER TABLE public.economy_cache_refresh_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.economy_cache_refresh_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.economy_cache_refresh_state TO service_role;

CREATE OR REPLACE FUNCTION public.claim_economy_cache_refresh(
  p_organization_id uuid,
  p_booking_ids text[]
)
RETURNS TABLE (booking_id text, generation bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH requested AS (
    SELECT DISTINCT unnest(coalesce(p_booking_ids, ARRAY[]::text[])) AS booking_id
  ), claimed AS (
    INSERT INTO public.economy_cache_refresh_state AS state (organization_id, booking_id, generation)
    SELECT p_organization_id, requested.booking_id, 1
    FROM requested
    WHERE requested.booking_id IS NOT NULL AND requested.booking_id <> ''
    ORDER BY requested.booking_id
    ON CONFLICT (organization_id, booking_id)
    DO UPDATE SET generation = state.generation + 1
    RETURNING state.booking_id, state.generation
  ), invalidated AS (
    DELETE FROM public.economy_cache AS cache
    USING claimed
    WHERE cache.organization_id = p_organization_id
      AND cache.booking_id = claimed.booking_id
    RETURNING cache.booking_id
  )
  SELECT claimed.booking_id, claimed.generation FROM claimed;
$$;

CREATE OR REPLACE FUNCTION public.write_economy_cache_if_current(
  p_organization_id uuid,
  p_booking_id text,
  p_generation bigint,
  p_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_generation bigint;
  affected integer;
BEGIN
  SELECT state.generation INTO current_generation
  FROM public.economy_cache_refresh_state AS state
  WHERE state.organization_id = p_organization_id
    AND state.booking_id = p_booking_id
  FOR UPDATE;

  IF current_generation IS NULL OR current_generation <> p_generation THEN
    RETURN false;
  END IF;

  INSERT INTO public.economy_cache (booking_id, organization_id, data, cached_at)
  VALUES (p_booking_id, p_organization_id, p_data, now())
  ON CONFLICT (booking_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        data = EXCLUDED.data,
        cached_at = EXCLUDED.cached_at
    WHERE public.economy_cache.organization_id = p_organization_id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_economy_cache_refresh(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_economy_cache_refresh(uuid, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.write_economy_cache_if_current(uuid, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_economy_cache_if_current(uuid, text, bigint, jsonb) TO service_role;

COMMENT ON TABLE public.economy_cache_refresh_state IS
  'Service-only per-organization, per-booking refresh generations for stale-write protection.';
