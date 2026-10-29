-- Operations can read shared packing projections. Physical packing mutations
-- and warehouse acknowledgements require the current Warehouse role + HUB gate.
-- Existing tenant policies still apply; these restrictions only narrow writes.
CREATE FUNCTION public.can_write_warehouse_packing(_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
      AND r.organization_id=_organization_id AND r.role::text IN ('admin','lager')
  ) AND public.hub_module_access_allowed(auth.uid(),_organization_id,'lager');
$$;
REVOKE ALL ON FUNCTION public.can_write_warehouse_packing(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_warehouse_packing(uuid) TO authenticated,service_role;

DO $policies$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'packing_projects','packing_list_items','packing_list_item_allocations',
    'packing_parcels','packing_work_sessions','packing_work_session_events','packing_change_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
    EXECUTE format('CREATE POLICY hub_warehouse_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_write_warehouse_packing(organization_id))',target);
    EXECUTE format('CREATE POLICY hub_warehouse_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_write_warehouse_packing(organization_id)) WITH CHECK (public.can_write_warehouse_packing(organization_id))',target);
    EXECUTE format('CREATE POLICY hub_warehouse_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_write_warehouse_packing(organization_id))',target);
    -- TRUNCATE bypasses row policies and has no legitimate browser path.
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM PUBLIC,anon,authenticated',target);
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM anon',target);
  END LOOP;
END;
$policies$;

-- This definer trusts a server-supplied actor/org and must never be a browser
-- RPC. The authenticated Edge boundary checks the exact Planning gate first.
REVOKE ALL ON FUNCTION public.planning_edit_packing_list_item(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planning_edit_packing_list_item(uuid,uuid,uuid,text,text,uuid) TO service_role;
