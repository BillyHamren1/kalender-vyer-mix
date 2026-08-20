
CREATE OR REPLACE FUNCTION public.is_noise_booking_change(_changed_fields jsonb, _previous jsonb, _new jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH keys AS (
    SELECT CASE
      WHEN jsonb_typeof(coalesce(_changed_fields, '{}'::jsonb)) = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(_changed_fields))
      WHEN jsonb_typeof(coalesce(_changed_fields, '{}'::jsonb)) = 'object'
        THEN ARRAY(SELECT jsonb_object_keys(_changed_fields))
      ELSE ARRAY[]::text[]
    END AS k
  )
  SELECT
    ('status' = ANY(k)
      AND upper(coalesce(_previous ->> 'status', '')) IN (
        'OFFER','OFFERT','QUOTE','DRAFT','PENDING','TENTATIVE','RESERVED',
        'AWAITINGAPPROVAL','AWAITING_APPROVAL','AWAITING APPROVAL','CANCELLED','CANCELED','AVBOKAD'
      ))
    OR NOT EXISTS (
      SELECT 1 FROM unnest(k) AS x
      WHERE x NOT IN (
        'assigned_project_id','assigned_project_name','assigned_to_project',
        'source_revision','version','needs_review','needs_review_reason','organization_id'
      )
    )
  FROM keys;
$function$;

UPDATE public.bookings b
SET needs_review = false, needs_review_reason = NULL
WHERE b.needs_review = true
  AND upper(coalesce(b.status,'')) = 'CONFIRMED'
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_changes bc
    WHERE bc.booking_id = b.id
      AND bc.changed_at > now() - interval '60 days'
      AND NOT public.is_noise_booking_change(bc.changed_fields, bc.previous_values, bc.new_values)
  );
