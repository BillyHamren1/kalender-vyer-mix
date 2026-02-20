
-- projects
DROP POLICY IF EXISTS "Allow all operations on projects" ON public.projects;
CREATE POLICY "org_filter_projects" ON public.projects
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_tasks
DROP POLICY IF EXISTS "Allow all operations on project_tasks" ON public.project_tasks;
CREATE POLICY "org_filter_project_tasks" ON public.project_tasks
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_comments
DROP POLICY IF EXISTS "Allow all operations on project_comments" ON public.project_comments;
CREATE POLICY "org_filter_project_comments" ON public.project_comments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_files
DROP POLICY IF EXISTS "Allow all operations on project_files" ON public.project_files;
CREATE POLICY "org_filter_project_files" ON public.project_files
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_budget
DROP POLICY IF EXISTS "Allow all operations on project_budget" ON public.project_budget;
CREATE POLICY "org_filter_project_budget" ON public.project_budget
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_labor_costs
DROP POLICY IF EXISTS "Allow all operations on project_labor_costs" ON public.project_labor_costs;
CREATE POLICY "org_filter_project_labor_costs" ON public.project_labor_costs
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_purchases
DROP POLICY IF EXISTS "Allow all operations on project_purchases" ON public.project_purchases;
CREATE POLICY "org_filter_project_purchases" ON public.project_purchases
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_quotes
DROP POLICY IF EXISTS "Allow all operations on project_quotes" ON public.project_quotes;
CREATE POLICY "org_filter_project_quotes" ON public.project_quotes
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_invoices
DROP POLICY IF EXISTS "Allow all operations on project_invoices" ON public.project_invoices;
CREATE POLICY "org_filter_project_invoices" ON public.project_invoices
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- project_activity_log
DROP POLICY IF EXISTS "Allow all operations on project_activity_log" ON public.project_activity_log;
CREATE POLICY "org_filter_project_activity_log" ON public.project_activity_log
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
