DROP POLICY IF EXISTS "Org members can view travel edit logs" ON public.travel_time_edit_log;
DROP POLICY IF EXISTS "Org members can create travel edit logs" ON public.travel_time_edit_log;

CREATE POLICY "Org members can view travel edit logs"
ON public.travel_time_edit_log
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can create travel edit logs"
ON public.travel_time_edit_log
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));