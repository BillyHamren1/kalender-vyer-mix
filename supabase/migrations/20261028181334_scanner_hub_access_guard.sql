-- Version the module ceiling alongside roles. No entitlement is inferred from a
-- different module sharing this backend.
ALTER TABLE hub_projection_private.versions ADD COLUMN module_access jsonb;
ALTER FUNCTION public.apply_hub_role_projection(uuid,uuid,text[],text) SET SCHEMA hub_projection_private;
CREATE FUNCTION public.apply_hub_role_projection(_hub_user_id uuid,_organization_id uuid,_roles text[],_source_revision text,_module_access jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior hub_projection_private.versions; result jsonb;
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 IF _source_revision IS NOT NULL AND (_module_access IS NULL OR jsonb_typeof(_module_access)<>'object' OR jsonb_typeof(_module_access->'planering') IS DISTINCT FROM 'boolean' OR jsonb_typeof(_module_access->'lager') IS DISTINCT FROM 'boolean' OR _module_access - 'planering' - 'lager' <> '{}'::jsonb) THEN
 RETURN jsonb_build_object('ok',false,'error','MODULE_ACCESS_REQUIRED'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_hub_user_id::text||':'||_organization_id::text,0));
 SELECT * INTO prior FROM hub_projection_private.versions WHERE hub_user_id=_hub_user_id AND organization_id=_organization_id FOR UPDATE;
 IF FOUND AND prior.source_revision::text=_source_revision AND prior.module_access IS DISTINCT FROM _module_access THEN
 RETURN jsonb_build_object('ok',false,'error','SOURCE_REVISION_CONFLICT'); END IF;
 result:=hub_projection_private.apply_hub_role_projection(_hub_user_id,_organization_id,_roles,_source_revision);
 IF result->>'ok'='true' AND _source_revision IS NOT NULL THEN
 UPDATE hub_projection_private.versions SET module_access=_module_access WHERE hub_user_id=_hub_user_id AND organization_id=_organization_id;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.apply_hub_role_projection(_hub_user_id uuid,_organization_id uuid,_roles text[],_source_revision text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT public.apply_hub_role_projection(_hub_user_id,_organization_id,_roles,_source_revision,NULL::jsonb)
$$;
REVOKE ALL ON FUNCTION public.apply_hub_role_projection(uuid,uuid,text[],text,jsonb),public.apply_hub_role_projection(uuid,uuid,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hub_role_projection(uuid,uuid,text[],text,jsonb),public.apply_hub_role_projection(uuid,uuid,text[],text) TO service_role;

CREATE FUNCTION public.hub_module_access_allowed(_local_user_id uuid,_organization_id uuid,_module text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 IF _local_user_id IS NULL OR _organization_id IS NULL OR _module NOT IN ('planering','lager') OR _module IS NULL THEN RETURN false; END IF;
 SELECT bool_and(coalesce((v.module_access->>_module)::boolean,false) AND v.roles && CASE WHEN _module='lager' THEN ARRAY['admin','lager'] ELSE ARRAY['admin','projekt','lager'] END) INTO allowed
 FROM hub_projection_private.versions v WHERE v.organization_id=_organization_id AND
 (v.local_user_id=_local_user_id OR v.hub_user_id=_local_user_id OR v.hub_user_id IN
 (SELECT l.hub_user_id FROM public.hub_identity_links l WHERE l.local_user_id=_local_user_id));
 -- No known HUB projection retains pre-cutover local authority. A retained
 -- tombstone or known version without a gate is deliberately fail closed.
 RETURN coalesce(allowed,true);
END $$;
REVOKE ALL ON FUNCTION public.hub_module_access_allowed(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_module_access_allowed(uuid,uuid,text) TO service_role;

-- Retain the existing staff-to-auth binding without an FK: deleting/recreating
-- staff must not erase the HUB authority boundary or turn it into standalone staff.
CREATE TABLE hub_projection_private.scanner_staff_bindings (
 staff_id text PRIMARY KEY, local_user_id uuid NOT NULL, organization_id uuid NOT NULL
);
ALTER TABLE hub_projection_private.scanner_staff_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hub_projection_private.scanner_staff_bindings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON hub_projection_private.scanner_staff_bindings TO service_role;
INSERT INTO hub_projection_private.scanner_staff_bindings
 SELECT id,user_id,organization_id FROM public.staff_members WHERE user_id IS NOT NULL AND organization_id IS NOT NULL;
CREATE FUNCTION hub_projection_private.retain_scanner_staff_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior hub_projection_private.scanner_staff_bindings;
BEGIN
 SELECT * INTO prior FROM hub_projection_private.scanner_staff_bindings WHERE staff_id=NEW.id;
 IF FOUND AND (NEW.user_id IS DISTINCT FROM prior.local_user_id OR NEW.organization_id IS DISTINCT FROM prior.organization_id) THEN
 RAISE EXCEPTION 'Canonical staff binding is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id AND OLD.user_id IS NOT NULL THEN
 RAISE EXCEPTION 'Canonical staff identity is immutable' USING ERRCODE='42501'; END IF;
 IF NEW.user_id IS NOT NULL AND NEW.organization_id IS NOT NULL THEN
  -- Browser clients cannot assign themselves another account's staff authority.
  IF current_setting('role',true) NOT IN ('service_role','postgres','supabase_admin','none') AND
   (TG_OP='INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
   RAISE EXCEPTION 'Canonical staff binding requires trusted server' USING ERRCODE='42501'; END IF;
  INSERT INTO hub_projection_private.scanner_staff_bindings VALUES(NEW.id,NEW.user_id,NEW.organization_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hub_projection_private.retain_scanner_staff_binding() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retain_scanner_staff_binding BEFORE INSERT OR UPDATE ON public.staff_members
 FOR EACH ROW EXECUTE FUNCTION hub_projection_private.retain_scanner_staff_binding();

CREATE FUNCTION public.scanner_staff_access_allowed(_staff_id text,_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE staff public.staff_members; binding hub_projection_private.scanner_staff_bindings;
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 SELECT * INTO staff FROM public.staff_members WHERE id=_staff_id AND organization_id=_organization_id;
 IF NOT FOUND OR staff.is_active IS DISTINCT FROM true THEN RETURN false; END IF;
 SELECT * INTO binding FROM hub_projection_private.scanner_staff_bindings WHERE staff_id=_staff_id;
 IF FOUND AND (staff.user_id IS DISTINCT FROM binding.local_user_id OR staff.organization_id IS DISTINCT FROM binding.organization_id) THEN RETURN false; END IF;
 -- Independent personnel credentials remain their own authority; never link by email.
 IF staff.user_id IS NULL THEN RETURN true; END IF;
 RETURN public.hub_module_access_allowed(staff.user_id,_organization_id,'lager') AND EXISTS
 (SELECT 1 FROM public.user_roles WHERE user_id=staff.user_id AND organization_id=_organization_id AND role::text IN ('admin','lager'));
END $$;
REVOKE ALL ON FUNCTION public.scanner_staff_access_allowed(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scanner_staff_access_allowed(text,uuid) TO service_role;

-- Existing planning policies must not borrow a role from another tenant or
-- keep planning access via the shared warehouse backend.
CREATE OR REPLACE FUNCTION public.has_planning_access(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.user_roles r
 ON r.user_id=p.user_id AND r.organization_id=p.organization_id
 WHERE p.user_id=_user_id AND r.role::text IN ('admin','projekt','lager')
 AND public.hub_module_access_allowed(_user_id,p.organization_id,'planering'));
$$;
