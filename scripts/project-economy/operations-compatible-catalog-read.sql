-- TEST ONLY selected readonly metadata. No source bodies, config values, secrets or tenant rows are emitted.
-- This selected-scope inventory is NOT a complete certificate or source admission.
begin isolation level repeatable read read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
set local search_path=pg_catalog;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('server_version_num')<>'150019'
 or current_setting('server_encoding')<>'UTF8'
 or current_setting('transaction_read_only')<>'on'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_compatible_read_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or current_setting('eventflow.compatible_catalog_isolated',true) is distinct from 'synthetic-disposable'
 or to_regclass('operations_compatible_catalog_native.fixture') is null
 or (select count(*) from operations_compatible_catalog_native.fixture)<>1
 or not exists(select 1 from operations_compatible_catalog_native.fixture where purpose='selected_metadata_only' and full_certificate=false)
 or to_regclass('operations_scope_compatible_read_native.requests') is null
 or (select count(*) from operations_scope_compatible_read_native.requests)<>2
 or to_regprocedure('public.read_operations_scope_invoice_capture_admin_v1(jsonb)') is null
 or to_regprocedure('public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)') is null
 or to_regprocedure('operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)') is null
 or to_regprocedure('operations_economy_private.read_scope_invoice_capture_admin_compatible_v1(jsonb)') is null
 then raise exception 'exact_disposable_candidate_catalog_required' using errcode='22023';end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','extensions') or n.nspname like 'operations\_%' escape '\')>4096
 then raise exception 'complete_selected_catalog_limit' using errcode='22023';end if;
end;$$;
with catalog as (
 select n.nspname schema_name,p.proname function_name,pg_get_function_identity_arguments(p.oid) identity_arguments,
 pg_get_function_result(p.oid) result_type,l.lanname language_name,r.rolname owner_name,p.prokind::text routine_kind,
 p.prosecdef security_definer,
 (select count(*)=1 and bool_and(config.entry='search_path=""')
 from unnest(coalesce(p.proconfig,array[]::text[])) config(entry) where config.entry like 'search_path=%') empty_search_path,
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') source_sha256,
 encode(sha256(convert_to(coalesce(p.proacl,acldefault('f',p.proowner))::text,'UTF8')),'hex') acl_sha256,
 has_schema_privilege('anon',n.oid,'USAGE') anon_schema_usage,
 has_schema_privilege('authenticated',n.oid,'USAGE') authenticated_schema_usage,
 has_schema_privilege('service_role',n.oid,'USAGE') service_role_schema_usage,
 encode(sha256(convert_to(coalesce(to_jsonb(p.proconfig),'null'::jsonb)::text,'UTF8')),'hex') config_sha256,
 coalesce((select jsonb_agg(e.extname order by e.extname) from pg_depend d join pg_extension e on e.oid=d.refobjid
 where d.classid='pg_proc'::regclass and d.objid=p.oid and d.refclassid='pg_extension'::regclass and d.deptype='e'),'[]'::jsonb) extension_membership,
 exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang join pg_roles r on r.oid=p.proowner
 where n.nspname in ('public','auth','extensions') or n.nspname like 'operations\_%' escape '\'
), schemas as (
 select n.nspname schema_name,r.rolname owner_name,
 encode(sha256(convert_to(coalesce(n.nspacl,acldefault('n',n.nspowner))::text,'UTF8')),'hex') acl_sha256,
 exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type='USAGE') public_usage,
 exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type='CREATE') public_create,
 has_schema_privilege('anon',n.oid,'USAGE') anon_usage,
 has_schema_privilege('authenticated',n.oid,'USAGE') authenticated_usage,
 has_schema_privilege('service_role',n.oid,'USAGE') service_role_usage
 from pg_namespace n join pg_roles r on r.oid=n.nspowner
 where n.nspname in ('public','auth','extensions') or n.nspname like 'operations\_%' escape '\'
), document as (
 select jsonb_build_object('schema','operations-compatible-catalog-selected.v1',
 'selected_scope',true,'full_certificate',false,
 'unresolved_gates',jsonb_build_array('outside_schema_and_role_graph','generated_provenance','dynamic_dispatch','extension_dispatch','hosted_candidate_catalog'),
 'purpose','disposable_metadata_inventory_not_authority','database',current_database(),
 'transaction_isolation',current_setting('transaction_isolation'),'transaction_read_only',current_setting('transaction_read_only')='on',
 'scope','public_auth_extensions_operations_namespaces','omitted_scope','pg_catalog_and_other_namespaces',
 'installed_schema_count',(select count(*) from schemas),
 'schemas',(select coalesce(jsonb_agg(to_jsonb(schemas) order by schema_name collate "C"),'[]'::jsonb) from schemas),
 'installed_function_count',count(*),'functions',coalesce(jsonb_agg(to_jsonb(catalog) order by schema_name collate "C",function_name collate "C",identity_arguments collate "C"),'[]'::jsonb)) data
 from catalog
)
-- Overflow returns a closed incomplete marker, never a truncated catalog or positive certificate.
select case when octet_length(convert_to(data::text,'UTF8'))<=8388608 then data
 else jsonb_build_object('schema','operations-compatible-catalog-selected-incomplete.v1',
 'inventory_state','incomplete','reason','selected_catalog_byte_limit') end from document;
rollback;
