
ALTER TABLE public.location_auto_start_cursor
  ADD COLUMN IF NOT EXISTS organization_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lasc_org
  ON public.location_auto_start_cursor (organization_id)
  WHERE organization_id IS NOT NULL;
