-- Engångskörning: konsolidera alla rig + rigDown calendar_events per projekt till ETT team.
-- Grupperingsnyckel: large_project_id om bookingen tillhör ett stort projekt, annars booking_number.
-- Målteam = det resource_id som redan har flest rig/rigDown-dagar i projektet (tie-break: lägsta resource_id).
-- Lager-team exkluderas helt. Eventdagar (event_type='event'/'activity') rörs ej.

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- 1) Uppdatera calendar_events
  WITH base AS (
    SELECT 
      ce.id,
      ce.booking_id,
      ce.booking_number,
      ce.resource_id,
      ce.start_time::date AS day,
      COALESCE(b.large_project_id::text, ce.booking_number, ce.booking_id) AS group_key
    FROM calendar_events ce
    LEFT JOIN bookings b ON b.booking_number = ce.booking_number
    WHERE ce.event_type IN ('rig','rigDown')
      AND ce.resource_id IS NOT NULL
      AND ce.resource_id NOT IN ('lager','warehouse','team-lager')
  ),
  tally AS (
    SELECT group_key, resource_id, COUNT(*) AS n
    FROM base
    GROUP BY group_key, resource_id
  ),
  ranked AS (
    SELECT group_key, resource_id,
           ROW_NUMBER() OVER (PARTITION BY group_key ORDER BY n DESC, resource_id ASC) AS rn
    FROM tally
  ),
  target AS (
    SELECT group_key, resource_id AS target_team FROM ranked WHERE rn = 1
  ),
  to_update AS (
    SELECT b.id, t.target_team, b.booking_id, b.day
    FROM base b
    JOIN target t USING (group_key)
    WHERE b.resource_id <> t.target_team
  )
  UPDATE calendar_events ce
  SET resource_id = u.target_team
  FROM to_update u
  WHERE ce.id = u.id;

  -- 2) Recompute staff_assignments för alla (booking_id, day) som potentiellt påverkats.
  --    Vi kör recompute för ALLA rig/rigDown-dagar i berörda projekt (säkrast).
  FOR rec IN
    WITH base AS (
      SELECT 
        ce.booking_id,
        ce.booking_number,
        ce.start_time::date AS day,
        COALESCE(b.large_project_id::text, ce.booking_number, ce.booking_id) AS group_key
      FROM calendar_events ce
      LEFT JOIN bookings b ON b.booking_number = ce.booking_number
      WHERE ce.event_type IN ('rig','rigDown')
        AND ce.resource_id IS NOT NULL
        AND ce.resource_id NOT IN ('lager','warehouse','team-lager')
    )
    SELECT DISTINCT booking_id, day FROM base
  LOOP
    BEGIN
      PERFORM public.recompute_booking_staff_for_day(rec.booking_id, rec.day);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'recompute failed for booking % day %: %', rec.booking_id, rec.day, SQLERRM;
    END;
  END LOOP;
END $$;