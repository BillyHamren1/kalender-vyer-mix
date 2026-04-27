CREATE OR REPLACE FUNCTION public.handle_booking_move(
  p_booking_id text,
  p_old_team_id text,
  p_new_team_id text,
  p_old_date date,
  p_new_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
DECLARE
  v_affected_staff TEXT[];
  v_conflicts JSONB := '[]'::JSONB;
  v_staff RECORD;
  v_can_move BOOLEAN;
  v_inserted INT := 0;
  v_call_id TEXT := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
BEGIN
  RAISE LOG '[handle_booking_move/%] START booking=% old_team=% new_team=% old_date=% new_date=%',
    v_call_id, p_booking_id, p_old_team_id, p_new_team_id, p_old_date, p_new_date;

  -- 1. Read affected staff first (NO destructive action yet)
  SELECT ARRAY_AGG(DISTINCT staff_id) INTO v_affected_staff
  FROM public.booking_staff_assignments
  WHERE booking_id = p_booking_id AND assignment_date = p_old_date;

  v_affected_staff := COALESCE(v_affected_staff, ARRAY[]::TEXT[]);
  RAISE LOG '[handle_booking_move/%] affected_staff_count=% staff=%',
    v_call_id, array_length(v_affected_staff, 1), v_affected_staff;

  -- 2. VALIDATION PASS — figure out conflicts BEFORE we mutate anything.
  --    A move is only valid if every affected staff member is on the
  --    target team on the target date (via staff_assignments).
  FOR v_staff IN SELECT UNNEST(v_affected_staff) AS staff_id
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.staff_assignments
      WHERE staff_id = v_staff.staff_id
        AND team_id = p_new_team_id
        AND assignment_date = p_new_date
    ) INTO v_can_move;

    IF NOT v_can_move THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'staff_id', v_staff.staff_id,
        'reason', 'not_assigned_to_team',
        'old_team', p_old_team_id,
        'new_team', p_new_team_id,
        'date', p_new_date
      );
      RAISE LOG '[handle_booking_move/%] CONFLICT staff=% not on team=% on %',
        v_call_id, v_staff.staff_id, p_new_team_id, p_new_date;
    END IF;
  END LOOP;

  -- 3. If ANY conflict, abort the move WITHOUT touching booking_staff_assignments.
  --    This prevents the destructive "lose everyone, fail silently" pattern that
  --    caused projects to revert after refresh.
  IF jsonb_array_length(v_conflicts) > 0 THEN
    RAISE LOG '[handle_booking_move/%] ABORT — % conflict(s), booking_staff_assignments left intact',
      v_call_id, jsonb_array_length(v_conflicts);
    RETURN jsonb_build_object(
      'success', false,
      'aborted', true,
      'reason', 'staff_conflicts',
      'affected_staff', v_affected_staff,
      'conflicts', v_conflicts,
      'call_id', v_call_id
    );
  END IF;

  -- 4. SAFE PATH — every affected staff member is valid on the target.
  --    Move them: delete old, insert new.
  DELETE FROM public.booking_staff_assignments
  WHERE booking_id = p_booking_id AND assignment_date = p_old_date;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE LOG '[handle_booking_move/%] deleted % old assignment row(s)', v_call_id, v_inserted;

  v_inserted := 0;
  FOR v_staff IN SELECT UNNEST(v_affected_staff) AS staff_id
  LOOP
    INSERT INTO public.booking_staff_assignments
      (booking_id, staff_id, team_id, assignment_date)
    VALUES
      (p_booking_id, v_staff.staff_id, p_new_team_id, p_new_date)
    ON CONFLICT (booking_id, staff_id, assignment_date) DO UPDATE
      SET team_id = EXCLUDED.team_id;
    v_inserted := v_inserted + 1;
  END LOOP;

  RAISE LOG '[handle_booking_move/%] DONE — % staff moved to team=% on %',
    v_call_id, v_inserted, p_new_team_id, p_new_date;

  RETURN jsonb_build_object(
    'success', true,
    'aborted', false,
    'affected_staff', v_affected_staff,
    'moved_count', v_inserted,
    'conflicts', v_conflicts,
    'call_id', v_call_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[handle_booking_move/%] EXCEPTION sqlstate=% message=%',
    v_call_id, SQLSTATE, SQLERRM;
  RAISE;
END;
$function$;