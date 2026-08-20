
CREATE OR REPLACE FUNCTION public.is_noise_booking_change(_changed_fields jsonb, _previous jsonb, _new jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT
    -- 1) Andringen skedde nar bokningen annu inte var bekraftad => Planning kande
    --    inte till bokningen da, ska aldrig granskas.
    (
      coalesce(_changed_fields, '{}'::jsonb) ? 'status'
      AND upper(coalesce(_previous ->> 'status', '')) IN (
        'OFFER','OFFERT','QUOTE','DRAFT','PENDING','TENTATIVE','RESERVED',
        'AWAITINGAPPROVAL','AWAITING_APPROVAL','AWAITING APPROVAL','CANCELLED','CANCELED','AVBOKAD'
      )
    )
    OR
    -- 2) Endast interna faltandringar (placering, versionsraknare)
    NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(coalesce(_changed_fields, '{}'::jsonb)) k
      WHERE k NOT IN (
        'assigned_project_id','assigned_project_name','assigned_to_project',
        'source_revision','version','needs_review','needs_review_reason','organization_id'
      )
    );
$function$;

GRANT EXECUTE ON FUNCTION public.is_noise_booking_change(jsonb, jsonb, jsonb) TO authenticated, service_role;

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
    FROM public.booking_changes bc, me
    WHERE bc.change_type IN ('update','status_change')
      AND bc.changed_by IN ('service_role','booking-import','booking-webhook')
      AND bc.organization_id = me.org_id
      AND NOT public.is_noise_booking_change(bc.changed_fields, bc.previous_values, bc.new_values)
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

-- Trigger: aktivering fran icke-bekraftat lage flaggar aldrig granskning
DO $$
DECLARE
  body text;
  old_block text := E'    IF NOT public.is_booking_activation_status_change(OLD.status, NEW.status) THEN\n        has_external_changes := true;\n      END IF;';
  marker text := E'IF has_external_changes AND OLD.assigned_to_project = true';
  new_marker text := E'IF OLD.status IS DISTINCT FROM NEW.status AND upper(coalesce(OLD.status, '''')) IN (''OFFER'',''OFFERT'',''QUOTE'',''DRAFT'',''PENDING'',''TENTATIVE'',''RESERVED'',''AWAITINGAPPROVAL'',''AWAITING_APPROVAL'',''AWAITING APPROVAL'',''CANCELLED'',''CANCELED'',''AVBOKAD'') THEN\n      has_external_changes := false;\n    END IF;\n\n    IF has_external_changes AND OLD.assigned_to_project = true';
BEGIN
  SELECT p.prosrc INTO body
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'track_booking_changes';

  IF position(marker in body) = 0 THEN
    RAISE EXCEPTION 'marker not found';
  END IF;

  body := replace(body, marker, new_marker);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.track_booking_changes() RETURNS trigger LANGUAGE plpgsql SET search_path TO ''public'' AS %L',
    body
  );
END $$;

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
