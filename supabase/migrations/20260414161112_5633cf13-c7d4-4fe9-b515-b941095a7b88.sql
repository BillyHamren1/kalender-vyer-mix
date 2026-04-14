-- One-time retroactive backfill: add all staff who have BSA rows for large project bookings
-- but are missing from large_project_staff
INSERT INTO public.large_project_staff (large_project_id, staff_id, organization_id, role)
SELECT DISTINCT lpb.large_project_id, bsa.staff_id, lpb.organization_id, 'field'
FROM public.booking_staff_assignments bsa
JOIN public.large_project_bookings lpb ON lpb.booking_id = bsa.booking_id
ON CONFLICT (large_project_id, staff_id) DO NOTHING;