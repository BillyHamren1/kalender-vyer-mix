-- Fix views to use SECURITY INVOKER (default for new views, but explicit is better)
ALTER VIEW public.v_monthly_project_summary SET (security_invoker = on);
ALTER VIEW public.v_product_project_matrix SET (security_invoker = on);
ALTER VIEW public.v_staff_project_matrix SET (security_invoker = on);
ALTER VIEW public.v_product_category_monthly SET (security_invoker = on);
ALTER VIEW public.v_staff_monthly_performance SET (security_invoker = on);
ALTER VIEW public.v_product_combinations SET (security_invoker = on);