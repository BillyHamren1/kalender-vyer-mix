
CREATE OR REPLACE FUNCTION public.is_booking_activation_status_change(_old text, _new text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT upper(coalesce(_new, '')) IN ('CONFIRMED', 'BEKRAFTAD')
     AND upper(coalesce(_old, '')) IN (
       '', 'OFFER', 'OFFERT', 'QUOTE', 'DRAFT', 'PENDING', 'TENTATIVE', 'RESERVED',
       'AWAITINGAPPROVAL', 'AWAITING_APPROVAL', 'AWAITING APPROVAL', 'CANCELLED', 'CANCELED', 'AVBOKAD'
     );
$function$;

GRANT EXECUTE ON FUNCTION public.is_booking_activation_status_change(text, text) TO authenticated, service_role;

-- Patcha track_booking_changes: status-only aktivering ska inte flagga granskning
DO $$
DECLARE
  body text;
  old_block text := E'    IF OLD.status IS DISTINCT FROM NEW.status THEN\n      changed_fields_json := changed_fields_json || ''{"status": true}'';\n      previous_values_json := previous_values_json || jsonb_build_object(''status'', OLD.status);\n      new_values_json := new_values_json || jsonb_build_object(''status'', NEW.status);\n      has_external_changes := true;\n    END IF;';
  new_block text := E'    IF OLD.status IS DISTINCT FROM NEW.status THEN\n      changed_fields_json := changed_fields_json || ''{"status": true}'';\n      previous_values_json := previous_values_json || jsonb_build_object(''status'', OLD.status);\n      new_values_json := new_values_json || jsonb_build_object(''status'', NEW.status);\n      IF NOT public.is_booking_activation_status_change(OLD.status, NEW.status) THEN\n        has_external_changes := true;\n      END IF;\n    END IF;';
BEGIN
  SELECT p.prosrc INTO body
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'track_booking_changes';

  IF body IS NULL THEN
    RAISE EXCEPTION 'track_booking_changes not found';
  END IF;
  IF position(old_block in body) = 0 THEN
    RAISE EXCEPTION 'status block not found in track_booking_changes';
  END IF;

  body := replace(body, old_block, new_block);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.track_booking_changes() RETURNS trigger LANGUAGE plpgsql SET search_path TO ''public'' AS %L',
    body
  );
END $$;

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
      AND NOT (
        coalesce(bc.changed_fields, '{}'::jsonb) ? 'status'
        AND (SELECT count(*) FROM jsonb_object_keys(coalesce(bc.changed_fields,'{}'::jsonb))) = 1
        AND public.is_booking_activation_status_change(
              bc.previous_values ->> 'status',
              bc.new_values ->> 'status')
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
      AND bc.changed_at > now() - interval '30 days'
      AND NOT (
        coalesce(bc.changed_fields, '{}'::jsonb) ? 'status'
        AND (SELECT count(*) FROM jsonb_object_keys(coalesce(bc.changed_fields,'{}'::jsonb))) = 1
      )
  );
