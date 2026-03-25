
CREATE TABLE public.project_assistants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  project_type text NOT NULL DEFAULT 'medium',
  assistant_name text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, project_type, assistant_name)
);

ALTER TABLE public.project_assistants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_organization_id_project_assistants
  BEFORE INSERT ON public.project_assistants
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE POLICY "Users can view project assistants in their org"
  ON public.project_assistants FOR SELECT TO authenticated
  USING (organization_id = (SELECT get_user_organization_id(auth.uid())));

CREATE POLICY "Users can insert project assistants in their org"
  ON public.project_assistants FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT get_user_organization_id(auth.uid())));

CREATE POLICY "Users can delete project assistants in their org"
  ON public.project_assistants FOR DELETE TO authenticated
  USING (organization_id = (SELECT get_user_organization_id(auth.uid())));
