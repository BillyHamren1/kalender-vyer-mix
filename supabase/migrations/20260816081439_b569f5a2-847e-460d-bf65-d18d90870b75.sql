CREATE UNIQUE INDEX IF NOT EXISTS warehouse_assignments_org_booking_staff_date_type_uidx
  ON public.warehouse_assignments (organization_id, booking_id, staff_id, assignment_date, assignment_type, action)
  WHERE booking_id IS NOT NULL;