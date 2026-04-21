UPDATE public.travel_time_logs
SET start_time = TIMESTAMPTZ '2026-04-21 05:16:00+00',
    end_time = TIMESTAMPTZ '2026-04-21 06:22:00+00',
    hours_worked = ROUND(EXTRACT(EPOCH FROM (TIMESTAMPTZ '2026-04-21 06:22:00+00' - TIMESTAMPTZ '2026-04-21 05:16:00+00')) / 3600.0, 2)
WHERE id = '4fca4d9c-79e5-4cd2-87f0-10eb877ac0a0';

UPDATE public.location_time_entries
SET entered_at = TIMESTAMPTZ '2026-04-21 06:22:00+00'
WHERE id = 'a608f2f9-d921-48a2-a4fd-a5677ada5733'
  AND source = 'auto_assigned_backfill';