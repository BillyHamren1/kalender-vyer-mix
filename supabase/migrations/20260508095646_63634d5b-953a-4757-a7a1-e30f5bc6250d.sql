CREATE TABLE IF NOT EXISTS public.staff_presence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('arrival','departure')),
  target_type text NOT NULL,
  target_id text,
  target_label text,
  event_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'gps_geofence',
  confidence numeric(4,3),
  gps_segment_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_presence_events_unique_event
  ON public.staff_presence_events (
    organization_id, staff_id, event_type,
    target_type, COALESCE(target_id,''), event_at
  );

CREATE INDEX IF NOT EXISTS staff_presence_events_staff_time_idx
  ON public.staff_presence_events (organization_id, staff_id, event_at DESC);

CREATE INDEX IF NOT EXISTS staff_presence_events_segment_idx
  ON public.staff_presence_events (gps_segment_id) WHERE gps_segment_id IS NOT NULL;

ALTER TABLE public.staff_presence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view presence events"
  ON public.staff_presence_events FOR SELECT
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert presence events"
  ON public.staff_presence_events FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

-- Auto-fill organization_id when omitted (mirrors other tables)
CREATE TRIGGER set_staff_presence_events_org
  BEFORE INSERT ON public.staff_presence_events
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();