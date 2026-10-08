\set ON_ERROR_STOP on
-- Disposable TEST schema ONLY. Not a product alias RPC or cost authority.
begin;
do $$begin
 if current_database() !~ '^eventflow_scope_alias_[a-z0-9_]+$' or current_setting('eventflow.scope_alias_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('operations_scope_alias_native.controls') is null
 or to_regprocedure('operations_scope_alias_native.capture(text,uuid)') is not null
 or (select count(*) from operations_scope_alias_native.controls)<>1
 or not exists(select 1 from operations_scope_alias_native.controls where slot='only' and canonical_scope_id='90909090-9090-4909-8909-909090909090' and project_view_id='55555555-5555-4555-8555-555555555555' and packing_view_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
 or (select count(*) from public.operations_project_scope_heads)<>1 or (select count(*) from public.operations_project_scope_snapshots)<>1
 then raise exception 'Dedicated initialized scope alias database required' using errcode='22023';end if;
end;$$;
create function operations_scope_alias_native.capture(p_view_kind text,p_view_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;scope_id uuid;h public.operations_project_scope_heads%rowtype;selector record;result jsonb;
begin
 if current_database() !~ '^eventflow_scope_alias_[a-z0-9_]+$' or current_setting('eventflow.scope_alias_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' then raise exception 'Disposable alias test database required' using errcode='42501';end if;
 if p_view_kind is null or p_view_kind not in ('project','large_project','packing_project') or p_view_id is null then raise exception 'Invalid native alias root' using errcode='22023';end if;
 org:=operations_economy_private.authorize_scope_admin_v1();
 select canonical_scope_id into strict scope_id from operations_scope_alias_native.controls where slot='only';
 -- Same barrier as real canonical enrollment; no financial barrier or price read.
 perform pg_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org::text,0));
 select * into h from public.operations_project_scope_heads where organization_id=org and economic_scope_id=scope_id for share;
 if not found or h.current_revision<1 then raise exception 'native_scope_canonical_head_required' using errcode='42501';end if;
 for selector in select kind,id from (values(h.root_kind,h.root_id),(p_view_kind,p_view_id)) as roots(kind,id) group by kind,id order by kind collate "C",id loop
  if selector.kind='project' then perform 1 from public.projects where id=selector.id and organization_id=org and deleted_at is null for share;
  elsif selector.kind='large_project' then perform 1 from public.large_projects where id=selector.id and organization_id=org and deleted_at is null for share;
  else perform 1 from public.packing_projects where id=selector.id and organization_id=org for share;end if;
  if not found then raise exception 'native_scope_view_root_denied' using errcode='42501';end if;
  if selector.kind='packing_project' then
   perform 1 from public.operations_project_scope_packing_policies policy join public.packing_projects p on p.id=selector.id and p.organization_id=org and p.status=policy.status where policy.organization_id=org and policy.enabled for share of policy;
   if not found then raise exception 'native_scope_view_policy_denied' using errcode='42501';end if;
  end if;
 end loop;
 -- Context, BOTH root selectors, all catalog rows, view canonical head and
 -- current saved member owners below are read by ONE coherent SQL statement.
 -- Existing source joins are NOT locked: legacy non-barrier writes can commit.
 with chosen as materialized (
  select s.organization_id,s.economic_scope_id,s.root_kind,s.root_id,s.current_revision,snap.membership,snap.membership_fingerprint
  from public.operations_project_scope_heads s join public.operations_project_scope_snapshots snap on snap.organization_id=s.organization_id and snap.economic_scope_id=s.economic_scope_id and snap.scope_revision=s.current_revision
  where s.organization_id=org and s.economic_scope_id=scope_id
 ), roots as materialized(select root_kind as kind,root_id as id from chosen union select p_view_kind,p_view_id),
 root_bookings as materialized (
  select p.booking_id from public.projects p join roots r on r.kind='project' and r.id=p.id where p.booking_id is not null
  union select j.booking_id from public.large_project_bookings j join roots r on r.kind='large_project' and r.id=j.large_project_id
  union select p.booking_id from public.packing_projects p join roots r on r.kind='packing_project' and r.id=p.id where p.booking_id is not null
  union select j.booking_id from public.packing_project_bookings j join roots r on r.kind='packing_project' and r.id=j.packing_id
 ), large_joins as materialized(select j.* from public.large_project_bookings j where j.booking_id in(select booking_id from root_bookings) or j.large_project_id in(select id from roots where kind='large_project')),
 large_ids as materialized(select large_project_id as id from large_joins union select id from roots where kind='large_project' union select p.large_project_id from public.packing_projects p join roots r on r.kind='packing_project' and r.id=p.id where p.large_project_id is not null),
 saved_members as materialized (
  select 'source_project'::text as kind,value#>>'{}' as id from chosen,jsonb_array_elements(membership->'source_project_ids')
  union all select 'local_booking',value#>>'{}' from chosen,jsonb_array_elements(membership->'local_booking_ids')
 )
 select jsonb_build_object('schema_version','operations-scope-alias-native-capture.v1',
  'context',jsonb_build_object('organization_id',c.organization_id,'economic_scope_id',c.economic_scope_id,'canonical_root_kind',c.root_kind,'canonical_root_id',c.root_id,'canonical_scope_revision',c.current_revision,'canonical_membership_fingerprint',c.membership_fingerprint),
  'view_root_kind',p_view_kind,'view_root_id',p_view_id,
  'view_canonical_scope_id',(select economic_scope_id from public.operations_project_scope_heads where organization_id=org and root_kind=p_view_kind and root_id=p_view_id),
  'catalog',jsonb_build_object(
   'projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'booking_id',booking_id,'deleted_at',deleted_at)) from public.projects where booking_id in(select booking_id from root_bookings) or id in(select id from roots where kind='project')),'[]'::jsonb),
   'large_projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'primary_booking_id',primary_booking_id,'deleted_at',deleted_at)) from public.large_projects where id in(select id from large_ids)),'[]'::jsonb),
   'packing_projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'booking_id',booking_id,'large_project_id',large_project_id,'status',status)) from public.packing_projects where id in(select id from roots where kind='packing_project')),'[]'::jsonb),
   'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'large_project_id',large_project_id)) from public.bookings where id in(select booking_id from root_bookings) or large_project_id in(select id from roots where kind='large_project')),'[]'::jsonb),
   'large_project_bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'large_project_id',large_project_id,'booking_id',booking_id)) from large_joins),'[]'::jsonb),
   'packing_project_bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'packing_id',packing_id,'booking_id',booking_id)) from public.packing_project_bookings where packing_id in(select id from roots where kind='packing_project')),'[]'::jsonb),
   'allowed_packing_statuses',coalesce((select jsonb_agg(status) from public.operations_project_scope_packing_policies where organization_id=org and enabled),'[]'::jsonb)),
  'member_owners',coalesce((select jsonb_agg(jsonb_build_object('organization_id',o.organization_id,'member_kind',o.member_kind,'member_id',o.member_id,'economic_scope_id',o.economic_scope_id,'first_scope_revision',o.first_scope_revision)) from public.operations_project_scope_member_ownership o join saved_members m on m.kind=o.member_kind and m.id=o.member_id where o.organization_id=c.organization_id),'[]'::jsonb)
 ) into result from chosen c;
 if result is null then raise exception 'native_scope_snapshot_required' using errcode='22023';end if;
 if result->>'view_canonical_scope_id' is not null and result->>'view_canonical_scope_id'<>scope_id::text then raise exception 'native_view_canonical_scope_conflict' using errcode='23505';end if;
 if exists(select 1 from jsonb_each(result->'catalog') where jsonb_array_length(value)>10000) or jsonb_array_length(result->'member_owners')>2000 then raise exception 'native_alias_capture_limit' using errcode='22023';end if;
 if pg_column_size(result)>1048576 then raise exception 'native_alias_capture_byte_limit' using errcode='22023';end if;
 return result;
end;$$;
revoke all on function operations_scope_alias_native.capture(text,uuid) from public,anon,authenticated,service_role;
grant usage on schema operations_scope_alias_native to authenticated;
grant execute on function operations_scope_alias_native.capture(text,uuid) to authenticated;
commit;
\echo operations-scope-view-alias-native-capture PASS
