-- ONE SELECT, fixed pg_catalog descriptors only. No tenant records, bodies, DDL or helper invocation.
-- Parent independently verifies the current hosted project. Metadata is baseline-only.
with tables(schema_name,table_name) as (
 values ('public'::pg_catalog.text,'profiles'::pg_catalog.text),('public','user_roles'),('auth','users')
), fields(schema_name,table_name,column_name) as (
 values ('public'::pg_catalog.text,'profiles'::pg_catalog.text,'user_id'::pg_catalog.text),('public','profiles','organization_id'),
 ('public','user_roles','user_id'),('public','user_roles','role'),('public','user_roles','organization_id'),('auth','users','id')
), owner_role as (
 select 'postgres'::pg_catalog.text declared_expected_owner_role,r.oid role_oid from (values(1)) seed(x)
 left join pg_catalog.pg_roles r on r.rolname='postgres'
), relations as (
 select t.schema_name,t.table_name,c.oid relation_oid,c.oid is not null present,c.relkind::pg_catalog.text relation_kind,
 r.rolname::pg_catalog.text relation_owner
 from tables t left join pg_catalog.pg_namespace n on n.nspname::pg_catalog.text=t.schema_name
 left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname::pg_catalog.text=t.table_name
 left join pg_catalog.pg_roles r on r.oid=c.relowner
), guards as (
 select pg_catalog.current_setting('server_version_num')='150008'
 and pg_catalog.current_setting('server_encoding')='UTF8'
 and (select role_oid is not null from owner_role)
 and not exists(select 1 from pg_catalog.pg_namespace n where n.nspname::pg_catalog.text in (
 'operations_economy_private','operations_invoice_private','operations_whole_scope_publication_private'))
 and not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname::pg_catalog.text in (
 'read_operations_scope_invoice_kernel_evidence_v1','read_operations_scope_invoice_capture_admin_v1','publish_operations_whole_scope_product_v1')) expected_baseline
), columns as (
 select f.schema_name,f.table_name,f.column_name,a.attnum,a.attnum is not null present,a.attnotnull not_null,
 tn.nspname::pg_catalog.text type_schema,tp.typname::pg_catalog.text type_name
 from fields f left join relations r on r.schema_name=f.schema_name and r.table_name=f.table_name
 left join pg_catalog.pg_attribute a on a.attrelid=r.relation_oid and a.attname::pg_catalog.text=f.column_name and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_type tp on tp.oid=a.atttypid left join pg_catalog.pg_namespace tn on tn.oid=tp.typnamespace
), selected_indices as (
 select r.schema_name,r.table_name,i.*,ic.relname::pg_catalog.text index_name,ins.nspname::pg_catalog.text index_schema
 from relations r join pg_catalog.pg_index i on i.indrelid=r.relation_oid
 join pg_catalog.pg_class ic on ic.oid=i.indexrelid join pg_catalog.pg_namespace ins on ins.oid=ic.relnamespace
), selected_constraints as (
 select r.schema_name,r.table_name,c.* from relations r join pg_catalog.pg_constraint c on c.conrelid=r.relation_oid where c.contype in ('p','u','f')
), limits as (
 select (select pg_catalog.count(*) from selected_indices)<=64 and (select pg_catalog.count(*) from selected_constraints)<=64 within_limit
), index_metadata as (
 select i.schema_name,i.table_name,i.index_schema,i.index_name,
 i.indisunique unique_index,i.indisprimary primary_index,i.indisvalid valid_index,i.indisready ready_index,
 i.indnkeyatts key_attribute_count,i.indnatts all_attribute_count,i.indpred is null no_predicate,i.indexprs is null no_expressions,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(pg_catalog.to_jsonb(i.indpred),'null'::pg_catalog.jsonb)::pg_catalog.text,'UTF8')),'hex') predicate_sha256,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(pg_catalog.to_jsonb(i.indexprs),'null'::pg_catalog.jsonb)::pg_catalog.text,'UTF8')),'hex') expressions_sha256,
 coalesce((select pg_catalog.jsonb_agg(a.attname::pg_catalog.text order by k.ordinality)
 from pg_catalog.unnest(i.indkey) with ordinality k(attnum,ordinality)
 left join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum),'[]'::pg_catalog.jsonb) all_attributes
 from selected_indices i cross join guards g cross join limits lim where g.expected_baseline and lim.within_limit
), constraint_metadata as (
 select c.schema_name,c.table_name,c.conname::pg_catalog.text constraint_name,c.contype::pg_catalog.text constraint_kind,
 c.convalidated validated,c.condeferrable deferrable,c.condeferred initially_deferred,c.confdeltype::pg_catalog.text delete_action,c.confupdtype::pg_catalog.text update_action,
 coalesce((select pg_catalog.jsonb_agg(a.attname::pg_catalog.text order by k.ordinality)
 from pg_catalog.unnest(c.conkey) with ordinality k(attnum,ordinality)
 left join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum),'[]'::pg_catalog.jsonb) source_attributes,
 rn.nspname::pg_catalog.text target_schema,rc.relname::pg_catalog.text target_table,
 coalesce((select pg_catalog.jsonb_agg(a.attname::pg_catalog.text order by k.ordinality)
 from pg_catalog.unnest(c.confkey) with ordinality k(attnum,ordinality)
 left join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum),'[]'::pg_catalog.jsonb) target_attributes
 from selected_constraints c left join pg_catalog.pg_class rc on rc.oid=c.confrelid left join pg_catalog.pg_namespace rn on rn.oid=rc.relnamespace
 cross join guards g cross join limits lim where g.expected_baseline and lim.within_limit
), observations as (
 select
 exists(select 1 from selected_indices i where i.schema_name='public' and i.table_name='profiles' and i.indisunique and i.indisvalid
 and i.indpred is null and i.indexprs is null and i.indnkeyatts=1
 and i.indkey[0]=(select attnum from columns where schema_name='public' and table_name='profiles' and column_name='user_id')) profiles_user_id_unique,
 exists(select 1 from selected_indices i where i.schema_name='public' and i.table_name='user_roles' and i.index_schema='public'
 and i.index_name='user_roles_user_role_org_key' and i.indisunique and i.indisvalid and i.indpred is null and i.indexprs is null and i.indnkeyatts=3
 and (select pg_catalog.array_agg(a.attname::pg_catalog.text order by k.ordinality)
 from pg_catalog.unnest(i.indkey) with ordinality k(attnum,ordinality) join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum)=array['user_id','role','organization_id']::pg_catalog.text[]) user_role_org_named_unique,
 exists(select 1 from selected_constraints c where c.schema_name='public' and c.table_name='user_roles' and c.contype='f'
 and c.confrelid=(select relation_oid from relations where schema_name='auth' and table_name='users')
 and c.confdeltype='c' and c.convalidated
 and c.conkey=array[(select attnum from columns where schema_name='public' and table_name='user_roles' and column_name='user_id')]::pg_catalog.int2[]
 and c.confkey=array[(select attnum from columns where schema_name='auth' and table_name='users' and column_name='id')]::pg_catalog.int2[]) user_id_fk_auth_id_validated_cascade,
 (select pg_catalog.has_schema_privilege(o.role_oid,n.oid,'USAGE') from owner_role o left join pg_catalog.pg_namespace n on n.nspname='auth') declared_owner_auth_schema_usage,
 (select pg_catalog.has_function_privilege(o.role_oid,p.oid,'EXECUTE') from owner_role o
 left join pg_catalog.pg_namespace n on n.nspname='auth'
 left join pg_catalog.pg_proc p on p.pronamespace=n.oid and p.proname='uid' and p.pronargs=0 and p.prokind='f' and p.prorettype='pg_catalog.uuid'::pg_catalog.regtype) declared_owner_auth_uid_execute
), document as (
 select pg_catalog.jsonb_build_object('schema','operations-compatible-hosted-prerequisite-metadata.v1',
 'state',case when not g.expected_baseline then 'unavailable' when not lim.within_limit then 'unavailable' else 'baseline_descriptors' end,
 'reason',case when not g.expected_baseline then 'expected_hosted_baseline_not_verified' when not lim.within_limit then 'selected_catalog_limit' else null end,
 'baseline_only',true,'full_certificate',false,'candidate_admission',false,'external_project_identity_required',true,
 'expected_server_version_num','150008','declared_expected_owner_role',(select declared_expected_owner_role from owner_role),
 'owner_declaration_is_installer_proof',false,
 'scope','profiles_user_roles_auth_users_fixed_catalog_descriptors',
 'unresolved_gates',pg_catalog.jsonb_build_array('external_project_identity','actual_candidate_installer_and_owner_chain','provider_jwt_and_rls','wider_role_and_caller_graph','candidate_installation_and_release'),
 'observed_predicates',case when g.expected_baseline and lim.within_limit then (select pg_catalog.to_jsonb(o) from observations o) else null end,
 'relations',case when g.expected_baseline and lim.within_limit then (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)-'relation_oid' order by r.schema_name collate "C",r.table_name collate "C") from relations r) else '[]'::pg_catalog.jsonb end,
 'columns',case when g.expected_baseline and lim.within_limit then (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)-'attnum' order by c.schema_name collate "C",c.table_name collate "C",c.column_name collate "C") from columns c) else '[]'::pg_catalog.jsonb end,
 'indices',case when g.expected_baseline and lim.within_limit then (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) order by i.schema_name collate "C",i.table_name collate "C",i.index_name collate "C"),'[]'::pg_catalog.jsonb) from index_metadata i) else '[]'::pg_catalog.jsonb end,
 'constraints',case when g.expected_baseline and lim.within_limit then (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.schema_name collate "C",c.table_name collate "C",c.constraint_name collate "C"),'[]'::pg_catalog.jsonb) from constraint_metadata c) else '[]'::pg_catalog.jsonb end) data
 from guards g cross join limits lim
)
select case when pg_catalog.octet_length(pg_catalog.convert_to(data::pg_catalog.text,'UTF8'))<=131072 then data
 else pg_catalog.jsonb_build_object('schema','operations-compatible-hosted-prerequisite-metadata.v1',
 'state','unavailable','reason','selected_metadata_byte_limit','baseline_only',true,'full_certificate',false,'candidate_admission',false,
 'external_project_identity_required',true,'owner_declaration_is_installer_proof',false)
 end metadata from document;
