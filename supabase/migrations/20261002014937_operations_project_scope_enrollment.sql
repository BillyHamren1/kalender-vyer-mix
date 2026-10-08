-- Shadow membership only. Does not activate forecast/revenue mapping, change
-- public project IDs, or transfer saved personnel/invoice allocations.
create table public.operations_project_scope_heads (
 organization_id uuid not null,economic_scope_id uuid not null,root_kind text not null check(root_kind in ('project','large_project','packing_project')),
 root_id uuid not null,current_revision bigint not null default 0 check(current_revision between 0 and 9007199254740991),
 primary key(organization_id,economic_scope_id),unique(organization_id,root_kind,root_id)
);
create table public.operations_project_scope_snapshots (
 snapshot_id uuid primary key default gen_random_uuid(),organization_id uuid not null,economic_scope_id uuid not null,
 scope_revision bigint not null check(scope_revision between 1 and 9007199254740991),membership jsonb not null,membership_raw text not null,
 membership_fingerprint text not null check(membership_fingerprint~'^[0-9a-f]{64}$'),actor_system_user_id uuid not null,
 reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 integration_state text not null default 'membership_only' check(integration_state='membership_only'),shadow_only boolean not null default true check(shadow_only),
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id),
 unique(organization_id,economic_scope_id,scope_revision),unique(organization_id,idempotency_key)
);
-- Permanent reservations in v1. Removal from a later snapshot does not silently
-- release ownership; reassignment needs a future explicit transfer lineage.
create table public.operations_project_scope_member_ownership (
 organization_id uuid not null,member_kind text not null check(member_kind in ('source_project','local_booking')),member_id text not null,
 economic_scope_id uuid not null,first_scope_revision bigint not null,primary key(organization_id,member_kind,member_id),
 foreign key(organization_id,economic_scope_id,first_scope_revision) references public.operations_project_scope_snapshots(organization_id,economic_scope_id,scope_revision)
);
create table public.operations_project_scope_packing_policies (
 organization_id uuid not null,status text not null check(length(status) between 1 and 64 and btrim(status)=status),
 enabled boolean not null default false,primary key(organization_id,status)
);
alter table public.operations_project_scope_heads enable row level security;
alter table public.operations_project_scope_snapshots enable row level security;
alter table public.operations_project_scope_member_ownership enable row level security;
alter table public.operations_project_scope_packing_policies enable row level security;
revoke all on public.operations_project_scope_heads,public.operations_project_scope_snapshots,public.operations_project_scope_member_ownership,public.operations_project_scope_packing_policies from public,anon,authenticated,service_role;
grant select on public.operations_project_scope_heads,public.operations_project_scope_snapshots,public.operations_project_scope_member_ownership to service_role;
grant select,insert,update,delete on public.operations_project_scope_packing_policies to service_role;
create trigger operations_scope_snapshots_immutable before update or delete on public.operations_project_scope_snapshots for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_snapshots_no_truncate before truncate on public.operations_project_scope_snapshots for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_ownership_immutable before update or delete on public.operations_project_scope_member_ownership for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_ownership_no_truncate before truncate on public.operations_project_scope_member_ownership for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.guard_scope_head_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'UPDATE' then raise exception 'scope_head_cannot_be_removed' using errcode='55000';end if;
 if row(new.organization_id,new.economic_scope_id,new.root_kind,new.root_id) is distinct from row(old.organization_id,old.economic_scope_id,old.root_kind,old.root_id) then raise exception 'scope_identity_immutable' using errcode='55000';end if;
 if new.current_revision=old.current_revision then return new;end if;
 if new.current_revision<>old.current_revision+1 or not exists(select 1 from public.operations_project_scope_snapshots where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id and scope_revision=new.current_revision) then raise exception 'scope_saved_head_required' using errcode='55000';end if;
 return new;
end;$$;
revoke all on function operations_economy_private.guard_scope_head_v1() from public,anon,authenticated,service_role;
create trigger operations_scope_head_guard before update or delete on public.operations_project_scope_heads for each row execute function operations_economy_private.guard_scope_head_v1();
create trigger operations_scope_head_no_truncate before truncate on public.operations_project_scope_heads for each statement execute function operations_economy_private.guard_scope_head_v1();

-- Match JS trim whitespace and Unicode scalar character bounds for legacy IDs.
create function operations_economy_private.scope_text_v1(p_value text,p_max int) returns boolean language sql immutable set search_path='' as $$
 select p_value is not null and length(p_value) between 1 and p_max and
 btrim(p_value,U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=p_value;
$$;
revoke all on function operations_economy_private.scope_text_v1(text,int) from public,anon,authenticated,service_role;

create function operations_economy_private.authorize_scope_admin_v1() returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_org uuid;
begin
 if v_actor is null then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 perform 1 from auth.users where id=v_actor for share;if not found then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 begin select organization_id into strict v_org from public.profiles where user_id=v_actor for share;
 exception when no_data_found or too_many_rows then raise exception 'unambiguous_scope_admin_profile_required' using errcode='42501';end;
 if v_org is null then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 perform 1 from public.user_roles where user_id=v_actor and organization_id=v_org and role='admin' for share;if not found then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 return v_org;
end;$$;
revoke all on function operations_economy_private.authorize_scope_admin_v1() from public,anon,authenticated,service_role;

-- ONE statement captures the entire relevant source graph. Derivation below
-- reads only that immutable local JSON catalog, never a mixed sequence of live
-- READ COMMITTED queries. This is as-of evidence, not perpetual currentness.
create function operations_economy_private.scope_membership_v1(p_org uuid,p_kind text,p_root uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_catalog jsonb;v_root_row jsonb;v_bookings text[]:='{}';v_projects uuid[]:='{}';v_relations jsonb:='[]';v_primary text;v_parent uuid;v_status text;v_row jsonb;v_parent_row jsonb;v_member text;
begin
 if p_org is null or p_root is null or p_kind is null or p_kind not in ('project','large_project','packing_project') then raise exception 'invalid_scope_root' using errcode='22023';end if;
 -- Lock the actual root and any policy authorizing packing. A revoke/update
 -- waits for this transaction, then future enrollment sees the changed rule.
 if p_kind='project' then perform 1 from public.projects where id=p_root and organization_id=p_org and deleted_at is null for share;
 elsif p_kind='large_project' then perform 1 from public.large_projects where id=p_root and organization_id=p_org and deleted_at is null for share;
 else perform 1 from public.packing_projects where id=p_root and organization_id=p_org for share;end if;
 if not found then raise exception 'scope_root_missing_or_foreign' using errcode='42501';end if;
 if p_kind='packing_project' then
  perform 1 from public.operations_project_scope_packing_policies policy join public.packing_projects packing on packing.id=p_root and packing.organization_id=p_org and packing.status=policy.status
   where policy.organization_id=p_org and policy.enabled for share of policy;
  if not found then raise exception 'scope_packing_missing_or_unenrolled' using errcode='42501';end if;
 end if;
 with root_bookings as (
  select booking_id from public.projects where p_kind='project' and id=p_root and booking_id is not null
  union select booking_id from public.large_project_bookings where p_kind='large_project' and large_project_id=p_root
  union select booking_id from public.packing_projects where p_kind='packing_project' and id=p_root and booking_id is not null
  union select booking_id from public.packing_project_bookings where p_kind='packing_project' and packing_id=p_root
 ), relevant_large_joins as (
  select j.* from public.large_project_bookings j where j.booking_id in(select booking_id from root_bookings) or (p_kind='large_project' and j.large_project_id=p_root)
 ), relevant_large_ids as (
  select large_project_id as id from relevant_large_joins union select p_root where p_kind='large_project'
  union select large_project_id from public.packing_projects where p_kind='packing_project' and id=p_root and large_project_id is not null
 )
 select jsonb_build_object(
  'projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'booking_id',booking_id,'deleted_at',deleted_at)) from public.projects where (p_kind='project' and id=p_root) or booking_id in(select booking_id from root_bookings)),'[]'::jsonb),
  'large_projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'primary_booking_id',primary_booking_id,'deleted_at',deleted_at)) from public.large_projects where id in(select id from relevant_large_ids)),'[]'::jsonb),
  'packing_projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'booking_id',booking_id,'large_project_id',large_project_id,'status',status)) from public.packing_projects where p_kind='packing_project' and id=p_root),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'large_project_id',large_project_id)) from public.bookings where id in(select booking_id from root_bookings) or (p_kind='large_project' and large_project_id=p_root)),'[]'::jsonb),
  'large_project_bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'large_project_id',large_project_id,'booking_id',booking_id)) from relevant_large_joins),'[]'::jsonb),
  'packing_project_bookings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'packing_id',packing_id,'booking_id',booking_id)) from public.packing_project_bookings where p_kind='packing_project' and packing_id=p_root),'[]'::jsonb),
  'allowed_packing_statuses',coalesce((select jsonb_agg(status) from public.operations_project_scope_packing_policies where organization_id=p_org and enabled),'[]'::jsonb)
 ) into v_catalog;
 if exists(select 1 from jsonb_each(v_catalog) where jsonb_array_length(value)>10000) then raise exception 'too_many_scope_catalog_rows' using errcode='22023';end if;
 if p_kind='project' then
  select value into v_root_row from jsonb_array_elements(v_catalog->'projects') where (value->>'id')::uuid=p_root;
  v_primary:=v_root_row->>'booking_id';v_projects:=array[p_root];
  if v_primary is not null then v_bookings:=array[v_primary];v_relations:=jsonb_build_array(jsonb_build_object('relation','project_booking','relation_id',p_root,'parent_id',p_root,'local_booking_id',v_primary));end if;
 elsif p_kind='large_project' then
  select value into v_root_row from jsonb_array_elements(v_catalog->'large_projects') where (value->>'id')::uuid=p_root;v_primary:=v_root_row->>'primary_booking_id';
  for v_row in select value from jsonb_array_elements(v_catalog->'large_project_bookings') where (value->>'large_project_id')::uuid=p_root loop
   if (v_row->>'organization_id')::uuid is distinct from p_org then raise exception 'scope_join_foreign' using errcode='42501';end if;
   v_bookings:=array_append(v_bookings,v_row->>'booking_id');v_relations:=v_relations||jsonb_build_array(jsonb_build_object('relation','large_project_booking','relation_id',v_row->'id','parent_id',p_root,'local_booking_id',v_row->'booking_id'));
  end loop;
  if v_primary is not null and not(v_primary=any(v_bookings)) then raise exception 'scope_primary_booking_not_member' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(v_catalog->'bookings') where (value->>'large_project_id')::uuid=p_root and not(value->>'id'=any(v_bookings))) then raise exception 'scope_legacy_mirror_without_master' using errcode='22023';end if;
 else
  select value into v_root_row from jsonb_array_elements(v_catalog->'packing_projects') where (value->>'id')::uuid=p_root;v_primary:=v_root_row->>'booking_id';v_status:=v_root_row->>'status';v_parent:=(v_root_row->>'large_project_id')::uuid;
  if not exists(select 1 from jsonb_array_elements(v_catalog->'allowed_packing_statuses') where value#>>'{}'=v_status) then raise exception 'scope_packing_missing_or_unenrolled' using errcode='42501';end if;
  for v_row in select value from jsonb_array_elements(v_catalog->'packing_project_bookings') loop
   if (v_row->>'organization_id')::uuid is distinct from p_org then raise exception 'scope_join_foreign' using errcode='42501';end if;
   v_bookings:=array_append(v_bookings,v_row->>'booking_id');v_relations:=v_relations||jsonb_build_array(jsonb_build_object('relation','packing_project_booking','relation_id',v_row->'id','parent_id',p_root,'local_booking_id',v_row->'booking_id'));
  end loop;
  if v_primary is not null then
   if cardinality(v_bookings)>0 and not(v_primary=any(v_bookings)) then raise exception 'scope_packing_direct_join_conflict' using errcode='22023';end if;
   if cardinality(v_bookings)=0 then v_bookings:=array[v_primary];v_relations:=jsonb_build_array(jsonb_build_object('relation','packing_direct_booking','relation_id',p_root,'parent_id',p_root,'local_booking_id',v_primary));end if;
  end if;
  if v_parent is not null then
   select value into v_parent_row from jsonb_array_elements(v_catalog->'large_projects') where (value->>'id')::uuid=v_parent;
   if v_parent_row is null or (v_parent_row->>'organization_id')::uuid is distinct from p_org or v_parent_row->>'deleted_at' is not null then raise exception 'scope_packing_parent_unavailable' using errcode='42501';end if;
   if exists(select 1 from unnest(v_bookings) b(id) where not exists(select 1 from jsonb_array_elements(v_catalog->'large_project_bookings') where (value->>'large_project_id')::uuid=v_parent and (value->>'organization_id')::uuid=p_org and value->>'booking_id'=b.id)) then raise exception 'scope_packing_booking_not_parent_member' using errcode='22023';end if;
  end if;
 end if;
 if v_root_row is null or (v_root_row->>'organization_id')::uuid is distinct from p_org or v_root_row->>'deleted_at' is not null then raise exception 'scope_root_missing_or_foreign' using errcode='42501';end if;
 if cardinality(v_bookings)>1000 or exists(select 1 from unnest(v_bookings) b(id) where not operations_economy_private.scope_text_v1(id,256)) then raise exception 'invalid_scope_booking_ids' using errcode='22023';end if;
 if cardinality(v_bookings)<>(select count(distinct id) from unnest(v_bookings) b(id)) then raise exception 'duplicate_scope_relationship' using errcode='22023';end if;
 for v_member in select unnest(v_bookings) loop
  select value into v_row from jsonb_array_elements(v_catalog->'bookings') where value->>'id'=v_member;
  if v_row is null or (v_row->>'organization_id')::uuid is distinct from p_org then raise exception 'scope_booking_missing_or_foreign' using errcode='42501';end if;
 end loop;
 for v_row in select value from jsonb_array_elements(v_catalog->'large_project_bookings') where value->>'booking_id'=any(v_bookings) loop
  select value into v_parent_row from jsonb_array_elements(v_catalog->'large_projects') where value->>'id'=v_row->>'large_project_id';
  if v_parent_row is null then raise exception 'scope_master_parent_missing' using errcode='22023';end if;
  if v_parent_row->>'deleted_at' is null then
   if (v_row->>'organization_id')::uuid is distinct from p_org or (v_parent_row->>'organization_id')::uuid is distinct from p_org then raise exception 'scope_master_parent_foreign' using errcode='42501';end if;
   if p_kind<>'large_project' then v_relations:=v_relations||jsonb_build_array(jsonb_build_object('relation','large_parent_booking','relation_id',v_row->'id','parent_id',v_row->'large_project_id','local_booking_id',v_row->'booking_id'));end if;
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(v_catalog->'large_project_bookings') j join jsonb_array_elements(v_catalog->'large_projects') lp on lp.value->>'id'=j.value->>'large_project_id' and lp.value->>'deleted_at' is null where j.value->>'booking_id'=any(v_bookings) group by j.value->>'booking_id',j.value->>'large_project_id' having count(*)>1) then raise exception 'duplicate_scope_relationship' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(v_catalog->'large_project_bookings') j join jsonb_array_elements(v_catalog->'large_projects') lp on lp.value->>'id'=j.value->>'large_project_id' and lp.value->>'deleted_at' is null where j.value->>'booking_id'=any(v_bookings) group by j.value->>'booking_id' having count(distinct j.value->>'large_project_id')>1) then raise exception 'scope_ambiguous_live_large_parents' using errcode='22023';end if;
 for v_row in select value from jsonb_array_elements(v_catalog->'projects') where value->>'booking_id'=any(v_bookings) and value->>'deleted_at' is null loop
  if (v_row->>'organization_id')::uuid is distinct from p_org then raise exception 'scope_project_leaf_foreign' using errcode='42501';end if;
  if not((v_row->>'id')::uuid=any(v_projects)) then v_projects:=array_append(v_projects,(v_row->>'id')::uuid);v_relations:=v_relations||jsonb_build_array(jsonb_build_object('relation','project_booking','relation_id',v_row->'id','parent_id',v_row->'id','local_booking_id',v_row->'booking_id'));end if;
 end loop;
 if cardinality(v_projects)>1000 then raise exception 'too_many_scope_projects' using errcode='22023';end if;
 return jsonb_build_object('schema_version','operations-project-scope-membership-v1','organization_id',p_org,'root_kind',p_kind,'root_id',p_root,
 'root_evidence',jsonb_build_object('status',v_status,'primary_local_booking_id',v_primary,'packing_parent_id',v_parent),
 'source_project_ids',coalesce((select jsonb_agg(id order by id) from unnest(v_projects) a(id)),'[]'::jsonb),
 'local_booking_ids',coalesce((select jsonb_agg(id order by id collate "C") from unnest(v_bookings) a(id)),'[]'::jsonb),
 'relationships',coalesce((select jsonb_agg(value order by operations_economy_private.canonical_json_v1(value) collate "C") from jsonb_array_elements(v_relations)),'[]'::jsonb),
 'integration_state','membership_only','economic_mapping','unavailable');
end;$$;
revoke all on function operations_economy_private.scope_membership_v1(uuid,text,uuid) from public,anon,authenticated,service_role;

create function operations_economy_private.preview_scope_v1(p_root_kind text,p_root_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_membership jsonb;v_raw text;
begin
 v_org:=operations_economy_private.authorize_scope_admin_v1();v_membership:=operations_economy_private.scope_membership_v1(v_org,p_root_kind,p_root_id);v_raw:=operations_economy_private.canonical_json_v1(v_membership);
 return jsonb_build_object('schema','operations-project-scope-preview.v1','membership',v_membership,'membership_raw',v_raw,'membership_fingerprint',encode(sha256(convert_to(v_raw,'UTF8')),'hex'),'shadow_only',true);
end;$$;
revoke all on function operations_economy_private.preview_scope_v1(text,uuid) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.preview_scope_v1(text,uuid) to authenticated;
create function public.preview_operations_project_scope_v1(p_root_kind text,p_root_id uuid) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.preview_scope_v1(p_root_kind,p_root_id);$$;
revoke all on function public.preview_operations_project_scope_v1(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.preview_operations_project_scope_v1(text,uuid) to authenticated;

create function operations_economy_private.enroll_scope_v1(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_actor uuid:=auth.uid();v_scope uuid;v_root uuid;v_kind text;v_expected bigint;v_head public.operations_project_scope_heads%rowtype;
 v_event public.operations_project_scope_snapshots%rowtype;v_membership jsonb;v_raw text;v_hash text;v_command jsonb;v_row record;v_current bigint:=0;v_snapshot uuid;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_command))<>8 or not(p_command ?& array['schema','economic_scope_id','root_kind','root_id','expected_revision','expected_membership_fingerprint','idempotency_key','reason'])
 or p_command->>'schema' is distinct from 'operations-project-scope-enroll.v1' or jsonb_typeof(p_command->'schema') is distinct from 'string'
 or jsonb_typeof(p_command->'root_kind') is distinct from 'string' or p_command->>'root_kind' not in ('project','large_project','packing_project')
 or jsonb_typeof(p_command->'economic_scope_id') is distinct from 'string' or (p_command->>'economic_scope_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p_command->'root_id') is distinct from 'string' or (p_command->>'root_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p_command->'expected_revision') is distinct from 'number' or (p_command->>'expected_revision')::numeric<>trunc((p_command->>'expected_revision')::numeric) or (p_command->>'expected_revision')::numeric not between 0 and 9007199254740990
 or jsonb_typeof(p_command->'expected_membership_fingerprint') is distinct from 'string' or (p_command->>'expected_membership_fingerprint')!~'^[0-9a-f]{64}$'
 or jsonb_typeof(p_command->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p_command->>'idempotency_key',256)
 or jsonb_typeof(p_command->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p_command->>'reason',2000) then raise exception 'invalid_project_scope_enrollment' using errcode='22023';end if;
 v_scope:=(p_command->>'economic_scope_id')::uuid;v_root:=(p_command->>'root_id')::uuid;v_kind:=p_command->>'root_kind';v_expected:=(p_command->>'expected_revision')::bigint;
 v_org:=operations_economy_private.authorize_scope_admin_v1();
 -- Serialize reservations across different scopes in the same organization.
 perform pg_advisory_xact_lock(hashtextextended('operations-economic-scope:'||v_org::text,0));
 v_membership:=operations_economy_private.scope_membership_v1(v_org,v_kind,v_root);v_raw:=operations_economy_private.canonical_json_v1(v_membership);v_hash:=encode(sha256(convert_to(v_raw,'UTF8')),'hex');
 v_command:=jsonb_set(jsonb_set(p_command,'{economic_scope_id}',to_jsonb(v_scope::text)),'{root_id}',to_jsonb(v_root::text));
 select * into v_event from public.operations_project_scope_snapshots where organization_id=v_org and idempotency_key=p_command->>'idempotency_key';
 if found then
  if v_event.command is distinct from v_command then raise exception 'scope_idempotency_conflict' using errcode='23505';end if;
  return jsonb_build_object('schema','operations-project-scope-receipt.v1','outcome','replayed','snapshot_id',v_event.snapshot_id,'economic_scope_id',v_scope,'scope_revision',v_event.scope_revision,'membership_fingerprint',v_event.membership_fingerprint,'shadow_only',true);
 end if;
 if v_hash is distinct from p_command->>'expected_membership_fingerprint' then raise exception 'scope_membership_preview_changed' using errcode='22023';end if;
 select * into v_head from public.operations_project_scope_heads where organization_id=v_org and economic_scope_id=v_scope for update;
 if found then
  if row(v_head.root_kind,v_head.root_id) is distinct from row(v_kind,v_root) then raise exception 'scope_root_reassignment_denied' using errcode='23505';end if;v_current:=v_head.current_revision;
 end if;
 if v_current<>v_expected then raise exception 'scope_revision_conflict' using errcode='23505';end if;
 if exists(select 1 from public.operations_project_scope_heads where organization_id=v_org and root_kind=v_kind and root_id=v_root and economic_scope_id<>v_scope) then raise exception 'scope_root_already_owned' using errcode='23505';end if;
 for v_row in select 'source_project'::text as kind,value#>>'{}' as member from jsonb_array_elements(v_membership->'source_project_ids') union all select 'local_booking',value#>>'{}' from jsonb_array_elements(v_membership->'local_booking_ids') loop
  if exists(select 1 from public.operations_project_scope_member_ownership where organization_id=v_org and member_kind=v_row.kind and member_id=v_row.member and economic_scope_id<>v_scope) then raise exception 'scope_member_already_owned' using errcode='23505';end if;
 end loop;
 insert into public.operations_project_scope_heads(organization_id,economic_scope_id,root_kind,root_id) values(v_org,v_scope,v_kind,v_root) on conflict(organization_id,economic_scope_id) do nothing;
 insert into public.operations_project_scope_snapshots(organization_id,economic_scope_id,scope_revision,membership,membership_raw,membership_fingerprint,actor_system_user_id,reason,idempotency_key,command)
 values(v_org,v_scope,v_current+1,v_membership,v_raw,v_hash,v_actor,p_command->>'reason',p_command->>'idempotency_key',v_command) returning snapshot_id into v_snapshot;
 insert into public.operations_project_scope_member_ownership(organization_id,member_kind,member_id,economic_scope_id,first_scope_revision)
 select v_org,'source_project',value#>>'{}',v_scope,v_current+1 from jsonb_array_elements(v_membership->'source_project_ids')
 union all select v_org,'local_booking',value#>>'{}',v_scope,v_current+1 from jsonb_array_elements(v_membership->'local_booking_ids') on conflict(organization_id,member_kind,member_id) do nothing;
 update public.operations_project_scope_heads set current_revision=v_current+1 where organization_id=v_org and economic_scope_id=v_scope;
 return jsonb_build_object('schema','operations-project-scope-receipt.v1','outcome','accepted','snapshot_id',v_snapshot,'economic_scope_id',v_scope,'scope_revision',v_current+1,'membership_fingerprint',v_hash,'shadow_only',true);
end;$$;
revoke all on function operations_economy_private.enroll_scope_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.enroll_scope_v1(jsonb) to authenticated;
create function public.enroll_operations_project_scope_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.enroll_scope_v1(p_command);$$;
revoke all on function public.enroll_operations_project_scope_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.enroll_operations_project_scope_v1(jsonb) to authenticated;
