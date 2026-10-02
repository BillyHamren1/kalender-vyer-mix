-- Additive Operations-owned per-project decisions. No automatic publication/wire
-- changes; v1 same-Time economics freeze and legacy payroll remain untouched.
create schema if not exists operations_economy_private;
revoke all on schema operations_economy_private from public,anon;
grant usage on schema operations_economy_private to authenticated,service_role;

create table public.operations_project_personnel_review_grants (
  event_id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  project_id uuid not null, system_user_id uuid not null, actor_system_user_id uuid not null,
  decision text not null check(decision in ('granted','revoked')),
  reason text not null check(length(reason) between 3 and 1000 and reason=btrim(reason)),
  idempotency_key text not null check(length(idempotency_key) between 12 and 200),
  grant_sequence bigint generated always as identity unique check(grant_sequence between 1 and 9007199254740991),
  created_at timestamptz not null default now(), unique(organization_id,idempotency_key)
);
create index operations_project_personnel_grant_head on public.operations_project_personnel_review_grants
  (organization_id,project_id,system_user_id,grant_sequence desc);
create table public.operations_project_personnel_reviews (
  event_id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  source_time_stream_id text not null check(length(source_time_stream_id) between 1 and 256),
  source_revision bigint not null check(source_revision between 1 and 9007199254740991),
  source_time_report_id uuid not null, source_snapshot_hash text not null check(source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  time_snapshot_version bigint not null check(time_snapshot_version between 1 and 9007199254740991),
  project_id uuid not null, source_time_line_ids jsonb not null check(jsonb_typeof(source_time_line_ids)='array'),
  economics_fingerprint text not null check(economics_fingerprint ~ '^[0-9a-f]{64}$'),
  decision text not null check(decision in ('approved','reopened','rejected')),
  actor_system_user_id uuid not null, reason text check(reason is null or (length(reason) between 3 and 1000 and reason=btrim(reason))),
  idempotency_key text not null check(length(idempotency_key) between 12 and 200),
  review_sequence bigint generated always as identity unique check(review_sequence between 1 and 9007199254740991),
  created_at timestamptz not null default now(), unique(organization_id,idempotency_key),
  check(decision='approved' or reason is not null),
  foreign key(organization_id,source_time_stream_id,source_revision)
    references public.operations_personnel_cost_publications(organization_id,source_time_stream_id,source_revision)
);
create index operations_project_personnel_review_head on public.operations_project_personnel_reviews
  (organization_id,source_time_stream_id,project_id,review_sequence desc);
alter table public.operations_project_personnel_review_grants enable row level security;
alter table public.operations_project_personnel_reviews enable row level security;
revoke all on public.operations_project_personnel_review_grants,public.operations_project_personnel_reviews from public,anon,authenticated;
grant select on public.operations_project_personnel_review_grants,public.operations_project_personnel_reviews to service_role;
create trigger operations_project_personnel_grants_append_only before update or delete on public.operations_project_personnel_review_grants
  for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_personnel_grants_no_truncate before truncate on public.operations_project_personnel_review_grants
  for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_personnel_reviews_append_only before update or delete on public.operations_project_personnel_reviews
  for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_project_personnel_reviews_no_truncate before truncate on public.operations_project_personnel_reviews
  for each statement execute function public.operations_personnel_evidence_immutable();

-- Matches compact UTF-8/C ordered canonical JSON in the isolated JS helper.
create function operations_economy_private.canonical_json_v1(p_value jsonb)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare v_result text;
begin
  case jsonb_typeof(p_value)
  when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||operations_economy_private.canonical_json_v1(value),',' order by key collate "C"),'')||'}'
    into v_result from jsonb_each(p_value);
  when 'array' then select '['||coalesce(string_agg(operations_economy_private.canonical_json_v1(value),',' order by ord),'')||']'
    into v_result from jsonb_array_elements(p_value) with ordinality as a(value,ord);
  when 'number' then v_result:=case when p_value::numeric=trunc(p_value::numeric) then trunc(p_value::numeric)::text else p_value::text end;
  else v_result:=p_value::text; end case;
  return v_result;
end; $$;
revoke all on function operations_economy_private.canonical_json_v1(jsonb) from public,anon,authenticated;
grant execute on function operations_economy_private.canonical_json_v1(jsonb) to service_role;

create function operations_economy_private.project_fingerprint_v1(p_snapshot jsonb,p_project_id uuid)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare v_lines jsonb; v_document jsonb;
begin
  select jsonb_agg(value-'status' order by value->>'source_time_line_id' collate "C") into v_lines
    from jsonb_array_elements(p_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id;
  if v_lines is null then raise exception 'project_not_in_saved_snapshot' using errcode='22023'; end if;
  v_document:=jsonb_build_object('schema','operations-personnel-project-economics-fingerprint.v1',
    'organization_id',p_snapshot->'organization_id','worker_id',p_snapshot->'worker_id','work_date',p_snapshot->'work_date',
    'source_time_stream_id',p_snapshot->'source_time_stream_id','source_time_report_id',p_snapshot->'source_time_report_id',
    'source_snapshot_hash',p_snapshot->'source_snapshot_hash','time_snapshot_version',p_snapshot->'time_snapshot_version',
    'calculation_version',p_snapshot->'calculation_version','source_project_id',p_project_id,'lines',v_lines);
  return encode(sha256(convert_to(operations_economy_private.canonical_json_v1(v_document),'UTF8')),'hex');
end; $$;
revoke all on function operations_economy_private.project_fingerprint_v1(jsonb,uuid) from public,anon,authenticated;
grant execute on function operations_economy_private.project_fingerprint_v1(jsonb,uuid) to service_role;

-- Every definer entry captures auth.uid and checks live profile, role and project.
-- The caller never supplies organization or actor identity.
create function operations_economy_private.authorize_project_v1(p_project_id uuid,p_admin_only boolean default false)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_org uuid; v_admin boolean; v_grant text;
begin
  if v_actor is null or not exists(select 1 from auth.users where id=v_actor) then
    raise exception 'authenticated_system_user_required' using errcode='42501'; end if;
  begin
    select organization_id into strict v_org from public.profiles where user_id=v_actor;
  exception when no_data_found or too_many_rows then
    raise exception 'unambiguous_system_profile_required' using errcode='42501';
  end;
  if v_org is null or not exists(select 1 from public.projects where id=p_project_id and organization_id=v_org and deleted_at is null)
    then raise exception 'organization_project_access_denied' using errcode='42501'; end if;
  select exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org and role='admin') into v_admin;
  if v_admin then return v_org; end if;
  if p_admin_only or not exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org) then
    raise exception 'project_review_admin_required' using errcode='42501'; end if;
  select decision into v_grant from public.operations_project_personnel_review_grants
    where organization_id=v_org and project_id=p_project_id and system_user_id=v_actor order by grant_sequence desc limit 1;
  if v_grant is distinct from 'granted' then raise exception 'explicit_project_review_grant_required' using errcode='42501'; end if;
  return v_org;
end; $$;
revoke all on function operations_economy_private.authorize_project_v1(uuid,boolean) from public,anon,authenticated;

create function operations_economy_private.grant_review_v1(
  p_project_id uuid,p_system_user_id uuid,p_expected_grant_sequence bigint,p_decision text,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid:=auth.uid(); v_head bigint:=0;
  v_existing public.operations_project_personnel_review_grants%rowtype; v_event public.operations_project_personnel_review_grants%rowtype;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,true);
  if p_expected_grant_sequence is null or p_expected_grant_sequence not between 0 and 9007199254740991
    or p_decision is null or p_decision not in ('granted','revoked') or p_reason is null or p_reason<>btrim(p_reason) or length(p_reason) not between 3 and 1000
    or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 200 or p_idempotency_key<>btrim(p_idempotency_key)
    then raise exception 'invalid_project_review_grant' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_system_user_id and p.organization_id=v_org) then
    raise exception 'grantee_not_in_organization' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','project-review-grant',v_org,p_project_id,p_system_user_id),0));
  select * into v_existing from public.operations_project_personnel_review_grants where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.project_id<>p_project_id or v_existing.system_user_id<>p_system_user_id or v_existing.actor_system_user_id<>v_actor
      or v_existing.decision<>p_decision or v_existing.reason<>p_reason then raise exception 'grant_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('status','duplicate','event_id',v_existing.event_id,'grant_sequence',v_existing.grant_sequence);
  end if;
  select coalesce(max(grant_sequence),0) into v_head from public.operations_project_personnel_review_grants
    where organization_id=v_org and project_id=p_project_id and system_user_id=p_system_user_id;
  if v_head<>p_expected_grant_sequence then return jsonb_build_object('status','stale','current_grant_sequence',v_head); end if;
  insert into public.operations_project_personnel_review_grants(organization_id,project_id,system_user_id,actor_system_user_id,decision,reason,idempotency_key)
    values(v_org,p_project_id,p_system_user_id,v_actor,p_decision,p_reason,p_idempotency_key) returning * into v_event;
  return jsonb_build_object('status','accepted','event_id',v_event.event_id,'grant_sequence',v_event.grant_sequence);
end; $$;
revoke all on function operations_economy_private.grant_review_v1(uuid,uuid,bigint,text,text,text) from public,anon;
grant execute on function operations_economy_private.grant_review_v1(uuid,uuid,bigint,text,text,text) to authenticated;
create function public.grant_operations_project_personnel_review_v1(
  p_project_id uuid,p_system_user_id uuid,p_expected_grant_sequence bigint,p_decision text,p_reason text,p_idempotency_key text
) returns jsonb language sql security invoker set search_path='' as $$
  select operations_economy_private.grant_review_v1(p_project_id,p_system_user_id,p_expected_grant_sequence,p_decision,p_reason,p_idempotency_key);
$$;
revoke all on function public.grant_operations_project_personnel_review_v1(uuid,uuid,bigint,text,text,text) from public,anon;
grant execute on function public.grant_operations_project_personnel_review_v1(uuid,uuid,bigint,text,text,text) to authenticated;

create function operations_economy_private.review_v1(
  p_source_time_stream_id text,p_project_id uuid,p_expected_source_revision bigint,p_expected_review_sequence bigint,
  p_decision text,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid:=auth.uid(); v_source bigint; v_review bigint:=0; v_snapshot jsonb; v_state text;
  v_existing public.operations_project_personnel_reviews%rowtype; v_event public.operations_project_personnel_reviews%rowtype;
  v_line_ids jsonb; v_fingerprint text;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
  if p_source_time_stream_id is null or p_source_time_stream_id<>btrim(p_source_time_stream_id) or length(p_source_time_stream_id) not between 1 and 256
    or p_expected_source_revision is null or p_expected_source_revision not between 1 and 9007199254740991
    or p_expected_review_sequence is null or p_expected_review_sequence not between 0 and 9007199254740991
    or p_decision is null or p_decision not in ('approved','reopened','rejected')
    or (p_reason is not null and (p_reason<>btrim(p_reason) or length(p_reason) not between 3 and 1000))
    or (p_decision<>'approved' and p_reason is null)
    or p_idempotency_key is null or length(p_idempotency_key) not between 12 and 200 or p_idempotency_key<>btrim(p_idempotency_key)
    then raise exception 'invalid_project_personnel_review' using errcode='22023'; end if;
  -- Head lock is shared with publication CAS: review cannot approve moving source.
  select current_revision into v_source from public.operations_personnel_cost_streams
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id for update;
  if not found then raise exception 'source_stream_not_found' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','project-personnel-review',v_org,p_source_time_stream_id,p_project_id),0));
  select * into v_existing from public.operations_project_personnel_reviews where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.source_time_stream_id<>p_source_time_stream_id or v_existing.project_id<>p_project_id or v_existing.actor_system_user_id<>v_actor
      or v_existing.source_revision<>p_expected_source_revision or v_existing.decision<>p_decision or v_existing.reason is distinct from p_reason
      then raise exception 'review_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('status','duplicate','event_id',v_existing.event_id,'review_sequence',v_existing.review_sequence);
  end if;
  if v_source<>p_expected_source_revision then return jsonb_build_object('status','stale_source','current_source_revision',v_source); end if;
  select cost_snapshot into strict v_snapshot from public.operations_personnel_cost_publications
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_source;
  select source_evidence->>'submission_state' into v_state from public.operations_personnel_cost_outbox
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_source;
  if p_decision='approved' and (v_state is null or v_state in ('voided','correction_requested')) then
    raise exception 'source_cannot_be_confirmed' using errcode='22023'; end if;
  v_fingerprint:=operations_economy_private.project_fingerprint_v1(v_snapshot,p_project_id);
  select jsonb_agg(value->'source_time_line_id' order by value->>'source_time_line_id' collate "C") into v_line_ids
    from jsonb_array_elements(v_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id;
  select coalesce(max(review_sequence),0) into v_review from public.operations_project_personnel_reviews
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and project_id=p_project_id;
  if v_review<>p_expected_review_sequence then return jsonb_build_object('status','stale_review','current_review_sequence',v_review); end if;
  insert into public.operations_project_personnel_reviews(organization_id,source_time_stream_id,source_revision,source_time_report_id,
    source_snapshot_hash,time_snapshot_version,project_id,source_time_line_ids,economics_fingerprint,decision,actor_system_user_id,reason,idempotency_key)
    values(v_org,p_source_time_stream_id,v_source,(v_snapshot->>'source_time_report_id')::uuid,v_snapshot->>'source_snapshot_hash',
      (v_snapshot->>'time_snapshot_version')::bigint,p_project_id,v_line_ids,v_fingerprint,p_decision,v_actor,p_reason,p_idempotency_key) returning * into v_event;
  return jsonb_build_object('status','accepted','event_id',v_event.event_id,'review_sequence',v_event.review_sequence,
    'source_project_id',v_event.project_id,'economics_fingerprint',v_event.economics_fingerprint,'source_time_line_ids',v_event.source_time_line_ids);
end; $$;
revoke all on function operations_economy_private.review_v1(text,uuid,bigint,bigint,text,text,text) from public,anon;
grant execute on function operations_economy_private.review_v1(text,uuid,bigint,bigint,text,text,text) to authenticated;
create function public.review_operations_project_personnel_v1(
  p_source_time_stream_id text,p_project_id uuid,p_expected_source_revision bigint,p_expected_review_sequence bigint,
  p_decision text,p_reason text,p_idempotency_key text
) returns jsonb language sql security invoker set search_path='' as $$
  select operations_economy_private.review_v1(p_source_time_stream_id,p_project_id,p_expected_source_revision,p_expected_review_sequence,p_decision,p_reason,p_idempotency_key);
$$;
revoke all on function public.review_operations_project_personnel_v1(text,uuid,bigint,bigint,text,text,text) from public,anon;
grant execute on function public.review_operations_project_personnel_v1(text,uuid,bigint,bigint,text,text,text) to authenticated;

create function operations_economy_private.read_review_v1(p_source_time_stream_id text,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_revision bigint; v_snapshot jsonb; v_state text; v_event public.operations_project_personnel_reviews%rowtype; v_line_ids jsonb;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
  select current_revision into v_revision from public.operations_personnel_cost_streams where organization_id=v_org and source_time_stream_id=p_source_time_stream_id;
  if not found then return jsonb_build_object('status','no_current_review'); end if;
  select cost_snapshot into v_snapshot from public.operations_personnel_cost_publications
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_revision;
  if not exists(select 1 from jsonb_array_elements(v_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id)
    then return jsonb_build_object('status','no_current_review'); end if;
  select source_evidence->>'submission_state' into v_state from public.operations_personnel_cost_outbox
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_revision;
  select * into v_event from public.operations_project_personnel_reviews
    where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and project_id=p_project_id order by review_sequence desc limit 1;
  if not found or v_event.source_snapshot_hash is distinct from v_snapshot->>'source_snapshot_hash'
    or v_event.time_snapshot_version is distinct from (v_snapshot->>'time_snapshot_version')::bigint
    or v_event.economics_fingerprint is distinct from operations_economy_private.project_fingerprint_v1(v_snapshot,p_project_id)
    then return jsonb_build_object('status','no_current_review'); end if;
  select jsonb_agg(value->'source_time_line_id' order by value->>'source_time_line_id' collate "C") into v_line_ids
    from jsonb_array_elements(v_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id;
  if v_event.source_time_line_ids<>v_line_ids or v_state='voided' or
    (v_event.decision='approved' and (v_state is null or v_state='correction_requested')) then
    return jsonb_build_object('status','no_current_review'); end if;
  return jsonb_build_object('status','current','review',jsonb_build_object(
    'schema','operations-personnel-project-review.v1','event_id',v_event.event_id,'organization_id',v_event.organization_id,
    'source_time_stream_id',v_event.source_time_stream_id,'source_snapshot_hash',v_event.source_snapshot_hash,
    'time_snapshot_version',v_event.time_snapshot_version,'source_project_id',v_event.project_id,
    'source_time_line_ids',v_event.source_time_line_ids,'economics_fingerprint',v_event.economics_fingerprint,
    'decision',v_event.decision,'actor_system_user_id',v_event.actor_system_user_id,'reason',v_event.reason,'review_sequence',v_event.review_sequence));
end; $$;
revoke all on function operations_economy_private.read_review_v1(text,uuid) from public,anon;
grant execute on function operations_economy_private.read_review_v1(text,uuid) to authenticated;
create function public.get_operations_project_personnel_review_v1(p_source_time_stream_id text,p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select operations_economy_private.read_review_v1(p_source_time_stream_id,p_project_id);
$$;
revoke all on function public.get_operations_project_personnel_review_v1(text,uuid) from public,anon;
grant execute on function public.get_operations_project_personnel_review_v1(text,uuid) to authenticated;
