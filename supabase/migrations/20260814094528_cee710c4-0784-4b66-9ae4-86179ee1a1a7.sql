CREATE OR REPLACE FUNCTION public.recompute_booking_staff_for_day_v2(
  p_organization_id uuid,
  p_booking_id text,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_team    text;
  v_added   int := 0;
  v_removed int := 0;
  v_exists  boolean;
BEGIN
  IF p_organization_id IS NULL OR p_booking_id IS NULL OR p_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_arguments', 'added', 0, 'removed', 0);
  END IF;

  -- Fail-closed: bokningen måste finnas inom organisationen
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = p_booking_id AND b.organization_id = p_organization_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'booking_not_in_organization',
      'booking_id', p_booking_id,
      'organization_id', p_organization_id,
      'added', 0,
      'removed', 0
    );
  END IF;

  SELECT resource_id INTO v_team
  FROM public.calendar_events
  WHERE organization_id = p_organization_id
    AND booking_id      = p_booking_id
    AND source_date     = p_date
    AND event_type IN ('rig','rigDown')
  ORDER BY event_type DESC
  LIMIT 1;

  WITH removed AS (
    DELETE FROM public.booking_staff_assignments bsa
    WHERE bsa.organization_id = p_organization_id
      AND bsa.booking_id      = p_booking_id
      AND bsa.assignment_date = p_date
      AND bsa.team_id NOT IN ('activity','project','location')
      AND (
            v_team IS NULL
         OR bsa.team_id <> v_team
         OR bsa.staff_id NOT IN (
              SELECT sa.staff_id
              FROM public.staff_assignments sa
              WHERE sa.organization_id = p_organization_id
                AND sa.team_id         = v_team
                AND sa.assignment_date = p_date
            )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM removed;

  IF v_team IS NOT NULL THEN
    WITH added AS (
      INSERT INTO public.booking_staff_assignments
        (booking_id, staff_id, team_id, assignment_date, organization_id)
      SELECT p_booking_id, sa.staff_id, v_team, p_date, p_organization_id
      FROM public.staff_assignments sa
      WHERE sa.organization_id = p_organization_id
        AND sa.team_id         = v_team
        AND sa.assignment_date = p_date
      ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_added FROM added;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'organization_id', p_organization_id,
    'date', p_date,
    'team', v_team,
    'added', v_added,
    'removed', v_removed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) TO service_role;

COMMENT ON FUNCTION public.recompute_booking_staff_for_day_v2(uuid, text, date) IS
  'Tenant-säker BSA-omräkning. Alla reads/deletes/inserts scopas på organization_id. Fail-closed om bokningen inte tillhör organisationen.';

COMMENT ON FUNCTION public.recompute_booking_staff_for_day(text, date) IS
  'DEPRECATED/LEGACY: saknar organization_id och kan korsa tenants. Använd recompute_booking_staff_for_day_v2(p_organization_id, p_booking_id, p_date). Behålls endast för äldre UI-callers.';