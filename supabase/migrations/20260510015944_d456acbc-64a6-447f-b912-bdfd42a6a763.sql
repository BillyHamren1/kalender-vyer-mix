-- Ensure unique (staff_id, warehouse_event_id) so upsert is deterministic.
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_assignments_staff_event_uniq
  ON public.warehouse_assignments (staff_id, warehouse_event_id)
  WHERE warehouse_event_id IS NOT NULL;