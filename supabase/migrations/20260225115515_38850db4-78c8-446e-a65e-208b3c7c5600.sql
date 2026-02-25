
-- Step 1: Rename old slug to avoid unique constraint conflict
UPDATE public.organizations SET slug = 'frans-august-old' WHERE id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';

-- Step 2: Create the new organization
INSERT INTO public.organizations (id, name, slug)
VALUES ('f5e5cade-f08b-4833-a105-56461f15b191', 'Frans August AB', 'frans-august')
ON CONFLICT (id) DO UPDATE SET name = 'Frans August AB', slug = 'frans-august';

-- Step 3: Migrate all tables (exact list from information_schema)
UPDATE public.booking_attachments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.booking_changes SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.booking_products SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.booking_staff_assignments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.bookings SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.establishment_subtasks SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.job_completion_analytics SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.job_staff_assignments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.jobs SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_project_bookings SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_project_budget SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_project_comments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_project_files SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_project_gantt_steps SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_project_purchases SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_project_tasks SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.large_projects SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_budget SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_comments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_files SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_invoices SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_labor_costs SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_list_items SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_parcels SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_projects SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_purchases SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_quotes SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_task_comments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.packing_tasks SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.profiles SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_activity_log SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_budget SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_comments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_files SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_invoices SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_labor_costs SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_purchases SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_quotes SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.project_tasks SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.projects SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.staff_accounts SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.staff_assignments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.staff_availability SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.staff_job_affinity SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.staff_members SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.sync_state SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.task_comments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.time_reports SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.transport_assignments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.transport_email_log SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.user_roles SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.vehicle_gps_history SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.vehicles SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.warehouse_calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
UPDATE public.webhook_subscriptions SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';

-- Step 4: Delete the old organization
DELETE FROM public.organizations WHERE id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf';
