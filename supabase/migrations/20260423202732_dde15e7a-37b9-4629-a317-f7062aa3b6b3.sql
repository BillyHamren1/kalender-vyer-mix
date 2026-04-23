
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if any
DO $$ BEGIN
  PERFORM cron.unschedule('reality-reconciler-every-5-min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reality-reconciler-every-5-min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/reality-reconciler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $cron$
);

-- ───────────────────────────────────────────────────────────────────────
-- One-time cleanup for Raivis (staff_1775736348370_e5mua0yum) on 2026-04-23
-- ───────────────────────────────────────────────────────────────────────

-- Close the open travel log at 13:00:37 (first GPS ping inside FA Warehouse)
UPDATE travel_time_logs
SET end_time = '2026-04-23T13:00:37+00'::timestamptz,
    to_latitude = 59.49151552497775,
    to_longitude = 17.85531877807996,
    to_address = 'FA Warehouse',
    classification = 'work',
    hours_worked = ROUND(EXTRACT(EPOCH FROM ('2026-04-23T13:00:37+00'::timestamptz - start_time)) / 3600.0, 2)
WHERE id = 'b0cf0c7c-78cb-49c1-88dc-5f4562bae03d'
  AND end_time IS NULL;

-- Create missing FA Warehouse location entry (skip if already exists)
INSERT INTO location_time_entries (
  staff_id, organization_id, location_id, entered_at, entry_date, source, client_dedupe_key
)
SELECT
  'staff_1775736348370_e5mua0yum',
  'f5e5cade-f08b-4833-a105-56461f15b191',
  '0b9d94df-e46e-4987-8b7f-ef04b663dac5',
  '2026-04-23T13:00:37+00'::timestamptz,
  '2026-04-23'::date,
  'ai_reconciled',
  'ai-reality-staff_1775736348370_e5mua0yum-0b9d94df-e46e-4987-8b7f-ef04b663dac5-2026-04-23T13:00:37+00'
WHERE NOT EXISTS (
  SELECT 1 FROM location_time_entries
  WHERE staff_id = 'staff_1775736348370_e5mua0yum'
    AND location_id = '0b9d94df-e46e-4987-8b7f-ef04b663dac5'
    AND entry_date = '2026-04-23'::date
);

-- Create missing workday starting at 07:05 (first manual location stamp today)
INSERT INTO workdays (staff_id, organization_id, started_at, started_by)
SELECT
  'staff_1775736348370_e5mua0yum',
  'f5e5cade-f08b-4833-a105-56461f15b191',
  '2026-04-23T07:05:42+00'::timestamptz,
  'ai_reconciled'
WHERE NOT EXISTS (
  SELECT 1 FROM workdays
  WHERE staff_id = 'staff_1775736348370_e5mua0yum'
    AND started_at >= '2026-04-23T00:00:00+00'::timestamptz
    AND started_at < '2026-04-24T00:00:00+00'::timestamptz
);

-- Audit row for the cleanup
INSERT INTO ai_reality_corrections (
  organization_id, staff_id, situation_kind, confidence, ai_reasoning, ai_model,
  situation_snapshot, suggested_actions, applied_actions, status, applied_at
) VALUES (
  'f5e5cade-f08b-4833-a105-56461f15b191',
  'staff_1775736348370_e5mua0yum',
  'travel_arrived_undetected',
  0.99,
  'Engångs-cleanup: Raivis hade öppen resa sedan 11:45 utan destination. GPS visar honom inne i FA Warehouse från 13:00. Stängde resan, öppnade lager-stämpling, skapade arbetsdag från 07:05.',
  'manual_migration',
  '{"raivis_cleanup": "2026-04-23"}'::jsonb,
  '[]'::jsonb,
  '[{"action":"close_travel","at":"2026-04-23T13:00:37+00"},{"action":"open_location","at":"2026-04-23T13:00:37+00"},{"action":"ensure_workday","at":"2026-04-23T07:05:42+00"}]'::jsonb,
  'applied',
  now()
);
