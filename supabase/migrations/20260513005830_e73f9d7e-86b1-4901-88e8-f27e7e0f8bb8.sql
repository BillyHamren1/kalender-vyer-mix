-- ─────────────────────────────────────────────────────────────────────
-- Emergency cleanup: close abandoned open workdays and active timer
-- registrations that have been running for unreasonable amounts of time.
-- Marks each row clearly so admins can audit.
-- ─────────────────────────────────────────────────────────────────────

-- 1) Close workdays open > 36h. Cap ended_at = started_at + 10h.
UPDATE public.workdays w
SET
  ended_at = LEAST(now(), w.started_at + INTERVAL '10 hours'),
  ended_by = 'system_stale_cleanup_2026_05_13',
  review_status = COALESCE(w.review_status, 'needs_review'),
  notes = COALESCE(w.notes, '') ||
    CASE WHEN COALESCE(w.notes, '') = '' THEN '' ELSE ' | ' END ||
    '[auto-closed by stale cleanup 2026-05-13: open > 36h]',
  metadata = COALESCE(w.metadata, '{}'::jsonb) || jsonb_build_object(
    'autoClosedByStaleCleanup', true,
    'autoClosedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'autoClosedReason', 'workday_open_more_than_36h',
    'autoClosedSource', 'stale_cleanup_migration_2026_05_13',
    'originalStartedAt', to_char(w.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
WHERE w.ended_at IS NULL
  AND w.started_at < now() - INTERVAL '36 hours';

-- 2) Stop active_time_registrations open > 24h.
UPDATE public.active_time_registrations a
SET
  stopped_at = now(),
  status = 'stopped',
  stop_source = 'system_stale_cleanup_2026_05_13',
  stopped_by = 'system_stale_cleanup_2026_05_13',
  metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object(
    'autoStoppedByStaleCleanup', true,
    'autoStoppedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'autoStoppedReason', 'active_timer_open_more_than_24h',
    'autoStoppedSource', 'stale_cleanup_migration_2026_05_13',
    'originalStartedAt', to_char(a.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  updated_at = now()
WHERE (a.stopped_at IS NULL OR a.status = 'active')
  AND a.started_at < now() - INTERVAL '24 hours';
