
-- get_unseen_booking_updates: filtrera på extern källa så att interna
-- Planning-ändringar inte hamnar i "Uppdaterade · kräver granskning".
CREATE OR REPLACE FUNCTION public.get_unseen_booking_updates()
RETURNS TABLE (
  booking_id text,
  assigned_project_id text,
  large_project_id uuid,
  last_change_at timestamptz,
  change_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT bc.booking_id::text AS booking_id,
           MAX(bc.changed_at) AS last_change_at,
           COUNT(*)::int AS change_count
    FROM public.booking_changes bc
    WHERE bc.change_type IN ('update','status_change')
      AND bc.changed_by IN ('service_role','booking-import','booking-webhook')
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
  JOIN latest l ON l.booking_id = b.id::text
  LEFT JOIN seen s ON s.booking_id = b.id::text
  LEFT JOIN public.large_project_bookings lpb ON lpb.booking_id::text = b.id::text
  WHERE (b.assigned_project_id IS NOT NULL OR lpb.large_project_id IS NOT NULL)
    AND (s.last_seen_at IS NULL OR s.last_seen_at < l.last_change_at);
$$;

GRANT EXECUTE ON FUNCTION public.get_unseen_booking_updates() TO authenticated;
