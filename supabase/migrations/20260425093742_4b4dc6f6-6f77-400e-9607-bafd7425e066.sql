-- One-off cleanup of two known stale workdays from 2026-04-23.
-- Future stale workdays are handled by the upgraded
-- close-stale-workday-entries edge function (step D).

-- 1) Close Eduards Gribs's workday at the end of his last time_report (12:42).
UPDATE public.workdays
SET ended_at = TIMESTAMPTZ '2026-04-23 12:42:00+00',
    ended_by = 'system_watchdog',
    review_status = 'needs_review',
    notes = COALESCE(notes || ' ', '') || '[auto-closed: stale >18h]'
WHERE id = '0d48b3d3-cb60-4b86-a637-2fac74825b98'
  AND ended_at IS NULL;

-- 2) Close Matīss Ulmis's workday at the last location_time_entries.exited_at.
UPDATE public.workdays
SET ended_at = TIMESTAMPTZ '2026-04-23 14:02:37+00',
    ended_by = 'system_watchdog',
    review_status = 'needs_review',
    notes = COALESCE(notes || ' ', '') || '[auto-closed: stale >18h]'
WHERE id = '10859dbe-c232-414b-893f-082211c3f582'
  AND ended_at IS NULL;

-- 3) Insert workday_flags so users see the auto-close in the app.
INSERT INTO public.workday_flags
  (organization_id, staff_id, flag_type, severity, flag_date, title,
   description, needs_user_input, context)
SELECT
  w.organization_id, w.staff_id, 'auto_closed_overnight', 'warning',
  w.started_at::date,
  'Din arbetsdag stängdes automatiskt',
  'Din arbetsdag låg öppen i mer än 18 timmar och stängdes automatiskt. Bekräfta din riktiga sluttid.',
  true,
  jsonb_build_object(
    'provisional_end_iso', w.ended_at,
    'reason', 'workday_stale_18h_oneoff',
    'affected_entries', jsonb_build_array(jsonb_build_object('table','workdays','id', w.id))
  )
FROM public.workdays w
WHERE w.id IN (
  '0d48b3d3-cb60-4b86-a637-2fac74825b98',
  '10859dbe-c232-414b-893f-082211c3f582'
)
AND NOT EXISTS (
  SELECT 1 FROM public.workday_flags f
  WHERE f.staff_id = w.staff_id
    AND f.flag_date = w.started_at::date
    AND f.flag_type = 'auto_closed_overnight'
);