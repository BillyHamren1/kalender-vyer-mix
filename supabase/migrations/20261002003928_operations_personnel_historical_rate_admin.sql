-- Shadow historical-rate administration. Never revises a saved cost publication.
create table public.operations_personnel_rate_admin_events (
  event_id uuid primary key default gen_random_uuid(),organization_id uuid not null,worker_id uuid not null,
  rate_revision text not null,category text not null,currency text not null,
  actor_system_user_id uuid not null,reason text not null,source_reference text not null,
  idempotency_key text not null,command jsonb not null,
  history_sequence bigint generated always as identity unique check(history_sequence between 1 and 9007199254740991),
  created_at timestamptz not null default now(),unique(organization_id,idempotency_key),
  foreign key(organization_id,worker_id,rate_revision) references public.operations_personnel_rate_history(organization_id,worker_id,rate_revision)
);
create index operations_personnel_rate_admin_head on public.operations_personnel_rate_admin_events
  (organization_id,worker_id,category,currency,history_sequence desc);
alter table public.operations_personnel_rate_admin_events enable row level security;
revoke all on public.operations_personnel_rate_admin_events from public,anon,authenticated;
grant select on public.operations_personnel_rate_admin_events to service_role;
create trigger operations_personnel_rate_admin_append_only before update or delete on public.operations_personnel_rate_admin_events
  for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_rate_admin_no_truncate before truncate on public.operations_personnel_rate_admin_events
  for each statement execute function public.operations_personnel_evidence_immutable();

-- Guard future writes, including trusted-service imports. Old rows are untouched;
-- existing ambiguity remains an explicit engine exception rather than backfilled.
create function operations_economy_private.guard_rate_interval_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','personnel-rate-history',new.organization_id,new.worker_id,new.category,new.currency),0));
  if new.effective_from is null or (new.effective_to is not null and new.effective_to<=new.effective_from) then
    raise exception 'invalid_historical_rate_interval' using errcode='22023';end if;
  if exists(select 1 from public.operations_personnel_rate_history r where r.organization_id=new.organization_id and r.worker_id=new.worker_id
    and r.category=new.category and r.currency=new.currency and daterange(r.effective_from,r.effective_to,'[)')&&daterange(new.effective_from,new.effective_to,'[)')) then
    raise exception 'historical_rate_interval_overlap' using errcode='23505';end if;
  return new;
end;$$;
revoke all on function operations_economy_private.guard_rate_interval_v1() from public,anon,authenticated,service_role;
create trigger operations_personnel_rate_interval_guard before insert on public.operations_personnel_rate_history
  for each row execute function operations_economy_private.guard_rate_interval_v1();

create function operations_economy_private.authorize_rate_admin_v1(p_worker_id uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_org uuid;
begin
  if v_actor is null or not exists(select 1 from auth.users where id=v_actor) then
    raise exception 'authenticated_system_user_required' using errcode='42501';end if;
  begin select organization_id into strict v_org from public.profiles where user_id=v_actor;
  exception when no_data_found or too_many_rows then raise exception 'unambiguous_system_profile_required' using errcode='42501';end;
  if v_org is null or not exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org and role='admin') then
    raise exception 'organization_rate_admin_required' using errcode='42501';end if;
  if p_worker_id is null or not exists(select 1 from public.operations_personnel_source_bindings where organization_id=v_org and worker_id=p_worker_id) then
    raise exception 'explicit_organization_worker_binding_required' using errcode='42501';end if;
  return v_org;
end;$$;
revoke all on function operations_economy_private.authorize_rate_admin_v1(uuid) from public,anon,authenticated,service_role;

create function operations_economy_private.enroll_rate_v1(p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_actor uuid:=auth.uid();v_worker uuid;v_head bigint;v_event public.operations_personnel_rate_admin_events%rowtype;
  v_from date;v_to date;v_rate bigint;v_expected bigint;
begin
  if jsonb_typeof(p_command) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_command))<>12
    or not (p_command ?& array['schema','worker_id','rate_revision','category','currency','hourly_rate_minor','effective_from','effective_to',
      'reason','source_reference','idempotency_key','expected_history_sequence']) or p_command->>'schema' is distinct from 'operations-personnel-rate-admin.v1'
    or jsonb_typeof(p_command->'worker_id') is distinct from 'string'
    or coalesce(p_command->>'worker_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_command->'rate_revision') is distinct from 'string' or length(coalesce(p_command->>'rate_revision','')) not between 1 and 200
    or p_command->>'rate_revision' is distinct from btrim(p_command->>'rate_revision')
    or jsonb_typeof(p_command->'category') is distinct from 'string' or coalesce(p_command->>'category','') not in ('work','travel')
    or jsonb_typeof(p_command->'currency') is distinct from 'string' or coalesce(p_command->>'currency','') !~ '^[A-Z]{3}$'
    or jsonb_typeof(p_command->'hourly_rate_minor') is distinct from 'number' or (p_command->>'hourly_rate_minor')::numeric not between 0 and 9007199254740991
    or mod((p_command->>'hourly_rate_minor')::numeric,1)<>0
    or jsonb_typeof(p_command->'expected_history_sequence') is distinct from 'number'
    or (p_command->>'expected_history_sequence')::numeric not between 0 and 9007199254740991
    or mod((p_command->>'expected_history_sequence')::numeric,1)<>0
    or jsonb_typeof(p_command->'effective_from') is distinct from 'string' or coalesce(p_command->>'effective_from','') !~ '^\d{4}-\d{2}-\d{2}$'
    or (p_command->'effective_to'<>'null'::jsonb and (jsonb_typeof(p_command->'effective_to') is distinct from 'string' or coalesce(p_command->>'effective_to','') !~ '^\d{4}-\d{2}-\d{2}$'))
    or jsonb_typeof(p_command->'reason') is distinct from 'string' or length(coalesce(p_command->>'reason','')) not between 3 and 1000
    or p_command->>'reason' is distinct from btrim(p_command->>'reason')
    or jsonb_typeof(p_command->'source_reference') is distinct from 'string' or length(coalesce(p_command->>'source_reference','')) not between 1 and 1000
    or p_command->>'source_reference' is distinct from btrim(p_command->>'source_reference')
    or jsonb_typeof(p_command->'idempotency_key') is distinct from 'string' or length(coalesce(p_command->>'idempotency_key','')) not between 12 and 200
    or p_command->>'idempotency_key' is distinct from btrim(p_command->>'idempotency_key')
    then raise exception 'invalid_historical_rate_command' using errcode='22023';end if;
  v_worker:=(p_command->>'worker_id')::uuid;v_org:=operations_economy_private.authorize_rate_admin_v1(v_worker);
  v_from:=(p_command->>'effective_from')::date;v_to:=(p_command->>'effective_to')::date;
  v_rate:=(p_command->>'hourly_rate_minor')::numeric::bigint;v_expected:=(p_command->>'expected_history_sequence')::numeric::bigint;
  if v_to is not null and v_to<=v_from then raise exception 'invalid_historical_rate_interval' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','personnel-rate-history',v_org,v_worker,p_command->>'category',p_command->>'currency'),0));
  select * into v_event from public.operations_personnel_rate_admin_events where organization_id=v_org and idempotency_key=p_command->>'idempotency_key';
  if found then
    if v_event.actor_system_user_id<>v_actor or v_event.command is distinct from p_command then raise exception 'historical_rate_idempotency_conflict' using errcode='23505';end if;
    return jsonb_build_object('status','duplicate','event_id',v_event.event_id,'history_sequence',v_event.history_sequence,'rate_revision',v_event.rate_revision);
  end if;
  select coalesce(max(history_sequence),0) into v_head from public.operations_personnel_rate_admin_events where organization_id=v_org and worker_id=v_worker
    and category=p_command->>'category' and currency=p_command->>'currency';
  if v_head<>v_expected then return jsonb_build_object('status','stale','current_history_sequence',v_head);end if;
  insert into public.operations_personnel_rate_history(organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
    values(v_org,v_worker,p_command->>'rate_revision',p_command->>'category',p_command->>'currency',v_rate,v_from,v_to,p_command->>'source_reference');
  insert into public.operations_personnel_rate_admin_events(organization_id,worker_id,rate_revision,category,currency,actor_system_user_id,reason,source_reference,idempotency_key,command)
    values(v_org,v_worker,p_command->>'rate_revision',p_command->>'category',p_command->>'currency',v_actor,p_command->>'reason',p_command->>'source_reference',p_command->>'idempotency_key',p_command)
    returning * into v_event;
  return jsonb_build_object('status','accepted','event_id',v_event.event_id,'history_sequence',v_event.history_sequence,'rate_revision',v_event.rate_revision);
end;$$;
revoke all on function operations_economy_private.enroll_rate_v1(jsonb) from public,anon,service_role;
grant execute on function operations_economy_private.enroll_rate_v1(jsonb) to authenticated;
create function public.enroll_operations_personnel_rate_v1(p_command jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select operations_economy_private.enroll_rate_v1(p_command);$$;
revoke all on function public.enroll_operations_personnel_rate_v1(jsonb) from public,anon,service_role;
grant execute on function public.enroll_operations_personnel_rate_v1(jsonb) to authenticated;

-- Raw worker rate history is administrator-only; project review grants convey no
-- personnel-history read permission. Saved per-project money uses its own reader.
create function operations_economy_private.read_rate_history_v1(p_worker_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid;v_rates jsonb;
begin
  v_org:=operations_economy_private.authorize_rate_admin_v1(p_worker_id);
  select coalesce(jsonb_agg(jsonb_build_object('rate_revision',r.rate_revision,'category',r.category,'currency',r.currency,
    'hourly_rate_minor',r.hourly_rate_minor,'effective_from',r.effective_from,'effective_to',r.effective_to,'source_reference',r.source_reference,
    'admin_event_id',e.event_id,'actor_system_user_id',e.actor_system_user_id,'reason',e.reason,'history_sequence',e.history_sequence)
    order by r.category,r.currency,r.effective_from,r.rate_revision collate "C"),'[]'::jsonb) into v_rates
    from public.operations_personnel_rate_history r left join public.operations_personnel_rate_admin_events e
      on e.organization_id=r.organization_id and e.worker_id=r.worker_id and e.rate_revision=r.rate_revision
    where r.organization_id=v_org and r.worker_id=p_worker_id;
  return jsonb_build_object('schema','operations-personnel-rate-history.v1','worker_id',p_worker_id,'rates',v_rates);
end;$$;
revoke all on function operations_economy_private.read_rate_history_v1(uuid) from public,anon,service_role;
grant execute on function operations_economy_private.read_rate_history_v1(uuid) to authenticated;
create function public.get_operations_personnel_rate_history_v1(p_worker_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select operations_economy_private.read_rate_history_v1(p_worker_id);$$;
revoke all on function public.get_operations_personnel_rate_history_v1(uuid) from public,anon,service_role;
grant execute on function public.get_operations_personnel_rate_history_v1(uuid) to authenticated;
