
-- 1) Allow text staff_id in suppressions (existing rows: none)
ALTER TABLE public.time_auto_start_suppressions
  ALTER COLUMN staff_id TYPE text USING staff_id::text;

-- 2) Emergency stop all active timers
UPDATE public.active_time_registrations
SET stopped_at = now(),
    status = 'stopped',
    stop_source = 'emergency_admin_stop',
    stopped_by = 'lovable_admin_action',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'emergencyStopped', true,
      'emergencyStoppedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'emergencyStopReason', 'Mass stop requested because active timers could not be stopped from app',
      'emergencyStopSource', 'lovable_admin_action'
    ),
    updated_at = now()
WHERE status = 'active' OR stopped_at IS NULL;

-- 3) Block auto-start for the rest of the Swedish day for affected staff
INSERT INTO public.time_auto_start_suppressions
  (organization_id, staff_id, date, suppressed_until, reason, source, metadata)
SELECT DISTINCT
  atr.organization_id,
  atr.staff_id,
  ((now() AT TIME ZONE 'Europe/Stockholm')::date) AS date,
  ((((now() AT TIME ZONE 'Europe/Stockholm')::date + INTERVAL '1 day') - INTERVAL '1 second')
     AT TIME ZONE 'Europe/Stockholm') AS suppressed_until,
  'emergency_admin_stop',
  'admin',
  jsonb_build_object(
    'emergencyStopBatch', true,
    'stoppedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'reason', 'Prevent GPS/geofence from restarting timer after emergency stop'
  )
FROM public.active_time_registrations atr
WHERE atr.stop_source = 'emergency_admin_stop'
  AND (atr.metadata->>'emergencyStoppedAt') IS NOT NULL
  AND atr.updated_at > now() - INTERVAL '1 minute';
