
CREATE OR REPLACE FUNCTION public.is_status_only_booking_change(_changed_fields jsonb)
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
  SELECT 'status' = ANY(k)
     AND NOT EXISTS (
       SELECT 1 FROM unnest(k) AS x
       WHERE x NOT IN (
         'status','assigned_project_id','assigned_project_name','assigned_to_project',
         'source_revision','version','needs_review','needs_review_reason','organization_id'
       )
     )
  FROM keys;
$function$;

GRANT EXECUTE ON FUNCTION public.is_status_only_booking_change(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_unseen_booking_updates()
 RETURNS TABLE(booking_id text, assigned_project_id text, large_project_id uuid, last_change_at timestamp with time zone, change_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT public.get_user_organization_id(auth.uid()) AS org_id
  ),
  latest AS (
    SELECT bc.booking_id::text AS booking_id,
           MAX(bc.changed_at) AS last_change_at,
           COUNT(*)::int AS change_count
    FROM public.booking_changes bc
    CROSS JOIN me
    JOIN public.bookings bb ON bb.id = bc.booking_id
    WHERE bc.change_type IN ('update','status_change')
      AND bc.changed_by IN ('service_role','booking-import','booking-webhook')
      AND bc.organization_id = me.org_id
      AND NOT public.is_noise_booking_change(bc.changed_fields, bc.previous_values, bc.new_values)
      AND NOT (
        upper(coalesce(bb.status,'')) = 'CONFIRMED'
        AND public.is_status_only_booking_change(bc.changed_fields)
      )
    GROUP BY bc.booking_id
  ),
  seen AS (
    SELECT booking_id, last_seen_at
    FROM public.booking_change_views
    WHERE user_id = auth.uid()
  )
  SELECT b.id::text,
         b.assigned_project_id::text,
         lpb.large_project_id,
         l.last_change_at,
         l.change_count
  FROM public.bookings b
  CROSS JOIN me
  JOIN latest l ON l.booking_id = b.id::text
  LEFT JOIN seen s ON s.booking_id = b.id::text
  LEFT JOIN public.large_project_bookings lpb
         ON lpb.booking_id::text = b.id::text
        AND lpb.organization_id = me.org_id
  WHERE me.org_id IS NOT NULL
    AND b.organization_id = me.org_id
    AND (b.assigned_project_id IS NOT NULL OR lpb.large_project_id IS NOT NULL)
    AND (s.last_seen_at IS NULL OR s.last_seen_at < l.last_change_at);
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
      AND NOT public.is_status_only_booking_change(bc.changed_fields)
  );
