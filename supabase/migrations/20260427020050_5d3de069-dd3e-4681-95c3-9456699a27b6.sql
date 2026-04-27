CREATE TABLE IF NOT EXISTS public.large_project_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.get_user_organization_id(auth.uid()),
  large_project_id uuid NOT NULL REFERENCES public.large_projects(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('rig', 'event', 'rigDown')),
  assignment_date date NOT NULL,
  team_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (large_project_id, phase, assignment_date)
);

CREATE INDEX IF NOT EXISTS idx_lpta_org_date
  ON public.large_project_team_assignments (organization_id, assignment_date);

CREATE INDEX IF NOT EXISTS idx_lpta_project
  ON public.large_project_team_assignments (large_project_id);

ALTER TABLE public.large_project_team_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpta_select_own_org"
  ON public.large_project_team_assignments
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "lpta_insert_own_org"
  ON public.large_project_team_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "lpta_update_own_org"
  ON public.large_project_team_assignments
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "lpta_delete_own_org"
  ON public.large_project_team_assignments
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER trg_lpta_updated_at
  BEFORE UPDATE ON public.large_project_team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();