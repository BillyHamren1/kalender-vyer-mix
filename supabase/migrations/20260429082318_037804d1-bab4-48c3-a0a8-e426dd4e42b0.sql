
-- staff_members.id är TEXT, inte UUID — använd text för FK-kolumnerna.

ALTER TABLE public.packing_list_items
  ADD COLUMN IF NOT EXISTS packed_by_staff_id   text REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by_staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packing_list_items_packed_by_staff_id
  ON public.packing_list_items (packed_by_staff_id) WHERE packed_by_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packing_list_items_verified_by_staff_id
  ON public.packing_list_items (verified_by_staff_id) WHERE verified_by_staff_id IS NOT NULL;

ALTER TABLE public.packing_list_item_allocations
  ADD COLUMN IF NOT EXISTS scanned_by_staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packing_list_item_allocations_scanned_by_staff_id
  ON public.packing_list_item_allocations (scanned_by_staff_id) WHERE scanned_by_staff_id IS NOT NULL;

ALTER TABLE public.packing_projects
  ADD COLUMN IF NOT EXISTS signed_by_staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packing_projects_signed_by_staff_id
  ON public.packing_projects (signed_by_staff_id) WHERE signed_by_staff_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='packing_parcels') THEN
    EXECUTE 'ALTER TABLE public.packing_parcels
             ADD COLUMN IF NOT EXISTS created_by_staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_packing_parcels_created_by_staff_id
             ON public.packing_parcels (created_by_staff_id) WHERE created_by_staff_id IS NOT NULL';
  END IF;
END $$;
