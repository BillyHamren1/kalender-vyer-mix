
CREATE TABLE public.pickup_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  external_supplier_id UUID NOT NULL REFERENCES public.external_suppliers(id) ON DELETE RESTRICT,
  -- exactly one parent
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  large_project_id UUID REFERENCES public.large_projects(id) ON DELETE CASCADE,
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  -- payload
  note TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned',
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pickup_stops_status_chk CHECK (status IN ('planned','picked_up','cancelled')),
  CONSTRAINT pickup_stops_one_parent_chk CHECK (
    (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN large_project_id IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN calendar_event_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX idx_pickup_stops_project ON public.pickup_stops(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_pickup_stops_large_project ON public.pickup_stops(large_project_id) WHERE large_project_id IS NOT NULL;
CREATE INDEX idx_pickup_stops_calendar_event ON public.pickup_stops(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
CREATE INDEX idx_pickup_stops_org ON public.pickup_stops(organization_id);
CREATE INDEX idx_pickup_stops_supplier ON public.pickup_stops(external_supplier_id);

CREATE TRIGGER trg_pickup_stops_updated
BEFORE UPDATE ON public.pickup_stops
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pickup_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read pickup_stops"
ON public.pickup_stops FOR SELECT TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "org members insert pickup_stops"
ON public.pickup_stops FOR INSERT TO authenticated
WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "org members update pickup_stops"
ON public.pickup_stops FOR UPDATE TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "org members delete pickup_stops"
ON public.pickup_stops FOR DELETE TO authenticated
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));
