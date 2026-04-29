CREATE OR REPLACE FUNCTION public.recompute_booking_staff_for_day(
  p_booking_id text,
  p_date       date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team    text;
  v_org     uuid;
  v_added   int := 0;
  v_removed int := 0;
BEGIN
  -- Hitta vilket team som äger bokningen den dagen.
  -- Endast rig/rigDown räknas (event-fasen sparas inte i calendar_events).
  -- Om båda finns vinner rigDown (alfabetiskt sist via DESC).
  SELECT resource_id, organization_id
    INTO v_team, v_org
  FROM public.calendar_events
  WHERE booking_id  = p_booking_id
    AND source_date = p_date
    AND event_type IN ('rig','rigDown')
  ORDER BY event_type DESC
  LIMIT 1;

  -- Om vi inte hittade org via calendar_events, försök hämta från befintlig BSA
  IF v_org IS NULL THEN
    SELECT organization_id
      INTO v_org
    FROM public.booking_staff_assignments
    WHERE booking_id = p_booking_id
      AND assignment_date = p_date
    LIMIT 1;
  END IF;

  -- Steg A: ta bort BSA-rader som inte längre matchar
  -- Skydda härledda kategorier (activity = task-system, project = large_project_staff, location = show-as-project)
  WITH removed AS (
    DELETE FROM public.booking_staff_assignments
    WHERE booking_id      = p_booking_id
      AND assignment_date = p_date
      AND team_id NOT IN ('activity','project','location')
      AND (
            v_team IS NULL
         OR team_id <> v_team
         OR staff_id NOT IN (
              SELECT sa.staff_id
              FROM public.staff_assignments sa
              WHERE sa.team_id         = v_team
                AND sa.assignment_date = p_date
            )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM removed;

  -- Steg B: lägg till BSA-rader för all personal som tillhör teamet den dagen
  IF v_team IS NOT NULL AND v_org IS NOT NULL THEN
    WITH added AS (
      INSERT INTO public.booking_staff_assignments
        (booking_id, staff_id, team_id, assignment_date, organization_id)
      SELECT p_booking_id, sa.staff_id, v_team, p_date, v_org
      FROM public.staff_assignments sa
      WHERE sa.team_id         = v_team
        AND sa.assignment_date = p_date
      ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_added FROM added;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'date',       p_date,
    'team',       v_team,
    'added',      v_added,
    'removed',    v_removed
  );
END;
$$;