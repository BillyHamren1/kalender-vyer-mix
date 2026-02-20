
-- Add organization_id to large project tables
DO $$
DECLARE
  org_id uuid;
BEGIN
  SELECT id INTO org_id FROM public.organizations WHERE slug = 'frans-august';

  -- large_projects
  ALTER TABLE public.large_projects ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_projects SET organization_id = %L', org_id);
  ALTER TABLE public.large_projects ALTER COLUMN organization_id SET NOT NULL;

  -- large_project_bookings
  ALTER TABLE public.large_project_bookings ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_project_bookings SET organization_id = %L', org_id);
  ALTER TABLE public.large_project_bookings ALTER COLUMN organization_id SET NOT NULL;

  -- large_project_tasks
  ALTER TABLE public.large_project_tasks ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_project_tasks SET organization_id = %L', org_id);
  ALTER TABLE public.large_project_tasks ALTER COLUMN organization_id SET NOT NULL;

  -- large_project_comments
  ALTER TABLE public.large_project_comments ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_project_comments SET organization_id = %L', org_id);
  ALTER TABLE public.large_project_comments ALTER COLUMN organization_id SET NOT NULL;

  -- large_project_files
  ALTER TABLE public.large_project_files ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_project_files SET organization_id = %L', org_id);
  ALTER TABLE public.large_project_files ALTER COLUMN organization_id SET NOT NULL;

  -- large_project_budget
  ALTER TABLE public.large_project_budget ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_project_budget SET organization_id = %L', org_id);
  ALTER TABLE public.large_project_budget ALTER COLUMN organization_id SET NOT NULL;

  -- large_project_purchases
  ALTER TABLE public.large_project_purchases ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_project_purchases SET organization_id = %L', org_id);
  ALTER TABLE public.large_project_purchases ALTER COLUMN organization_id SET NOT NULL;

  -- large_project_gantt_steps
  ALTER TABLE public.large_project_gantt_steps ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.large_project_gantt_steps SET organization_id = %L', org_id);
  ALTER TABLE public.large_project_gantt_steps ALTER COLUMN organization_id SET NOT NULL;
END $$;

-- Enable RLS on tables that had it disabled
ALTER TABLE public.large_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.large_project_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.large_project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.large_project_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.large_project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.large_project_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.large_project_purchases ENABLE ROW LEVEL SECURITY;

-- Drop old policies and create new org-filtered ones
DROP POLICY IF EXISTS "Allow all operations on large_project_gantt_steps" ON public.large_project_gantt_steps;

CREATE POLICY "org_filter_large_projects" ON public.large_projects
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_large_project_bookings" ON public.large_project_bookings
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_large_project_tasks" ON public.large_project_tasks
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_large_project_comments" ON public.large_project_comments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_large_project_files" ON public.large_project_files
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_large_project_budget" ON public.large_project_budget
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_large_project_purchases" ON public.large_project_purchases
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_large_project_gantt_steps" ON public.large_project_gantt_steps
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
