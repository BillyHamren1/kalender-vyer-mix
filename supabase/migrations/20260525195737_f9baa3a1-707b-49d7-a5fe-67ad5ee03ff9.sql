
ALTER TABLE public.staff_day_submissions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_snapshot_id text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_payload_json jsonb,
  ADD COLUMN IF NOT EXISTS correction_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS correction_requested_by uuid;

CREATE INDEX IF NOT EXISTS idx_staff_day_submissions_source
  ON public.staff_day_submissions (source);

CREATE TABLE IF NOT EXISTS public.staff_day_submission_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  submission_id uuid NOT NULL REFERENCES public.staff_day_submissions(id) ON DELETE CASCADE,
  staff_id text NOT NULL,
  date date NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('staff','admin','system')),
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdsm_submission ON public.staff_day_submission_messages (submission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sdsm_staff_date ON public.staff_day_submission_messages (organization_id, staff_id, date);

ALTER TABLE public.staff_day_submission_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sdsm_org_isolation"
  ON public.staff_day_submission_messages
  AS RESTRICTIVE
  FOR ALL
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "sdsm_select"
  ON public.staff_day_submission_messages
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      public.has_role('admin'::app_role, auth.uid())
      OR public.has_role('projekt'::app_role, auth.uid())
      OR public.has_role('lager'::app_role, auth.uid())
      OR staff_id = (auth.uid())::text
    )
  );

CREATE POLICY "sdsm_insert"
  ON public.staff_day_submission_messages
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      (
        author_role = 'admin'
        AND (
          public.has_role('admin'::app_role, auth.uid())
          OR public.has_role('projekt'::app_role, auth.uid())
        )
      )
      OR (author_role = 'staff' AND staff_id = (auth.uid())::text)
      OR author_role = 'system'
    )
  );
