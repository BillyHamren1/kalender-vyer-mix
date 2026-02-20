
DO $$
DECLARE
  org_id uuid;
BEGIN
  SELECT id INTO org_id FROM public.organizations WHERE slug = 'frans-august';

  ALTER TABLE public.packing_projects ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_projects SET organization_id = %L', org_id);
  ALTER TABLE public.packing_projects ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_tasks ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_tasks SET organization_id = %L', org_id);
  ALTER TABLE public.packing_tasks ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_comments ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_comments SET organization_id = %L', org_id);
  ALTER TABLE public.packing_comments ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_files ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_files SET organization_id = %L', org_id);
  ALTER TABLE public.packing_files ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_budget ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_budget SET organization_id = %L', org_id);
  ALTER TABLE public.packing_budget ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_labor_costs ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_labor_costs SET organization_id = %L', org_id);
  ALTER TABLE public.packing_labor_costs ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_list_items ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_list_items SET organization_id = %L', org_id);
  ALTER TABLE public.packing_list_items ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_parcels ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_parcels SET organization_id = %L', org_id);
  ALTER TABLE public.packing_parcels ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_purchases ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_purchases SET organization_id = %L', org_id);
  ALTER TABLE public.packing_purchases ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_quotes ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_quotes SET organization_id = %L', org_id);
  ALTER TABLE public.packing_quotes ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_invoices ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_invoices SET organization_id = %L', org_id);
  ALTER TABLE public.packing_invoices ALTER COLUMN organization_id SET NOT NULL;

  ALTER TABLE public.packing_task_comments ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.packing_task_comments SET organization_id = %L', org_id);
  ALTER TABLE public.packing_task_comments ALTER COLUMN organization_id SET NOT NULL;
END $$;

-- RLS policies
DROP POLICY IF EXISTS "Allow all operations on packing_projects" ON public.packing_projects;
CREATE POLICY "org_filter_packing_projects" ON public.packing_projects
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_tasks" ON public.packing_tasks;
CREATE POLICY "org_filter_packing_tasks" ON public.packing_tasks
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_comments" ON public.packing_comments;
CREATE POLICY "org_filter_packing_comments" ON public.packing_comments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_files" ON public.packing_files;
CREATE POLICY "org_filter_packing_files" ON public.packing_files
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_budget" ON public.packing_budget;
CREATE POLICY "org_filter_packing_budget" ON public.packing_budget
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_labor_costs" ON public.packing_labor_costs;
CREATE POLICY "org_filter_packing_labor_costs" ON public.packing_labor_costs
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_list_items" ON public.packing_list_items;
CREATE POLICY "org_filter_packing_list_items" ON public.packing_list_items
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_parcels" ON public.packing_parcels;
CREATE POLICY "org_filter_packing_parcels" ON public.packing_parcels
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_purchases" ON public.packing_purchases;
CREATE POLICY "org_filter_packing_purchases" ON public.packing_purchases
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_quotes" ON public.packing_quotes;
CREATE POLICY "org_filter_packing_quotes" ON public.packing_quotes
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_invoices" ON public.packing_invoices;
CREATE POLICY "org_filter_packing_invoices" ON public.packing_invoices
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all operations on packing_task_comments" ON public.packing_task_comments;
CREATE POLICY "org_filter_packing_task_comments" ON public.packing_task_comments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
