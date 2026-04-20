ALTER TABLE public.time_reports
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rejected_by TEXT,
ADD COLUMN IF NOT EXISTS rejection_comment TEXT;

ALTER TABLE public.travel_time_logs
ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approved_by TEXT,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rejected_by TEXT,
ADD COLUMN IF NOT EXISTS rejection_comment TEXT;

CREATE TABLE IF NOT EXISTS public.travel_time_edit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_log_id UUID NOT NULL REFERENCES public.travel_time_logs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  edited_by_type TEXT NOT NULL DEFAULT 'admin',
  edited_by_name TEXT NOT NULL,
  edited_by_id TEXT,
  previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.travel_time_edit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'travel_time_edit_log'
      AND policyname = 'Org members can view travel edit logs'
  ) THEN
    CREATE POLICY "Org members can view travel edit logs"
    ON public.travel_time_edit_log
    FOR SELECT
    USING (organization_id = public.get_user_organization_id(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'travel_time_edit_log'
      AND policyname = 'Org members can create travel edit logs'
  ) THEN
    CREATE POLICY "Org members can create travel edit logs"
    ON public.travel_time_edit_log
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_travel_time_logs_staff_date_review
  ON public.travel_time_logs (staff_id, report_date, approved, rejected_at);

CREATE INDEX IF NOT EXISTS idx_time_reports_staff_date_review
  ON public.time_reports (staff_id, report_date, approved, rejected_at);

CREATE INDEX IF NOT EXISTS idx_travel_time_edit_log_travel_log_id_created_at
  ON public.travel_time_edit_log (travel_log_id, created_at DESC);