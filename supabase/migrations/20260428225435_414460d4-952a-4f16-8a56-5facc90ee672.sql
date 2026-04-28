CREATE TRIGGER set_org_id BEFORE INSERT ON public.large_project_cost_lines
FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();