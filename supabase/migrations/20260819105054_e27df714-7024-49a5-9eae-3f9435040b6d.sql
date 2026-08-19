CREATE TABLE public.packing_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  booking_id uuid,
  booking_product_id uuid,
  packing_list_item_id uuid,
  change_type text NOT NULL CHECK (change_type IN ('item_added','item_removed','quantity_changed')),
  product_name text,
  sku text,
  old_quantity integer,
  new_quantity integer,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('short_notice','normal')),
  days_until_rig integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed')),
  acknowledged_by uuid,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_change_requests TO authenticated;
GRANT ALL ON public.packing_change_requests TO service_role;

ALTER TABLE public.packing_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view packing change requests"
ON public.packing_change_requests FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update packing change requests"
ON public.packing_change_requests FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert packing change requests"
ON public.packing_change_requests FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE UNIQUE INDEX packing_change_requests_pending_uniq
ON public.packing_change_requests (packing_id, booking_product_id, change_type)
WHERE status = 'pending';

CREATE INDEX packing_change_requests_packing_status_idx
ON public.packing_change_requests (packing_id, status);

CREATE TRIGGER update_packing_change_requests_updated_at
BEFORE UPDATE ON public.packing_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.packing_projects
ADD COLUMN IF NOT EXISTS blocked_by_short_notice_change boolean NOT NULL DEFAULT false;