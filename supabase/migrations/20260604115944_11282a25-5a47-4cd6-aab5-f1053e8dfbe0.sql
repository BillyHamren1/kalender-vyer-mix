
CREATE TABLE public.project_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('standard','large')),
  staff_id text NOT NULL,
  organization_id text NOT NULL,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, project_type, staff_id)
);

CREATE INDEX project_followers_staff_idx ON public.project_followers (staff_id, organization_id);
CREATE INDEX project_followers_project_idx ON public.project_followers (project_id, project_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_followers TO authenticated;
GRANT ALL ON public.project_followers TO service_role;

ALTER TABLE public.project_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read followers"
  ON public.project_followers FOR SELECT
  TO authenticated
  USING (organization_id = ((SELECT public.get_user_organization_id(auth.uid())))::text);

CREATE POLICY "org members can add followers"
  ON public.project_followers FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = ((SELECT public.get_user_organization_id(auth.uid())))::text);

CREATE POLICY "org members can remove followers"
  ON public.project_followers FOR DELETE
  TO authenticated
  USING (organization_id = ((SELECT public.get_user_organization_id(auth.uid())))::text);
