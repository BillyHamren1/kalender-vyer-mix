-- WMS allocation mirror — populated by scanner-api proxy after every WMS call.
-- Used purely to drive frontend Realtime subscriptions filtered by packing_id /
-- reservation_id so the scanner UI knows which serials are already allocated.
CREATE TABLE IF NOT EXISTS public.wms_reservation_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  packing_id UUID NOT NULL,
  reservation_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  instance_id TEXT,
  item_type_id TEXT,
  sku TEXT,
  item_type_name TEXT,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'allocate-instance',
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_alloc_resv_serial
  ON public.wms_reservation_allocations(reservation_id, serial_number);
CREATE INDEX IF NOT EXISTS idx_wms_alloc_packing
  ON public.wms_reservation_allocations(packing_id);
CREATE INDEX IF NOT EXISTS idx_wms_alloc_org
  ON public.wms_reservation_allocations(organization_id);
CREATE INDEX IF NOT EXISTS idx_wms_alloc_reservation
  ON public.wms_reservation_allocations(reservation_id);

ALTER TABLE public.wms_reservation_allocations ENABLE ROW LEVEL SECURITY;

-- Org isolation — same pattern as packing_list_item_allocations.
DROP POLICY IF EXISTS "org_filter_wms_alloc_select" ON public.wms_reservation_allocations;
CREATE POLICY "org_filter_wms_alloc_select"
  ON public.wms_reservation_allocations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT staff_members.organization_id
      FROM public.staff_members
      WHERE staff_members.user_id = auth.uid()
    )
  );

-- Writes are service-role only (scanner-api edge function).
DROP POLICY IF EXISTS "service_role_wms_alloc_write" ON public.wms_reservation_allocations;
CREATE POLICY "service_role_wms_alloc_write"
  ON public.wms_reservation_allocations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Updated_at auto-touch
DROP TRIGGER IF EXISTS trg_wms_alloc_touch ON public.wms_reservation_allocations;
CREATE TRIGGER trg_wms_alloc_touch
  BEFORE UPDATE ON public.wms_reservation_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Realtime broadcast
ALTER TABLE public.wms_reservation_allocations REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wms_reservation_allocations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.wms_reservation_allocations';
  END IF;
END$$;