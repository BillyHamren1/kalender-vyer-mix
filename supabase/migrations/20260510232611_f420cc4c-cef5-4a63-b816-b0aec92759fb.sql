
UPDATE public.workdays w
SET ended_at = now(),
    ended_by = 'emergency_admin_stop',
    metadata = COALESCE(w.metadata, '{}'::jsonb) || jsonb_build_object(
      'emergencyStopped', true,
      'emergencyStoppedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'emergencyStopReason', 'Closed alongside emergency timer mass stop'
    ),
    updated_at = now()
WHERE w.ended_at IS NULL
  AND w.approved_at IS NULL
  AND w.staff_id IN (
    SELECT DISTINCT staff_id FROM public.active_time_registrations
    WHERE stop_source = 'emergency_admin_stop'
  );
