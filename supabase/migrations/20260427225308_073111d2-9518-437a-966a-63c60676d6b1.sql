
CREATE TABLE IF NOT EXISTS public.packing_list_item_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_list_item_id uuid NOT NULL REFERENCES public.packing_list_items(id) ON DELETE CASCADE,
  parcel_id uuid NOT NULL REFERENCES public.packing_parcels(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  scanned_by text,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plia_item ON public.packing_list_item_allocations(packing_list_item_id);
CREATE INDEX IF NOT EXISTS idx_plia_parcel ON public.packing_list_item_allocations(parcel_id);
CREATE INDEX IF NOT EXISTS idx_plia_org ON public.packing_list_item_allocations(organization_id);

ALTER TABLE public.packing_list_item_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_filter_plia" ON public.packing_list_item_allocations
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

INSERT INTO public.packing_list_item_allocations (packing_list_item_id, parcel_id, quantity, scanned_by, scanned_at, organization_id)
SELECT pli.id, pli.parcel_id, GREATEST(pli.quantity_packed, 1), pli.packed_by, COALESCE(pli.packed_at, now()), pli.organization_id
FROM public.packing_list_items pli
WHERE pli.parcel_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.packing_list_item_allocations a
    WHERE a.packing_list_item_id = pli.id AND a.parcel_id = pli.parcel_id
  );
