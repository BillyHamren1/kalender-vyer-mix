
CREATE TABLE IF NOT EXISTS public.booking_change_views (
  user_id uuid NOT NULL,
  booking_id text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, booking_id)
);

ALTER TABLE public.booking_change_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own change views"
  ON public.booking_change_views
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_booking_change_views_user ON public.booking_change_views(user_id);

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
           COUNT(*) FILTER (WHERE bc.change_type IN ('update','status_change'))::int AS change_count
    FROM public.booking_changes bc
    WHERE bc.change_type IN ('update','status_change')
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

CREATE OR REPLACE FUNCTION public.mark_booking_changes_seen(p_booking_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.booking_change_views (user_id, booking_id, last_seen_at)
  VALUES (auth.uid(), p_booking_id, now())
  ON CONFLICT (user_id, booking_id)
  DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;
$$;

GRANT EXECUTE ON FUNCTION public.mark_booking_changes_seen(text) TO authenticated;
