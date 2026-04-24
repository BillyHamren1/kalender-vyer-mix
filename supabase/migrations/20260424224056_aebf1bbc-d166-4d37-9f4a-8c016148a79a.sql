
DO $$
DECLARE
  v_staff text := 'staff_1775737078555_pfuoiie6g';
  v_org uuid;
  v_close timestamptz;
BEGIN
  SELECT GREATEST(COALESCE(updated_at, '1970-01-01'::timestamptz),
                  COALESCE(last_address_at, '1970-01-01'::timestamptz))
    INTO v_close
    FROM staff_locations WHERE staff_id = v_staff;
  IF v_close IS NULL OR v_close <= '1970-01-02'::timestamptz THEN
    v_close := now();
  END IF;

  SELECT organization_id INTO v_org
    FROM location_time_entries
   WHERE staff_id = v_staff AND exited_at IS NULL AND entered_at::date = CURRENT_DATE
   LIMIT 1;

  UPDATE location_time_entries
     SET exited_at = CASE WHEN v_close > entered_at THEN v_close ELSE entered_at + INTERVAL '1 second' END
   WHERE staff_id = v_staff AND exited_at IS NULL AND entered_at::date = CURRENT_DATE;

  INSERT INTO workday_flags (
    organization_id, staff_id, flag_type, severity, flag_date,
    title, description, needs_user_input, context
  ) VALUES (
    v_org, v_staff, 'unclear_day_end', 'warning', CURRENT_DATE,
    'Platsbesök stängdes automatiskt',
    'Ett öppet lager-/platsbesök stängdes via engångsstädning. Personalen hade ingen registrerad arbetsdag idag — granska och justera vid behov.',
    true,
    jsonb_build_object('closed_at', v_close, 'reason', 'phase3_one_off_cleanup_orphan_lte', 'cleanup_run_at', now())
  );
END $$;
