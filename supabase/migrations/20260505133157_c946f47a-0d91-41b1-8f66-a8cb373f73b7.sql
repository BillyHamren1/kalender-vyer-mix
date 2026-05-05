-- Close orphaned open workday for Markuss from 2026-05-04 so the 2026-05-05 backfill can open a new one.
-- The workday was started manually at 01:44 (likely accidental) and never closed. We close it at the same instant
-- (zero-length) so it becomes a no-op for billing, and tag it so the audit trail is clear.
UPDATE public.workdays
SET
  ended_at = started_at,
  ended_by = 'admin_backfill_cleanup',
  admin_note = COALESCE(admin_note, '') ||
    E'\n[2026-05-05 cleanup] Closed orphaned open workday so server auto-start backfill for 2026-05-05 could proceed. Original started_at preserved.',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'closed_by_cleanup', true,
    'closed_reason', 'orphan_open_workday_blocking_backfill',
    'cleanup_at', now()
  ),
  updated_at = now()
WHERE id = 'd014ec7f-ec62-4544-be69-3b80387a40a1'
  AND ended_at IS NULL;