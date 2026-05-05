CREATE TABLE IF NOT EXISTS public.actual_day_event_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  local_date DATE NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'exclude' CHECK (action IN ('exclude')),
  reason TEXT NOT NULL DEFAULT 'manual_remove',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, staff_id, local_date, event_key, action)
);

CREATE INDEX IF NOT EXISTS idx_adeo_lookup
  ON public.actual_day_event_overrides (organization_id, staff_id, local_date);

ALTER TABLE public.actual_day_event_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read overrides"
ON public.actual_day_event_overrides FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "planners insert overrides"
ON public.actual_day_event_overrides FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.has_role('projekt'::public.app_role, auth.uid())
    OR public.has_role('lager'::public.app_role, auth.uid())
  )
  AND created_by = auth.uid()
);

CREATE POLICY "planners delete overrides"
ON public.actual_day_event_overrides FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.has_role('projekt'::public.app_role, auth.uid())
    OR public.has_role('lager'::public.app_role, auth.uid())
  )
);