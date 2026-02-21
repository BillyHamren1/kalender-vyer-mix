
DROP POLICY IF EXISTS "org_filter_staff_members" ON public.staff_members;
CREATE POLICY "org_filter_staff_members" ON public.staff_members
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
