-- Kör recompute för ALLA BSA-rader, även för datum som inte längre har calendar_events
DO $$
DECLARE
  r RECORD;
  cnt INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT bsa.booking_id, bsa.assignment_date AS d
    FROM booking_staff_assignments bsa
    WHERE bsa.assignment_date >= CURRENT_DATE
      AND bsa.team_id NOT IN ('activity','project','location')
      AND bsa.booking_id NOT LIKE 'project-%'
  LOOP
    BEGIN
      PERFORM public.recompute_booking_staff_for_day(r.booking_id, r.d);
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'recompute failed: %', SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Final cleanup: recomputed % tuples', cnt;
END $$;