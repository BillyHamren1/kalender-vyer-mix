-- External transports use the shared WMS supplier registry.
-- `suppliers` is a local, organization-scoped cache of that registry; it is not
-- a second supplier master. Existing vehicle-based assignments stay readable.

ALTER TABLE public.transport_assignments
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_contact_id uuid,
  ADD COLUMN IF NOT EXISTS requested_vehicle_type text,
  ADD COLUMN IF NOT EXISTS cargo_description text,
  ADD COLUMN IF NOT EXISTS cargo_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS cargo_volume_m3 numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transport_assignments_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.transport_assignments
      ADD CONSTRAINT transport_assignments_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transport_assignments_cargo_weight_nonnegative'
  ) THEN
    ALTER TABLE public.transport_assignments
      ADD CONSTRAINT transport_assignments_cargo_weight_nonnegative
      CHECK (cargo_weight_kg IS NULL OR cargo_weight_kg >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transport_assignments_cargo_volume_nonnegative'
  ) THEN
    ALTER TABLE public.transport_assignments
      ADD CONSTRAINT transport_assignments_cargo_volume_nonnegative
      CHECK (cargo_volume_m3 IS NULL OR cargo_volume_m3 >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transport_assignments_supplier
  ON public.transport_assignments(organization_id, supplier_id, transport_date);

COMMENT ON COLUMN public.transport_assignments.supplier_id IS
  'Organization-scoped local cache row for a supplier owned by the central WMS supplier registry.';
COMMENT ON COLUMN public.transport_assignments.supplier_contact_id IS
  'Selected WMS supplier contact UUID. Contact master data remains in the supplier registry.';
COMMENT ON COLUMN public.transport_assignments.requested_vehicle_type IS
  'Vehicle size/type requested from an external transport supplier.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_assignments TO authenticated;
