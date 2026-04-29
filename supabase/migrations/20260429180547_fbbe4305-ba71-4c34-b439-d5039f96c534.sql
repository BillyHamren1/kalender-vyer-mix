
-- 1) Unique index så vi aldrig kan duplicera (booking, phase, date)
--    Vi normaliserar 'rigdown' → 'rigDown' separat i koden; här accepterar vi
--    bägge stavningarna men förhindrar duplicering på exakt samma form.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_booking_phase_date_uniq
  ON public.calendar_events (booking_id, event_type, source_date)
  WHERE booking_id IS NOT NULL AND source_date IS NOT NULL;

-- 2) Backfill: för varje (booking, phase) som har personal i
--    booking_staff_assignments men ingen calendar_events-rad för det datumet,
--    skapa en rad. Tider hämtas från bookings.<phase>_*_time fallback 08:00–12:00.
--    Team väljs från BSA (mest frekvent på datumet), fallback 'team-1'.
DO $$
DECLARE
  r RECORD;
  v_phase TEXT;
  v_start TIMESTAMPTZ;
  v_end   TIMESTAMPTZ;
  v_team  TEXT;
  v_title TEXT;
  v_addr  TEXT;
  v_bnum  TEXT;
  v_org   UUID;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT bsa.booking_id, bsa.assignment_date
    FROM public.booking_staff_assignments bsa
    JOIN public.bookings b ON b.id = bsa.booking_id
    WHERE bsa.assignment_date >= CURRENT_DATE - INTERVAL '60 days'
  LOOP
    -- Vilken fas matchar detta datum?
    SELECT CASE
      WHEN b.rigdaydate   = r.assignment_date THEN 'rig'
      WHEN b.eventdate    = r.assignment_date THEN 'event'
      WHEN b.rigdowndate  = r.assignment_date THEN 'rigDown'
      ELSE NULL
    END,
    b.client, b.deliveryaddress, b.booking_number, b.organization_id,
    b.rig_start_time, b.rig_end_time,
    b.event_start_time, b.event_end_time,
    b.rigdown_start_time, b.rigdown_end_time,
    b.rigdaydate, b.rigdowndate, b.eventdate
    INTO v_phase, v_title, v_addr, v_bnum, v_org,
         v_start, v_end,
         v_start, v_end,
         v_start, v_end,
         v_start, v_end, v_start
    FROM public.bookings b WHERE b.id = r.booking_id;

    -- Om datumet inte matchar någon av bokningens phasedates, härled fasen
    -- utifrån vilket datum som ligger närmast (rig-intervall ≤ rigdaydate,
    -- rigDown-intervall ≥ rigdowndate). Annars hoppa över.
    IF v_phase IS NULL THEN
      SELECT CASE
        WHEN b.rigdaydate IS NOT NULL AND r.assignment_date <= b.eventdate THEN 'rig'
        WHEN b.rigdowndate IS NOT NULL AND r.assignment_date >= b.eventdate THEN 'rigDown'
        ELSE NULL
      END INTO v_phase
      FROM public.bookings b WHERE b.id = r.booking_id;
    END IF;

    IF v_phase IS NULL THEN CONTINUE; END IF;

    -- Hämta tider för fasen
    SELECT
      COALESCE(
        CASE v_phase
          WHEN 'rig'    THEN b.rig_start_time
          WHEN 'event'  THEN b.event_start_time
          WHEN 'rigDown' THEN b.rigdown_start_time
        END,
        (r.assignment_date::timestamp + TIME '08:00')::timestamptz
      ),
      COALESCE(
        CASE v_phase
          WHEN 'rig'    THEN b.rig_end_time
          WHEN 'event'  THEN b.event_end_time
          WHEN 'rigDown' THEN b.rigdown_end_time
        END,
        (r.assignment_date::timestamp + CASE WHEN v_phase = 'event' THEN TIME '17:00' ELSE TIME '12:00' END)::timestamptz
      ),
      COALESCE(b.client, 'Bokning'),
      b.deliveryaddress, b.booking_number, b.organization_id
    INTO v_start, v_end, v_title, v_addr, v_bnum, v_org
    FROM public.bookings b WHERE b.id = r.booking_id;

    -- Justera datum-delen så start/end ligger på r.assignment_date (om source skilde sig)
    v_start := (r.assignment_date::timestamp + (v_start::time))::timestamptz;
    v_end   := (r.assignment_date::timestamp + (v_end::time))::timestamptz;

    -- Välj team: det vanligaste team_id på (booking, datum) i BSA
    SELECT team_id INTO v_team
    FROM public.booking_staff_assignments
    WHERE booking_id = r.booking_id AND assignment_date = r.assignment_date
    GROUP BY team_id
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    v_team := COALESCE(v_team, 'team-1');

    -- Insert om saknas (idempotent via unique index)
    INSERT INTO public.calendar_events
      (booking_id, booking_number, title, start_time, end_time, event_type,
       delivery_address, resource_id, organization_id, source_date)
    VALUES
      (r.booking_id, v_bnum, v_title, v_start, v_end, v_phase,
       v_addr, v_team, v_org, r.assignment_date)
    ON CONFLICT (booking_id, event_type, source_date) WHERE booking_id IS NOT NULL AND source_date IS NOT NULL
    DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END LOOP;

  RAISE LOG 'Backfill calendar_events done';
END $$;

-- 3) Quick-fix Skolfest Sverige AB #2604-64 → rigDown 2026-04-27 ska ligga på team-2
INSERT INTO public.calendar_events
  (booking_id, booking_number, title, start_time, end_time, event_type,
   delivery_address, resource_id, organization_id, source_date)
SELECT
  b.id, b.booking_number, COALESCE(b.client, 'Skolfest Sverige AB'),
  '2026-04-27 08:00:00+00'::timestamptz,
  '2026-04-27 12:00:00+00'::timestamptz,
  'rigDown', b.deliveryaddress, 'team-2', b.organization_id, '2026-04-27'::date
FROM public.bookings b
WHERE b.id = 'a4a4900d-ad41-4321-846d-1fdae7dceb07'
ON CONFLICT (booking_id, event_type, source_date) WHERE booking_id IS NOT NULL AND source_date IS NOT NULL
DO UPDATE SET resource_id = 'team-2';
