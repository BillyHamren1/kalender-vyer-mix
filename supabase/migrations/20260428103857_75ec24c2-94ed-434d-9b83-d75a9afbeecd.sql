
CREATE OR REPLACE FUNCTION public.sync_all_phase_times()
RETURNS TABLE(
  bookings_updated integer,
  events_updated integer,
  large_project_groups integer,
  siblings_synced integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookings_updated integer := 0;
  v_events_updated integer := 0;
  v_large_groups integer := 0;
  v_siblings integer := 0;
  r record;
  winner_start timestamptz;
  winner_end timestamptz;
  phase text;
  date_col text;
  start_col text;
  end_col text;
BEGIN
  -- ============================================================
  -- STEP 1: Calendar wins. For every (booking, phase) where a
  -- calendar_event exists, force bookings.<phase>_*_time to match
  -- calendar_events.start_time / end_time.
  -- ============================================================
  FOR r IN
    SELECT ce.booking_id, ce.event_type, ce.source_date,
           ce.start_time, ce.end_time
    FROM calendar_events ce
    WHERE ce.booking_id IS NOT NULL
      AND ce.event_type IN ('rig','event','rigDown')
      AND ce.source_date IS NOT NULL
  LOOP
    IF r.event_type = 'rig' THEN
      UPDATE bookings
      SET rig_start_time = r.start_time,
          rig_end_time   = r.end_time
      WHERE id = r.booking_id
        AND rigdaydate = r.source_date
        AND (rig_start_time IS DISTINCT FROM r.start_time
          OR rig_end_time   IS DISTINCT FROM r.end_time);
    ELSIF r.event_type = 'event' THEN
      UPDATE bookings
      SET event_start_time = r.start_time,
          event_end_time   = r.end_time
      WHERE id = r.booking_id
        AND eventdate = r.source_date
        AND (event_start_time IS DISTINCT FROM r.start_time
          OR event_end_time   IS DISTINCT FROM r.end_time);
    ELSIF r.event_type = 'rigDown' THEN
      UPDATE bookings
      SET rigdown_start_time = r.start_time,
          rigdown_end_time   = r.end_time
      WHERE id = r.booking_id
        AND rigdowndate = r.source_date
        AND (rigdown_start_time IS DISTINCT FROM r.start_time
          OR rigdown_end_time   IS DISTINCT FROM r.end_time);
    END IF;
    IF FOUND THEN v_bookings_updated := v_bookings_updated + 1; END IF;
  END LOOP;

  -- ============================================================
  -- STEP 2: Large project propagation. For every
  -- (large_project_id, phase, date), pick a winner time and force
  -- it onto ALL siblings (bookings + their calendar_events).
  -- Winner priority:
  --   1) any calendar_event for that group
  --   2) earliest booking with a non-null start time
  -- ============================================================
  FOR phase, date_col, start_col, end_col IN
    SELECT * FROM (VALUES
      ('rig',     'rigdaydate',   'rig_start_time',     'rig_end_time'),
      ('event',   'eventdate',    'event_start_time',   'event_end_time'),
      ('rigDown', 'rigdowndate',  'rigdown_start_time', 'rigdown_end_time')
    ) AS t(p, dc, sc, ec)
  LOOP
    FOR r IN EXECUTE format($f$
      SELECT b.large_project_id AS lpid, b.%I AS phase_date
      FROM bookings b
      WHERE b.large_project_id IS NOT NULL
        AND b.%I IS NOT NULL
      GROUP BY b.large_project_id, b.%I
      HAVING COUNT(*) > 1
    $f$, date_col, date_col, date_col)
    LOOP
      v_large_groups := v_large_groups + 1;

      -- Find winner: prefer a calendar_event for this group
      EXECUTE format($f$
        SELECT ce.start_time, ce.end_time
        FROM calendar_events ce
        JOIN bookings b ON b.id = ce.booking_id
        WHERE b.large_project_id = $1
          AND b.%I = $2
          AND ce.event_type = $3
          AND ce.source_date = $2
          AND ce.start_time IS NOT NULL
        ORDER BY ce.created_at ASC
        LIMIT 1
      $f$, date_col)
      INTO winner_start, winner_end
      USING r.lpid, r.phase_date, phase;

      -- Fallback to earliest booking with a time
      IF winner_start IS NULL THEN
        EXECUTE format($f$
          SELECT %I, %I FROM bookings
          WHERE large_project_id = $1 AND %I = $2 AND %I IS NOT NULL
          ORDER BY updated_at ASC NULLS LAST
          LIMIT 1
        $f$, start_col, end_col, date_col, start_col)
        INTO winner_start, winner_end
        USING r.lpid, r.phase_date;
      END IF;

      IF winner_start IS NULL THEN CONTINUE; END IF;

      -- Propagate to all sibling bookings in the group
      EXECUTE format($f$
        WITH upd AS (
          UPDATE bookings
          SET %I = $1, %I = $2
          WHERE large_project_id = $3
            AND %I = $4
            AND (%I IS DISTINCT FROM $1 OR %I IS DISTINCT FROM $2)
          RETURNING id
        )
        SELECT COUNT(*) FROM upd
      $f$, start_col, end_col, date_col, start_col, end_col)
      INTO v_siblings
      USING winner_start, winner_end, r.lpid, r.phase_date;

      v_bookings_updated := v_bookings_updated + COALESCE(v_siblings, 0);

      -- Mirror into all matching calendar_events for the group
      UPDATE calendar_events ce
      SET start_time = winner_start,
          end_time   = winner_end
      FROM bookings b
      WHERE b.id = ce.booking_id
        AND b.large_project_id = r.lpid
        AND ce.event_type = phase
        AND ce.source_date = r.phase_date
        AND (ce.start_time IS DISTINCT FROM winner_start
          OR ce.end_time   IS DISTINCT FROM winner_end);

      GET DIAGNOSTICS v_siblings = ROW_COUNT;
      v_events_updated := v_events_updated + COALESCE(v_siblings, 0);
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_bookings_updated, v_events_updated, v_large_groups, 0;
END;
$$;

-- Run it now to backfill all projects in one shot
SELECT * FROM public.sync_all_phase_times();
