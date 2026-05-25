-- Persistent per-day GPS snapshot cache for staff visits.
-- Avoids re-paginating staff_location_history every time the admin opens
-- the GPS week view. Past days are immutable; today is rebuilt only when
-- new pings arrive (detected via cheap aggregate signature, not triggers).

CREATE TABLE IF NOT EXISTS public.staff_gps_day_snapshots (
  staff_id        UUID NOT NULL,
  date            DATE NOT NULL,
  organization_id UUID NOT NULL,
  snapshot        JSONB NOT NULL,
  -- "count|max(recorded_at)|fenceVersion" — cheap to recompute, no trigger.
  input_signature TEXT NOT NULL,
  built_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_gps_day_snapshots_org_date
  ON public.staff_gps_day_snapshots (organization_id, date);

ALTER TABLE public.staff_gps_day_snapshots ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user in the same org (matches existing
-- staff_location_history read pattern; edge functions use service role).
CREATE POLICY "staff_gps_day_snapshots_select_same_org"
  ON public.staff_gps_day_snapshots
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Writes only via service role (edge functions). No INSERT/UPDATE/DELETE
-- policies for authenticated → effectively read-only from the client.
