-- Datafix: stäng Markuss föräldralösa workday från 2026-05-05 och skapa
-- ny workday för dagens öppna LTE 07:08.
UPDATE workdays
SET ended_at = '2026-05-05T16:00:00Z',
    ended_by = 'system_manual_repair',
    review_status = CASE WHEN review_status = 'approved' THEN review_status ELSE 'needs_review' END,
    notes = COALESCE(notes,'') || ' [manual-close: orphan blocked new workday]',
    metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
      'closed_by_manual_repair', true,
      'closed_reason', 'orphan_blocked_workday_first_for_later_day',
      'closed_at', now()
    )
WHERE id = '99b825ee-1b8d-4589-8b8f-d6b49322e5c6'
  AND ended_at IS NULL;

-- Skapa workday för idag, anchorad på LTE entered_at (07:08).
INSERT INTO workdays (
  organization_id, staff_id, started_at, started_by, notes, metadata
) VALUES (
  'f5e5cade-f08b-4833-a105-56461f15b191',
  'staff_1775736478460_k1q8idrvv',
  '2026-05-07T05:08:42.095Z',
  'system_manual_repair',
  'Manuellt skapad: LTE startad 07:08 utan workday för dagen (orphan blockerade workday-first).',
  jsonb_build_object(
    'auto_started', true,
    'auto_start_source', 'manual_repair_lte_without_workday',
    'confidence', 'high',
    'reason_codes', jsonb_build_array('lte_without_workday_for_day','orphan_workday_from_prev_day_blocked'),
    'guarantee', 'no_timer_without_workday'
  )
);