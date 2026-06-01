CREATE TABLE public.team_vehicle_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.get_user_organization_id(auth.uid()),
  team_id         text NOT NULL,
  date            date NOT NULL,
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid DEFAULT auth.uid(),
  CONSTRAINT team_vehicle_assignments_unique UNIQUE (organization_id, team_id, date, vehicle_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_vehicle_assignments TO authenticated;
GRANT ALL ON public.team_vehicle_assignments TO service_role;

ALTER TABLE public.team_vehicle_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planning users can view team vehicle assignments"
ON public.team_vehicle_assignments FOR SELECT TO authenticated
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "Planning users can insert team vehicle assignments"
ON public.team_vehicle_assignments FOR INSERT TO authenticated
WITH CHECK (public.has_planning_access(auth.uid()));

CREATE POLICY "Planning users can update team vehicle assignments"
ON public.team_vehicle_assignments FOR UPDATE TO authenticated
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "Planning users can delete team vehicle assignments"
ON public.team_vehicle_assignments FOR DELETE TO authenticated
USING (public.has_planning_access(auth.uid()));

CREATE POLICY "org_filter_team_vehicle_assignments"
ON public.team_vehicle_assignments
AS RESTRICTIVE
FOR ALL TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE INDEX idx_team_vehicle_assignments_org_date ON public.team_vehicle_assignments (organization_id, date);
CREATE INDEX idx_team_vehicle_assignments_vehicle_date ON public.team_vehicle_assignments (vehicle_id, date);

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_vehicle_assignments;