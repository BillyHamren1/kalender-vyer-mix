UPDATE public.bookings SET assigned_project_id = NULL, updated_at = now() WHERE id = '407a1196-0d1f-4c74-9cbd-3c80e308c8f1';

DELETE FROM public.project_activity_log     WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_budget           WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_purchases        WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_quotes           WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_invoices         WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_labor_costs      WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_tasks            WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_files            WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_suppliers        WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_supplier_links   WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.pickup_stops             WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.job_completion_analytics WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';

DELETE FROM public.projects WHERE id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';