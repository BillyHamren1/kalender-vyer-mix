-- Backfill: Raivis Minalto's missing travel log + Holmträskvägen check-in for today
-- Travel: warehouse → Holmträskvägen 19, 07:16 → 08:22
INSERT INTO travel_time_logs (
  staff_id, organization_id, report_date, start_time, end_time, hours_worked,
  from_address, from_latitude, from_longitude,
  to_address, to_latitude, to_longitude,
  description, auto_detected, classification,
  related_booking_id, destination_booking_id, approved
) VALUES (
  'staff_1775736348370_e5mua0yum',
  'f5e5cade-f08b-4833-a105-56461f15b191',
  CURRENT_DATE,
  (CURRENT_DATE + TIME '07:16'),
  (CURRENT_DATE + TIME '08:22'),
  1.10,
  'Kungens kurva (lager)', 59.2698, 17.9183,
  'Holmträskvägen 19', 59.17255, 17.991247,
  'Backfill: bakgrundsresa lager → Westmans-jobb (server-side detection saknades)',
  true, 'work',
  '74e895a8-29e1-4ad6-ad07-518d46bfb70b',
  '74e895a8-29e1-4ad6-ad07-518d46bfb70b',
  false
);

-- Open check-in on Holmträskvägen-bokningen från 08:22
INSERT INTO location_time_entries (
  organization_id, staff_id, booking_id, entry_date, entered_at, source
) VALUES (
  'f5e5cade-f08b-4833-a105-56461f15b191',
  'staff_1775736348370_e5mua0yum',
  '74e895a8-29e1-4ad6-ad07-518d46bfb70b',
  CURRENT_DATE,
  (CURRENT_DATE + TIME '08:22'),
  'auto_assigned_backfill'
);