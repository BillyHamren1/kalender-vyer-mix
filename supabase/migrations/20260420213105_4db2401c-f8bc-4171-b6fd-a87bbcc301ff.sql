CREATE TABLE public.arrival_context_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  travel_log_id uuid NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  kind text NOT NULL CHECK (kind IN ('unplanned_job_candidate','meal_break','supply_store','unknown')),
  confidence double precision NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NULL CHECK (decision IN ('accepted','rejected','ignored') OR decision IS NULL),
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_arrival_ctx_staff_day ON public.arrival_context_suggestions (staff_id, created_at DESC);
CREATE INDEX idx_arrival_ctx_loc ON public.arrival_context_suggestions (staff_id, lat, lng, created_at DESC);

ALTER TABLE public.arrival_context_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on arrival_context_suggestions"
ON public.arrival_context_suggestions FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_filter_arrival_context_suggestions_select"
ON public.arrival_context_suggestions FOR SELECT
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_arrival_context_suggestions_insert"
ON public.arrival_context_suggestions FOR INSERT
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_arrival_context_suggestions_update"
ON public.arrival_context_suggestions FOR UPDATE
USING (organization_id = public.get_user_organization_id(auth.uid()));

ALTER TABLE public.travel_time_logs
  ADD COLUMN IF NOT EXISTS related_booking_id uuid NULL,
  ADD COLUMN IF NOT EXISTS related_booking_note text NULL;

CREATE INDEX IF NOT EXISTS idx_travel_logs_related_booking ON public.travel_time_logs (related_booking_id) WHERE related_booking_id IS NOT NULL;