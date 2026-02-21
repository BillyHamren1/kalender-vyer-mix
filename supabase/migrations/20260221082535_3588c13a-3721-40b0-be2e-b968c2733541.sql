
-- ============================================
-- Prompt A: Add organization_id to 10 tables
-- ============================================

-- 1. time_reports
ALTER TABLE public.time_reports ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.time_reports SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.time_reports ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.time_reports ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.time_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_time_reports" ON public.time_reports AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_time_reports BEFORE INSERT ON public.time_reports FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 2. transport_assignments
ALTER TABLE public.transport_assignments ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.transport_assignments SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.transport_assignments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.transport_assignments ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.transport_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_transport_assignments" ON public.transport_assignments AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_transport_assignments BEFORE INSERT ON public.transport_assignments FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 3. transport_email_log
ALTER TABLE public.transport_email_log ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.transport_email_log SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.transport_email_log ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.transport_email_log ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.transport_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_transport_email_log" ON public.transport_email_log AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_transport_email_log BEFORE INSERT ON public.transport_email_log FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 4. vehicles
ALTER TABLE public.vehicles ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.vehicles SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.vehicles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_vehicles" ON public.vehicles AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_vehicles BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 5. vehicle_gps_history
ALTER TABLE public.vehicle_gps_history ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.vehicle_gps_history SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.vehicle_gps_history ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.vehicle_gps_history ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.vehicle_gps_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_vehicle_gps_history" ON public.vehicle_gps_history AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_vehicle_gps_history BEFORE INSERT ON public.vehicle_gps_history FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 6. warehouse_calendar_events
ALTER TABLE public.warehouse_calendar_events ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.warehouse_calendar_events SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.warehouse_calendar_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.warehouse_calendar_events ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.warehouse_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_warehouse_calendar_events" ON public.warehouse_calendar_events AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_warehouse_calendar_events BEFORE INSERT ON public.warehouse_calendar_events FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 7. webhook_subscriptions
ALTER TABLE public.webhook_subscriptions ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.webhook_subscriptions SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.webhook_subscriptions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.webhook_subscriptions ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_webhook_subscriptions" ON public.webhook_subscriptions AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_webhook_subscriptions BEFORE INSERT ON public.webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 8. sync_state
ALTER TABLE public.sync_state ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.sync_state SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.sync_state ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.sync_state ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_sync_state" ON public.sync_state AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_sync_state BEFORE INSERT ON public.sync_state FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 9. task_comments
ALTER TABLE public.task_comments ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.task_comments SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.task_comments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.task_comments ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_filter_task_comments" ON public.task_comments AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_org_id_task_comments BEFORE INSERT ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 10. user_roles (special handling - keep SECURITY DEFINER functions working)
ALTER TABLE public.user_roles ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.user_roles SET organization_id = '11428b28-8ac0-4f47-880d-cdaac0e12fcf' WHERE organization_id IS NULL;
ALTER TABLE public.user_roles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN organization_id SET DEFAULT get_user_organization_id(auth.uid());
CREATE TRIGGER set_org_id_user_roles BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
-- NOTE: user_roles already has RLS enabled. Adding org filter policy.
-- The existing SECURITY DEFINER functions (has_role, has_planning_access) don't need changes
-- since they filter by user_id which is already unique per user.
CREATE POLICY "org_filter_user_roles" ON public.user_roles AS RESTRICTIVE FOR ALL USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- confirmed_bookings: NO organization_id needed.
-- It's a simple view-like table with only an 'id' column referencing bookings.
-- The bookings table already has organization_id and RLS.
