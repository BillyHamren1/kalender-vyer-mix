
DO $$
DECLARE
  org_id uuid;
BEGIN
  SELECT id INTO org_id FROM public.organizations WHERE slug = 'frans-august';

  -- projects
  ALTER TABLE public.projects ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.projects SET organization_id = %L', org_id);
  ALTER TABLE public.projects ALTER COLUMN organization_id SET NOT NULL;

  -- project_tasks
  ALTER TABLE public.project_tasks ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_tasks SET organization_id = %L', org_id);
  ALTER TABLE public.project_tasks ALTER COLUMN organization_id SET NOT NULL;

  -- project_comments
  ALTER TABLE public.project_comments ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_comments SET organization_id = %L', org_id);
  ALTER TABLE public.project_comments ALTER COLUMN organization_id SET NOT NULL;

  -- project_files
  ALTER TABLE public.project_files ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_files SET organization_id = %L', org_id);
  ALTER TABLE public.project_files ALTER COLUMN organization_id SET NOT NULL;

  -- project_budget
  ALTER TABLE public.project_budget ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_budget SET organization_id = %L', org_id);
  ALTER TABLE public.project_budget ALTER COLUMN organization_id SET NOT NULL;

  -- project_labor_costs
  ALTER TABLE public.project_labor_costs ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_labor_costs SET organization_id = %L', org_id);
  ALTER TABLE public.project_labor_costs ALTER COLUMN organization_id SET NOT NULL;

  -- project_purchases
  ALTER TABLE public.project_purchases ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_purchases SET organization_id = %L', org_id);
  ALTER TABLE public.project_purchases ALTER COLUMN organization_id SET NOT NULL;

  -- project_quotes
  ALTER TABLE public.project_quotes ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_quotes SET organization_id = %L', org_id);
  ALTER TABLE public.project_quotes ALTER COLUMN organization_id SET NOT NULL;

  -- project_invoices
  ALTER TABLE public.project_invoices ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_invoices SET organization_id = %L', org_id);
  ALTER TABLE public.project_invoices ALTER COLUMN organization_id SET NOT NULL;

  -- project_activity_log
  ALTER TABLE public.project_activity_log ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.project_activity_log SET organization_id = %L', org_id);
  ALTER TABLE public.project_activity_log ALTER COLUMN organization_id SET NOT NULL;
END $$;
