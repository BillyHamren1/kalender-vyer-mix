-- STEG 6: Engångs-normalisering av BSA för alla framtida kalenderhändelser
DO $$
DECLARE
  r RECORD;
  cnt INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ce.booking_id, ce.start_time::date AS d
    FROM calendar_events ce
    WHERE ce.booking_id IS NOT NULL
      AND ce.start_time::date >= CURRENT_DATE
      AND ce.resource_id IS NOT NULL
      AND ce.resource_id NOT IN ('activity','project','location')
  LOOP
    BEGIN
      PERFORM public.recompute_booking_staff_for_day(r.booking_id, r.d);
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'recompute failed for booking=% date=%: %', r.booking_id, r.d, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Recomputed BSA for % (booking,date) tuples', cnt;
END $$;

-- STEG 7: Deprecera handle_booking_move (no-op)
DROP FUNCTION IF EXISTS public.handle_booking_move(text, text, text, date, date);

CREATE OR REPLACE FUNCTION public.handle_booking_move(
  p_booking_id text,
  p_old_team_id text,
  p_new_team_id text,
  p_old_date date,
  p_new_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE NOTICE 'handle_booking_move is deprecated. Use recompute_booking_staff_for_day(booking_id, date) instead.';
  RETURN jsonb_build_object(
    'deprecated', true,
    'message', 'Use recompute_booking_staff_for_day(booking_id, date) instead',
    'booking_id', p_booking_id,
    'old_team_id', p_old_team_id,
    'new_team_id', p_new_team_id,
    'old_date', p_old_date,
    'new_date', p_new_date
  );
END;
$$;