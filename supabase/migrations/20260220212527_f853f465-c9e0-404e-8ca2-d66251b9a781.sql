
-- PROMPT 8: Add organization_id to remaining tables

DO $$
DECLARE
  org_id uuid;
BEGIN
  SELECT id INTO org_id FROM public.organizations WHERE slug = 'frans-august';

  -- jobs
  ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.jobs SET organization_id = %L WHERE organization_id IS NULL', org_id);
  ALTER TABLE public.jobs ALTER COLUMN organization_id SET NOT NULL;

  -- job_staff_assignments
  ALTER TABLE public.job_staff_assignments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.job_staff_assignments SET organization_id = %L WHERE organization_id IS NULL', org_id);
  ALTER TABLE public.job_staff_assignments ALTER COLUMN organization_id SET NOT NULL;

  -- job_completion_analytics
  ALTER TABLE public.job_completion_analytics ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.job_completion_analytics SET organization_id = %L WHERE organization_id IS NULL', org_id);
  ALTER TABLE public.job_completion_analytics ALTER COLUMN organization_id SET NOT NULL;

  -- establishment_subtasks
  ALTER TABLE public.establishment_subtasks ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT get_user_organization_id(auth.uid());
  EXECUTE format('UPDATE public.establishment_subtasks SET organization_id = %L WHERE organization_id IS NULL', org_id);
  ALTER TABLE public.establishment_subtasks ALTER COLUMN organization_id SET NOT NULL;
END $$;

-- RLS: Enable on all tables (idempotent)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_completion_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_subtasks ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Allow all operations on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow all operations on job_staff_assignments" ON public.job_staff_assignments;
DROP POLICY IF EXISTS "Allow all access to job_completion_analytics" ON public.job_completion_analytics;
DROP POLICY IF EXISTS "Allow all operations on establishment_subtasks" ON public.establishment_subtasks;

-- New org-filtered policies
CREATE POLICY "org_filter_jobs" ON public.jobs
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_job_staff_assignments" ON public.job_staff_assignments
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_job_completion_analytics" ON public.job_completion_analytics
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "org_filter_establishment_subtasks" ON public.establishment_subtasks
  FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- PROMPT 9: Trigger to auto-set organization_id on INSERT

CREATE OR REPLACE FUNCTION public.set_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := get_user_organization_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger to ALL tables with organization_id
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'bookings','booking_attachments','booking_changes','booking_products','booking_staff_assignments',
      'calendar_events',
      'projects','project_tasks','project_comments','project_files','project_budget',
      'project_labor_costs','project_purchases','project_quotes','project_invoices','project_activity_log',
      'large_projects','large_project_bookings','large_project_tasks','large_project_comments',
      'large_project_files','large_project_budget','large_project_purchases','large_project_gantt_steps',
      'packing_projects','packing_tasks','packing_comments','packing_files','packing_budget',
      'packing_labor_costs','packing_list_items','packing_parcels','packing_purchases',
      'packing_quotes','packing_invoices','packing_task_comments',
      'jobs','job_staff_assignments','job_completion_analytics','establishment_subtasks'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_org_id ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER set_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_id()', tbl);
  END LOOP;
END $$;
