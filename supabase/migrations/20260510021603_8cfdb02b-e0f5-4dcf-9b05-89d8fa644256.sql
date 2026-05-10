-- Allow direct (staff_id, packing_id) upserts for warehouse_assignments
-- when no warehouse_calendar_event exists (e.g. assigning a person directly
-- to a packing from the warehouse UI).
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_assignments_staff_packing_uniq
  ON public.warehouse_assignments (staff_id, packing_id)
  WHERE packing_id IS NOT NULL AND warehouse_event_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_packing
  ON public.warehouse_assignments (packing_id)
  WHERE packing_id IS NOT NULL;