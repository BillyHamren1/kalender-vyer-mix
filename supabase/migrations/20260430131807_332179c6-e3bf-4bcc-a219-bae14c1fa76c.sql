-- Immutable second-truncation helper (date_trunc on timestamptz är inte immutable)
CREATE OR REPLACE FUNCTION public.trunc_to_second_immutable(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_timestamp(floor(extract(epoch from ts)))
$$;

-- 1) Städa dubbletter
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY staff_id, organization_id,
                   public.trunc_to_second_immutable(start_time),
                   public.trunc_to_second_immutable(end_time)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.travel_time_logs
  WHERE source = 'gap_derived'
)
DELETE FROM public.travel_time_logs t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 2) Normalisera till hel sekund
UPDATE public.travel_time_logs
SET start_time = public.trunc_to_second_immutable(start_time),
    end_time   = public.trunc_to_second_immutable(end_time)
WHERE source = 'gap_derived'
  AND (start_time <> public.trunc_to_second_immutable(start_time)
    OR end_time   <> public.trunc_to_second_immutable(end_time));

-- 3) Ersätt unique-index
DROP INDEX IF EXISTS public.travel_time_logs_gap_idempotent_idx;
CREATE UNIQUE INDEX travel_time_logs_gap_idempotent_idx
  ON public.travel_time_logs
  (staff_id, organization_id,
   public.trunc_to_second_immutable(start_time),
   public.trunc_to_second_immutable(end_time))
  WHERE source = 'gap_derived';