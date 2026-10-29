-- Synthetic live verification, always rolled back. No credentials/messages.
BEGIN;
INSERT INTO public.organizations(id,name,slug) VALUES
('cdb30000-0000-4000-8000-000000000011','Scanner rollback A','scanner-authz-rollback-a'),
('cdb30000-0000-4000-8000-000000000012','Scanner rollback B','scanner-authz-rollback-b');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
('cdb30000-0000-4000-8000-000000000001','scanner-authz@example.invalid','{"organization_id":"cdb30000-0000-4000-8000-000000000011"}');
INSERT INTO public.profiles(user_id,email,organization_id) VALUES
('cdb30000-0000-4000-8000-000000000001','scanner-authz@example.invalid','cdb30000-0000-4000-8000-000000000011') ON CONFLICT(user_id) DO UPDATE SET organization_id=EXCLUDED.organization_id;
INSERT INTO public.staff_members(id,name,organization_id,user_id,is_active) VALUES
('scanner-authz-fixture','Scanner rollback','cdb30000-0000-4000-8000-000000000011','cdb30000-0000-4000-8000-000000000001',true),
('scanner-independent-fixture','Independent rollback','cdb30000-0000-4000-8000-000000000011',null,true);
SET LOCAL ROLE service_role;
DO $test$
DECLARE r jsonb; u uuid:='cdb30000-0000-4000-8000-000000000001'; a uuid:='cdb30000-0000-4000-8000-000000000011'; b uuid:='cdb30000-0000-4000-8000-000000000012';
BEGIN
 IF NOT public.scanner_staff_access_allowed('scanner-independent-fixture',a) THEN RAISE EXCEPTION 'independent authority changed'; END IF;
 IF public.scanner_staff_access_allowed('scanner-authz-fixture',a) THEN RAISE EXCEPTION 'roleless staff allowed'; END IF;
 r:=public.apply_hub_role_projection(u,a,ARRAY['lager'],'9007199254740993','{"planering":true,"lager":true}');
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->>'source_revision'<>'9007199254740993' THEN RAISE EXCEPTION 'initial grant/precision failed %',r; END IF;
 IF NOT public.scanner_staff_access_allowed('scanner-authz-fixture',a) THEN RAISE EXCEPTION 'valid staff denied'; END IF;
 IF public.scanner_staff_access_allowed('scanner-authz-fixture',b) THEN RAISE EXCEPTION 'cross org staff allowed'; END IF;
 r:=public.apply_hub_role_projection(u,a,ARRAY['lager'],'9007199254740994','{"planering":true,"lager":false}');
 IF r->>'ok' IS DISTINCT FROM 'true' OR public.scanner_staff_access_allowed('scanner-authz-fixture',a) THEN RAISE EXCEPTION 'partial module revoke failed'; END IF;
 r:=public.apply_hub_role_projection(u,a,ARRAY['lager'],'9007199254740993','{"planering":true,"lager":true}');
 IF r->>'error'<>'STALE_SOURCE_REVISION' THEN RAISE EXCEPTION 'stale gate grant accepted'; END IF;
 r:=public.apply_hub_role_projection(u,a,ARRAY['lager'],'9007199254740994','{"planering":true,"lager":true}');
 IF r->>'error'<>'SOURCE_REVISION_CONFLICT' THEN RAISE EXCEPTION 'equal conflicting gate accepted'; END IF;
 r:=public.apply_hub_role_projection(u,a,ARRAY['lager'],'9007199254740995');
 IF r->>'error'<>'MODULE_ACCESS_REQUIRED' THEN RAISE EXCEPTION 'old RPC bypass'; END IF;
 r:=public.apply_hub_role_projection(u,b,ARRAY['lager'],'1','{"planering":false,"lager":true}');
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'org B setup failed'; END IF;
 r:=public.apply_hub_role_projection(u,a,ARRAY[]::text[],'9007199254740995','{"planering":false,"lager":false}');
 IF r->>'ok' IS DISTINCT FROM 'true' OR public.scanner_staff_access_allowed('scanner-authz-fixture',a) THEN RAISE EXCEPTION 'full revoke failed'; END IF;
 IF NOT public.hub_module_access_allowed(u,b,'lager') THEN RAISE EXCEPTION 'other org altered'; END IF;
 IF public.has_planning_access(u) THEN RAISE EXCEPTION 'global other org role supplied planning'; END IF;
 BEGIN DELETE FROM hub_projection_private.scanner_staff_bindings WHERE staff_id='scanner-authz-fixture'; RAISE EXCEPTION 'binding delete permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 BEGIN UPDATE public.staff_members SET user_id=null WHERE id='scanner-authz-fixture'; RAISE EXCEPTION 'linked staff became standalone'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cdb30000-0000-4000-8000-000000000001',true);
DO $test$ BEGIN
 BEGIN PERFORM public.hub_module_access_allowed('cdb30000-0000-4000-8000-000000000001','cdb30000-0000-4000-8000-000000000011','lager'); RAISE EXCEPTION 'client gate RPC exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.user_roles(user_id,organization_id,role) VALUES('cdb30000-0000-4000-8000-000000000001','cdb30000-0000-4000-8000-000000000011','admin'); RAISE EXCEPTION 'client self grant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id='cdb30000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'revoked selected org retained role reads'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: live Scanner module gates, identity and client isolation; all fixtures rolled back' result;
