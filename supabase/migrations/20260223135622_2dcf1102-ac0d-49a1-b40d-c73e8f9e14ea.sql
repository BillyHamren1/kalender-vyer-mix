
-- Fix sync_state RLS: change RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "org_filter_sync_state" ON sync_state;

CREATE POLICY "org_filter_sync_state" ON sync_state
  FOR ALL
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
