
CREATE TABLE public.time_report_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_report_id uuid NOT NULL REFERENCES public.time_reports(id) ON DELETE CASCADE,
  edited_by_type text NOT NULL DEFAULT 'staff',
  edited_by_name text NOT NULL,
  edited_by_id text,
  previous_values jsonb NOT NULL DEFAULT '{}',
  new_values jsonb NOT NULL DEFAULT '{}',
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_report_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view edit logs in their org"
ON public.time_report_edit_log
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert edit logs in their org"
ON public.time_report_edit_log
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Service role full access"
ON public.time_report_edit_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_time_report_edit_log_report ON public.time_report_edit_log(time_report_id);
CREATE INDEX idx_time_report_edit_log_org ON public.time_report_edit_log(organization_id);
