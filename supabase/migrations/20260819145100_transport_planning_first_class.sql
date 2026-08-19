-- First-class transport planning without destructive rewrites of legacy warehouse staffing.
-- Existing transport_assignments rows remain valid.

ALTER TABLE public.transport_assignments
  ALTER COLUMN vehicle_id DROP NOT NULL;

-- Keep a planned transport if a vehicle is later removed from the fleet.
ALTER TABLE public.transport_assignments
  DROP CONSTRAINT IF EXISTS transport_assignments_vehicle_id_fkey;
ALTER TABLE public.transport_assignments
  ADD CONSTRAINT transport_assignments_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE public.transport_assignments
  DROP CONSTRAINT IF EXISTS transport_assignments_booking_id_transport_date_key;

ALTER TABLE public.transport_assignments
  ADD COLUMN IF NOT EXISTS planning_status text NOT NULL DEFAULT 'preliminary',
  ADD COLUMN IF NOT EXISTS transport_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS origin_address text,
  ADD COLUMN IF NOT EXISTS destination_address text,
  ADD COLUMN IF NOT EXISTS transport_end_time time without time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transport_assignments_planning_status_check'
  ) THEN
    ALTER TABLE public.transport_assignments
      ADD CONSTRAINT transport_assignments_planning_status_check
      CHECK (planning_status IN ('preliminary', 'confirmed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transport_assignments_transport_type_check'
  ) THEN
    ALTER TABLE public.transport_assignments
      ADD CONSTRAINT transport_assignments_transport_type_check
      CHECK (transport_type IN ('delivery', 'pickup', 'transfer', 'internal', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transport_assignments_booking_date_time
  ON public.transport_assignments(booking_id, transport_date, transport_time);
CREATE INDEX IF NOT EXISTS idx_transport_assignments_planning_status
  ON public.transport_assignments(organization_id, planning_status, transport_date);

COMMENT ON COLUMN public.transport_assignments.planning_status IS
  'Planning certainty (preliminary/confirmed), intentionally separate from execution status.';
COMMENT ON COLUMN public.transport_assignments.transport_type IS
  'Operational direction/type: delivery, pickup, transfer, internal, other.';
