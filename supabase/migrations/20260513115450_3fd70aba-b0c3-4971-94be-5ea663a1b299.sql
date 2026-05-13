-- Andis: stoppa duplicerad GPS-timer vid samma tid som hans manuella stopp
UPDATE active_time_registrations
SET stopped_at = '2026-05-12 15:49:18+00',
    status = 'stopped',
    stop_source = 'admin_manual_correction',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'admin_correction', jsonb_build_object(
        'previous_stopped_at', stopped_at,
        'reason', 'duplicate_of_manual_user_timer_same_day',
        'corrected_at', now()
      )
    )
WHERE id = '957616e5-776a-4434-ae6c-6618811edb19';

-- Kristaps: stoppa GPS-timer vid sista pingen inne i FA Warehouse geofence
UPDATE active_time_registrations
SET stopped_at = '2026-05-12 13:14:27+00',
    status = 'stopped',
    stop_source = 'admin_manual_correction',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'admin_correction', jsonb_build_object(
        'previous_stopped_at', stopped_at,
        'reason', 'last_gps_ping_inside_geofence',
        'corrected_at', now()
      )
    )
WHERE id = 'ed74d6c4-610f-43d2-8e80-4e81cb86f6af';

-- Kristaps: skapa tidrapport för 12 maj på FA Warehouse (lager)
INSERT INTO time_reports (
  staff_id, organization_id, report_date, start_time, end_time,
  hours_worked, break_time, location_id, source, source_entry_id, description
)
SELECT
  'staff_1775736938158_7uxt75jz2',
  'f5e5cade-f08b-4833-a105-56461f15b191',
  '2026-05-12'::date,
  '09:33:39'::time,
  '13:14:27'::time,
  3.68,
  0,
  (SELECT id FROM organization_locations
     WHERE organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
       AND name ILIKE '%FA Warehouse%' LIMIT 1),
  'admin_manual_correction',
  'ed74d6c4-610f-43d2-8e80-4e81cb86f6af',
  'Skapad av admin från GPS-stopp 12 maj (sista ping i lagrets geofence).'
WHERE NOT EXISTS (
  SELECT 1 FROM time_reports
  WHERE source_entry_id = 'ed74d6c4-610f-43d2-8e80-4e81cb86f6af'
);