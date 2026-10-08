-- ONE SELECT ONLY: parent must independently verify exact Lovable project/status.
-- Hosted PostgreSQL 15.8 baseline metadata adjunct. Never candidate admission.
-- No DDL, SET, transaction command, table data, definition/config body or unknown dispatch.
with expected_roles(role_name) as (
 values ('anon'::pg_catalog.text),('authenticated'),('service_role')
), role_ids as (
 select e.role_name,r.oid role_oid from expected_roles e
 left join pg_catalog.pg_roles r on r.rolname::pg_catalog.text=e.role_name
), expected_schemas(schema_name) as (
 values ('public'::pg_catalog.text),('auth'),('extensions'),
 ('operations_economy_private'),('operations_invoice_private'),('operations_whole_scope_publication_private')
), targets(schema_name,function_name) as (
 values ('auth'::pg_catalog.text,'uid'::pg_catalog.text),
 ('public','has_role'),('public','get_user_organization_id'),
 ('public','read_operations_scope_invoice_kernel_evidence_v1'),
 ('public','read_operations_scope_invoice_capture_admin_v1'),
 ('public','publish_operations_whole_scope_product_v1'),
 ('operations_economy_private','read_scope_invoice_kernel_v1'),
 ('operations_economy_private','read_scope_invoice_capture_admin_v1'),
 ('operations_economy_private','read_scope_invoice_kernel_compatible_v1'),
 ('operations_economy_private','read_scope_invoice_capture_admin_compatible_v1'),
 ('operations_economy_private','prepare_scope_invoice_read_v1'),
 ('operations_whole_scope_publication_private','publish_v1')
), guards as (
 select pg_catalog.current_setting('server_version_num')='150008'
 and pg_catalog.current_setting('server_encoding')='UTF8'
 and (select pg_catalog.count(*) from role_ids where role_oid is not null)=3
 and not exists(select 1 from pg_catalog.pg_namespace n where n.nspname::pg_catalog.text in (
 'operations_economy_private','operations_invoice_private','operations_whole_scope_publication_private'))
 and not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname::pg_catalog.text in (
 'read_operations_scope_invoice_kernel_evidence_v1','read_operations_scope_invoice_capture_admin_v1','publish_operations_whole_scope_product_v1')) expected_baseline
), selected as (
 select p.oid,n.oid namespace_oid,n.nspname::pg_catalog.text schema_name,p.proname::pg_catalog.text function_name
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 join targets t on t.schema_name=n.nspname::pg_catalog.text and t.function_name=p.proname::pg_catalog.text
), limits as (
 select pg_catalog.count(*)<=64 within_limit from selected
), routines as (
 select s.schema_name,s.function_name,
 pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
 pg_catalog.pg_get_function_result(p.oid) result_type,
 l.lanname::pg_catalog.text language_name,o.rolname::pg_catalog.text owner_name,p.prokind::pg_catalog.text routine_kind,
 p.prosecdef security_definer,
 (select pg_catalog.count(*)=1 and pg_catalog.bool_and(c.entry='search_path=""')
 from pg_catalog.unnest(coalesce(p.proconfig,array[]::pg_catalog.text[])) c(entry)
 where c.entry like 'search_path=%') empty_search_path,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') source_sha256,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))::pg_catalog.text,'UTF8')),'hex') acl_sha256,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(pg_catalog.to_jsonb(p.proconfig),'null'::pg_catalog.jsonb)::pg_catalog.text,'UTF8')),'hex') config_sha256,
 coalesce((select pg_catalog.jsonb_agg(e.extname order by e.extname)
 from pg_catalog.pg_depend d join pg_catalog.pg_extension e on e.oid=d.refobjid
 where d.classid='pg_catalog.pg_proc'::pg_catalog.regclass and d.objid=p.oid
 and d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass and d.deptype='e'),'[]'::pg_catalog.jsonb) extension_membership,
 exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute,
 pg_catalog.has_function_privilege((select role_oid from role_ids where role_name='anon'),p.oid,'EXECUTE') anon_execute,
 pg_catalog.has_function_privilege((select role_oid from role_ids where role_name='authenticated'),p.oid,'EXECUTE') authenticated_execute,
 pg_catalog.has_function_privilege((select role_oid from role_ids where role_name='service_role'),p.oid,'EXECUTE') service_role_execute
 from selected s join pg_catalog.pg_proc p on p.oid=s.oid
 join pg_catalog.pg_language l on l.oid=p.prolang join pg_catalog.pg_roles o on o.oid=p.proowner
 cross join guards g cross join limits lim where g.expected_baseline and lim.within_limit
), namespaces as (
 select e.schema_name,n.oid is not null present,o.rolname::pg_catalog.text owner_name,
 case when n.oid is not null then pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))::pg_catalog.text,'UTF8')),'hex') end acl_sha256,
 case when n.oid is not null then exists(select 1 from pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type='USAGE') end public_usage,
 case when n.oid is not null then exists(select 1 from pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type='CREATE') end public_create,
 case when n.oid is not null then pg_catalog.has_schema_privilege((select role_oid from role_ids where role_name='anon'),n.oid,'USAGE') end anon_usage,
 case when n.oid is not null then pg_catalog.has_schema_privilege((select role_oid from role_ids where role_name='authenticated'),n.oid,'USAGE') end authenticated_usage,
 case when n.oid is not null then pg_catalog.has_schema_privilege((select role_oid from role_ids where role_name='service_role'),n.oid,'USAGE') end service_role_usage
 from expected_schemas e left join pg_catalog.pg_namespace n on n.nspname::pg_catalog.text=e.schema_name
 left join pg_catalog.pg_roles o on o.oid=n.nspowner
 cross join guards g cross join limits lim where g.expected_baseline and lim.within_limit
), function_targets as (
 select t.schema_name,t.function_name,
 (select pg_catalog.count(*) from routines r where r.schema_name=t.schema_name and r.function_name=t.function_name) overload_count,
 coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.identity_arguments collate "C")
 from routines r where r.schema_name=t.schema_name and r.function_name=t.function_name),'[]'::pg_catalog.jsonb) overloads
 from targets t
), document as (
 select pg_catalog.jsonb_build_object(
 'schema','operations-compatible-catalog-hosted-baseline.v1',
 'state',case when g.expected_baseline and lim.within_limit then 'baseline_metadata' else 'unavailable' end,
 'reason',case when not g.expected_baseline then 'expected_hosted_baseline_not_verified' when not lim.within_limit then 'selected_routine_limit' else null end,
 'baseline_only',true,'full_certificate',false,'candidate_admission',false,
 'external_project_identity_required',true,'expected_server_version_num','150008',
 'scope','explicit_named_targets_only','unresolved_gates',pg_catalog.jsonb_build_array(
 'external_project_identity','other_installed_functions','outside_schema_and_role_graph','dynamic_dispatch','generated_provenance','extension_dispatch','candidate_catalog_and_native_release'),
 'schemas',case when g.expected_baseline and lim.within_limit then (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(n) order by n.schema_name collate "C") from namespaces n) else '[]'::pg_catalog.jsonb end,
 'function_targets',case when g.expected_baseline and lim.within_limit then (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.schema_name collate "C",t.function_name collate "C") from function_targets t) else '[]'::pg_catalog.jsonb end) data
 from guards g cross join limits lim
)
select case when pg_catalog.octet_length(pg_catalog.convert_to(data::pg_catalog.text,'UTF8'))<=131072 then data
 else pg_catalog.jsonb_build_object('schema','operations-compatible-catalog-hosted-baseline.v1',
 'state','unavailable','reason','selected_metadata_byte_limit','baseline_only',true,
 'full_certificate',false,'candidate_admission',false,'external_project_identity_required',true)
 end metadata from document;
