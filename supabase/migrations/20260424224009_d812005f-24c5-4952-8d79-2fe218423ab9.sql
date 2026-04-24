
DO $$
DECLARE
  r RECORD;
  v_close timestamptz;
BEGIN
  FOR r IN
    WITH staff_open AS (
      SELECT DISTINCT w.staff_id, w.organization_id
      FROM workdays w
      WHERE w.ended_at IS NULL AND w.started_at::date = CURRENT_DATE
    )
    SELECT
      s.staff_id,
      s.organization_id,
      GREATEST(
        COALESCE(sl.updated_at, '1970-01-01'::timestamptz),
        COALESCE(sl.last_address_at, '1970-01-01'::timestamptz),
        COALESCE((SELECT MAX(exited_at) FROM location_time_entries lte
                  WHERE lte.staff_id = s.staff_id
                    AND lte.entered_at::date = CURRENT_DATE), '1970-01-01'::timestamptz)
      ) AS effective_close_at
    FROM staff_open s
    LEFT JOIN staff_locations sl ON sl.staff_id = s.staff_id
  LOOP
    v_close := r.effective_close_at;
    IF v_close <= '1970-01-02'::timestamptz OR v_close IS NULL THEN
      v_close := now();
    END IF;

    UPDATE location_time_entries
       SET exited_at = CASE
                         WHEN v_close > entered_at THEN v_close
                         ELSE entered_at + INTERVAL '1 second'
                       END
     WHERE staff_id = r.staff_id
       AND exited_at IS NULL
       AND entered_at::date = CURRENT_DATE;

    UPDATE workdays
       SET ended_at = CASE
                        WHEN v_close > started_at THEN v_close
                        ELSE started_at + INTERVAL '1 second'
                      END,
           review_status = 'needs_review',
           review_reasons = COALESCE(review_reasons, ARRAY[]::text[]) || ARRAY['phase3_one_off_cleanup']::text[],
           review_computed_at = now(),
           updated_at = now(),
           ended_by = COALESCE(ended_by, 'system:phase3_cleanup')
     WHERE staff_id = r.staff_id
       AND ended_at IS NULL
       AND started_at::date = CURRENT_DATE;

    INSERT INTO workday_flags (
      organization_id, staff_id, flag_type, severity, flag_date,
      title, description, needs_user_input, context
    ) VALUES (
      r.organization_id,
      r.staff_id,
      'unclear_day_end',
      'warning',
      CURRENT_DATE,
      'Dagen stängdes automatiskt',
      'Arbetsdagen och eventuella öppna lager-/platsbesök stängdes via engångsstädning baserat på senaste kända aktivitet. Granska och justera vid behov.',
      true,
      jsonb_build_object(
        'closed_at', v_close,
        'reason', 'phase3_one_off_cleanup',
        'cleanup_run_at', now()
      )
    );
  END LOOP;
END $$;
