CREATE OR REPLACE FUNCTION public.trunc_to_second_immutable(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT to_timestamp(floor(extract(epoch from ts)))
$$;