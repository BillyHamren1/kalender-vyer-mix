-- Additive shadow-only transport. No production enrollment/configuration is enabled.
create table public.operations_personnel_source_bindings (
  organization_id uuid not null, worker_id uuid not null,
  time_organization_id uuid not null, time_auth_worker_id uuid not null,
  time_personnel_id uuid not null, time_source_system text not null check (time_source_system in ('time','planning')),
  external_personnel_id text not null check (length(external_personnel_id) between 1 and 256),
  enabled boolean not null default false,
  primary key (organization_id, worker_id),
  unique (time_organization_id, time_personnel_id), unique (time_organization_id,time_auth_worker_id)
);
create table public.operations_personnel_target_bindings (
  organization_id uuid not null, source_system text not null, target_kind text not null,
  external_id text not null, target_version text not null,
  source_project_id uuid not null, source_booking_id uuid, currency text not null check(currency ~ '^[A-Z]{3}$'),
  source_reference text not null,
  primary key (organization_id,source_system,target_kind,external_id,target_version),
  check (length(source_system) between 1 and 200 and source_system=btrim(source_system)),
  check (length(target_kind) between 1 and 200 and target_kind=btrim(target_kind)),
  check (length(external_id) between 1 and 256 and external_id=btrim(external_id)),
  check (length(target_version) between 1 and 256 and target_version=btrim(target_version))
);
create table public.operations_personnel_transport_routes (
  organization_id uuid primary key,
  destination_organization_id uuid not null,
  key_id text not null check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),
  endpoint_url text not null check(endpoint_url ~ '^https://[^/?#@]+/functions/v1/operations-personnel-cost-receive$'),
  enabled boolean not null default false
);
create table public.operations_personnel_cost_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, source_time_stream_id text not null, source_revision bigint not null,
  raw_body text not null check(octet_length(raw_body) <= 262144),
  body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
  source_evidence jsonb not null,
  destination_organization_id uuid not null, key_id text not null, endpoint_url text not null,
  state text not null default 'queued' check(state in ('queued','retry','delivered','superseded','blocked')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease_owner text, lease_token uuid, lease_until timestamptz,
  receipt jsonb, last_error text, created_at timestamptz not null default now(), finished_at timestamptz,
  unique(organization_id,source_time_stream_id,source_revision),
  foreign key(organization_id,source_time_stream_id,source_revision)
    references public.operations_personnel_cost_publications(organization_id,source_time_stream_id,source_revision),
  check((lease_owner is null and lease_token is null and lease_until is null) or
    (lease_owner is not null and lease_token is not null and lease_until is not null))
);
create index operations_personnel_cost_outbox_due on public.operations_personnel_cost_outbox(next_attempt_at,created_at)
  where state in ('queued','retry');
alter table public.operations_personnel_source_bindings enable row level security;
alter table public.operations_personnel_target_bindings enable row level security;
alter table public.operations_personnel_transport_routes enable row level security;
alter table public.operations_personnel_cost_outbox enable row level security;
revoke all on public.operations_personnel_source_bindings,public.operations_personnel_target_bindings,
  public.operations_personnel_transport_routes,public.operations_personnel_cost_outbox from public,anon,authenticated;
grant select,insert,update on public.operations_personnel_source_bindings,public.operations_personnel_transport_routes to service_role;
grant select,insert on public.operations_personnel_target_bindings to service_role;
grant select,insert,update on public.operations_personnel_cost_outbox to service_role;
create trigger operations_personnel_target_append_only before update or delete on public.operations_personnel_target_bindings
  for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_target_no_truncate before truncate on public.operations_personnel_target_bindings
  for each statement execute function public.operations_personnel_evidence_immutable();
create function public.operations_personnel_outbox_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op <> 'UPDATE' then raise exception 'immutable_outbox' using errcode='22023'; end if;
  if (new.id,new.organization_id,new.source_time_stream_id,new.source_revision,new.raw_body,new.body_sha256,
    new.source_evidence,new.destination_organization_id,new.key_id,new.endpoint_url,new.created_at)
    is distinct from
    (old.id,old.organization_id,old.source_time_stream_id,old.source_revision,old.raw_body,old.body_sha256,
    old.source_evidence,old.destination_organization_id,old.key_id,old.endpoint_url,old.created_at)
    then raise exception 'immutable_outbox_payload' using errcode='22023'; end if;
  return new;
end; $$;
revoke all on function public.operations_personnel_outbox_immutable() from public,anon,authenticated;
create trigger operations_personnel_outbox_append_only before update or delete on public.operations_personnel_cost_outbox
  for each row execute function public.operations_personnel_outbox_immutable();
create trigger operations_personnel_outbox_no_truncate before truncate on public.operations_personnel_cost_outbox
  for each statement execute function public.operations_personnel_outbox_immutable();

-- Called only after authenticated Time read + raw hash verification + engine calculation.
-- The old publication RPC and the outbox insertion share this transaction. Every
-- new publication sequence is assigned from expected head+1, never a raw caller counter.
create function public.publish_operations_personnel_cost_outbox_v1(
  p_snapshot jsonb,p_raw_time_snapshot jsonb,p_source_evidence jsonb,
  p_expected_revision bigint,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_org uuid := (p_snapshot->>'organization_id')::uuid;
  v_worker uuid := (p_snapshot->>'worker_id')::uuid;
  v_stream text := p_snapshot->>'source_time_stream_id';
  v_route public.operations_personnel_transport_routes%rowtype;
  v_binding public.operations_personnel_source_bindings%rowtype;
  v_existing public.operations_personnel_cost_outbox%rowtype;
  v_line jsonb; v_block jsonb; v_target public.operations_personnel_target_bindings%rowtype;
  v_rate public.operations_personnel_rate_history%rowtype;
  v_result jsonb; v_body text; v_id uuid; v_review_seq bigint;
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991
    or jsonb_typeof(p_snapshot->'source_revision') is distinct from 'number'
    or (p_snapshot->>'source_revision')::numeric <> p_expected_revision+1
    then raise exception 'invalid_assigned_publication_revision' using errcode='22023'; end if;
  select * into v_binding from public.operations_personnel_source_bindings where organization_id=v_org and worker_id=v_worker and enabled;
  if not found then raise exception 'source_binding_not_enabled' using errcode='22023'; end if;
  if jsonb_typeof(p_source_evidence) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_source_evidence))<>11
    or not (p_source_evidence ?& array['schema','personnel_id','source_system','external_personnel_id','project_review_sequence',
      'project_review_status','raw_snapshot_sha256','persisted_sync_state','submission_state','submission_decision_sequence','raw_snapshot'])
    or v_binding.time_organization_id <> (p_raw_time_snapshot->>'organizationId')::uuid
    or v_binding.time_auth_worker_id <> (p_raw_time_snapshot->>'workerId')::uuid
    or p_source_evidence->>'personnel_id' is distinct from v_binding.time_personnel_id::text
    or p_source_evidence->>'source_system' is distinct from v_binding.time_source_system
    or p_source_evidence->>'external_personnel_id' is distinct from v_binding.external_personnel_id
    or p_source_evidence->>'schema' is distinct from 'operations-personnel-source-evidence-v1'
    or jsonb_typeof(p_source_evidence->'project_review_sequence') is distinct from 'number'
    or (p_source_evidence->>'project_review_sequence')::numeric not between 0 and 9007199254740991
    or mod((p_source_evidence->>'project_review_sequence')::numeric,1) <> 0
    or coalesce(p_source_evidence->>'raw_snapshot_sha256','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_source_evidence->'raw_snapshot') is distinct from 'string'
    or octet_length(p_source_evidence->>'raw_snapshot') > 1048576
    or encode(sha256(convert_to(p_source_evidence->>'raw_snapshot','UTF8')),'hex') is distinct from p_source_evidence->>'raw_snapshot_sha256'
    or (p_source_evidence->>'raw_snapshot')::jsonb is distinct from p_raw_time_snapshot
    or coalesce(p_source_evidence->>'project_review_status','') not in ('preliminary','confirmed','rejected')
    or p_source_evidence->>'persisted_sync_state' is distinct from 'synced'
    or coalesce(p_source_evidence->>'submission_state','') not in ('submitted','correction_requested','approved','locked','voided')
    or jsonb_typeof(p_source_evidence->'submission_decision_sequence') is distinct from 'number'
    or (p_source_evidence->>'submission_decision_sequence')::numeric not between 0 and 9007199254740991
    or mod((p_source_evidence->>'submission_decision_sequence')::numeric,1) <> 0
    then raise exception 'source_binding_evidence_mismatch' using errcode='22023'; end if;
  v_review_seq := (p_source_evidence->>'project_review_sequence')::numeric::bigint;
  select * into v_route from public.operations_personnel_transport_routes where organization_id=v_org;
  if not found then raise exception 'transport_route_not_enrolled' using errcode='22023'; end if;
  v_body := p_snapshot::text;
  if octet_length(v_body)>262144 then raise exception 'transport_body_too_large' using errcode='22023'; end if;
  -- An exact historical retry is acknowledged even after a later review/correction.
  if exists(select 1 from public.operations_personnel_cost_publications where organization_id=v_org and idempotency_key=p_idempotency_key) then
    v_result := public.publish_operations_personnel_cost_v1(p_snapshot,p_raw_time_snapshot,p_expected_revision,p_idempotency_key);
    select * into strict v_existing from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=v_stream
      and source_revision=(v_result->>'source_revision')::bigint;
    if v_existing.source_evidence <> p_source_evidence or v_existing.raw_body <> v_body then
      raise exception 'outbox_idempotency_conflict' using errcode='23505'; end if;
    return v_result || jsonb_build_object('outbox_id',v_existing.id,'body_sha256',v_existing.body_sha256);
  end if;
  -- Immutable allocation identity must exist in the actual frozen document.
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') loop
    select value into v_block from jsonb_array_elements(p_raw_time_snapshot->'blocks')
      where value->>'id'=v_line->>'source_time_line_id' and value->>'kind' in ('work','travel') and (value->>'durationMinutes')::numeric>0;
    if not found then raise exception 'allocation_not_in_frozen_time' using errcode='22023'; end if;
    select * into v_target from public.operations_personnel_target_bindings where organization_id=v_org
      and source_system=v_block#>>'{target,sourceSystem}' and target_kind=v_block#>>'{target,kind}'
      and external_id=v_block#>>'{target,externalId}' and target_version=v_block#>>'{target,version}';
    if not found or v_target.source_project_id <> (v_line->>'source_project_id')::uuid
      or v_target.source_booking_id is distinct from (v_line->>'source_booking_id')::uuid
      or v_target.currency is distinct from v_line->>'currency'
      or v_line->'minutes' is distinct from v_block->'durationMinutes'
      or v_line->>'status' is distinct from p_source_evidence->>'project_review_status'
      then raise exception 'allocation_binding_mismatch' using errcode='22023'; end if;
    if v_line->>'coverage'='complete' then
      select * into v_rate from public.operations_personnel_rate_history where organization_id=v_org and worker_id=v_worker
        and rate_revision=v_line->>'rate_revision' and category=v_block->>'kind' and currency=v_line->>'currency'
        and effective_from <= (p_snapshot->>'work_date')::date
        and (effective_to is null or (p_snapshot->>'work_date')::date<effective_to);
      if not found or v_rate.hourly_rate_minor <> (v_line->>'hourly_rate_minor')::bigint
        or floor(((v_line->>'minutes')::numeric*v_rate.hourly_rate_minor+30)/60) <> (v_line->>'amount_minor')::numeric
        then raise exception 'historical_rate_calculation_mismatch' using errcode='22023'; end if;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_raw_time_snapshot->'blocks') where value->>'kind' in ('work','travel') and (value->>'durationMinutes')::numeric>0)
    <> jsonb_array_length(p_snapshot->'lines') then raise exception 'incomplete_frozen_allocations' using errcode='22023'; end if;
  -- Serialize source review sequencing with the publication head (old RPC CAS).
  perform 1 from public.operations_personnel_cost_streams where organization_id=v_org and source_time_stream_id=v_stream for update;
  select * into v_existing from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=v_stream
    order by source_revision desc limit 1;
  if found and (v_existing.raw_body::jsonb->>'time_snapshot_version')::bigint=(p_snapshot->>'time_snapshot_version')::bigint
    and ((v_existing.source_evidence->>'project_review_sequence')::bigint > v_review_seq or
      (v_existing.source_evidence->>'submission_decision_sequence')::bigint > (p_source_evidence->>'submission_decision_sequence')::bigint)
    then return jsonb_build_object('status','stale_source_review','current_revision',v_existing.source_revision); end if;
  if found and (v_existing.raw_body::jsonb->>'time_snapshot_version')::bigint=(p_snapshot->>'time_snapshot_version')::bigint
    and (v_existing.source_evidence->>'project_review_sequence')::bigint=v_review_seq
    and (v_existing.source_evidence->>'submission_decision_sequence')::bigint=(p_source_evidence->>'submission_decision_sequence')::bigint
    and v_existing.source_evidence <> p_source_evidence then raise exception 'same_source_event_changed' using errcode='23505'; end if;
  v_result := public.publish_operations_personnel_cost_v1(p_snapshot,p_raw_time_snapshot,p_expected_revision,p_idempotency_key);
  if v_result->>'status' not in ('accepted','duplicate') then return v_result; end if;
  select * into v_existing from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=v_stream
    and source_revision=(v_result->>'source_revision')::bigint;
  if found then
    if v_existing.source_evidence <> p_source_evidence or v_existing.raw_body <> v_body then
      raise exception 'outbox_idempotency_conflict' using errcode='23505'; end if;
    return v_result || jsonb_build_object('outbox_id',v_existing.id,'body_sha256',v_existing.body_sha256);
  end if;
  insert into public.operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,
    source_evidence,destination_organization_id,key_id,endpoint_url)
    values(v_org,v_stream,(v_result->>'source_revision')::bigint,v_body,
      encode(sha256(convert_to(v_body,'UTF8')),'hex'),p_source_evidence,v_route.destination_organization_id,v_route.key_id,v_route.endpoint_url)
    returning id into v_id;
  return v_result || jsonb_build_object('outbox_id',v_id,'body_sha256',encode(sha256(convert_to(v_body,'UTF8')),'hex'));
end; $$;
revoke all on function public.publish_operations_personnel_cost_outbox_v1(jsonb,jsonb,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.publish_operations_personnel_cost_outbox_v1(jsonb,jsonb,jsonb,bigint,text) to service_role;

create function public.claim_operations_personnel_cost_outbox_v1(p_owner text,p_limit integer default 20,p_lease_seconds integer default 30)
returns setof public.operations_personnel_cost_outbox language plpgsql security invoker set search_path='' as $$
begin
  if p_owner is null or length(p_owner) not between 1 and 128 or p_owner<>btrim(p_owner)
    or p_limit is null or p_limit not between 1 and 100 or p_lease_seconds is null or p_lease_seconds not between 5 and 120
    then raise exception 'invalid_outbox_claim' using errcode='22023'; end if;
  return query with candidates as (
    select o.id from public.operations_personnel_cost_outbox o
    join public.operations_personnel_transport_routes r on r.organization_id=o.organization_id
      and r.enabled and r.key_id=o.key_id and r.endpoint_url=o.endpoint_url and r.destination_organization_id=o.destination_organization_id
    where o.state in ('queued','retry') and o.next_attempt_at<=clock_timestamp()
      and (o.lease_until is null or o.lease_until<=clock_timestamp())
    order by o.created_at,o.source_revision limit p_limit for update of o skip locked
  ) update public.operations_personnel_cost_outbox o set lease_owner=p_owner,lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1
    from candidates c where o.id=c.id returning o.*;
end; $$;
revoke all on function public.claim_operations_personnel_cost_outbox_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_operations_personnel_cost_outbox_v1(text,integer,integer) to service_role;

create function public.finish_operations_personnel_cost_outbox_v1(
  p_id uuid,p_owner text,p_lease_token uuid,p_outcome text,p_receipt jsonb default null,p_error text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row public.operations_personnel_cost_outbox%rowtype;
begin
  select * into v_row from public.operations_personnel_cost_outbox where id=p_id for update;
  if not found or p_owner is null or p_lease_token is null or v_row.lease_owner is null or v_row.lease_token is null
    or v_row.lease_until is null or v_row.state not in ('queued','retry') or v_row.lease_owner is distinct from p_owner
    or v_row.lease_token is distinct from p_lease_token or v_row.lease_until<=clock_timestamp()
    then return jsonb_build_object('status','lease_lost'); end if;
  if p_outcome is null or p_outcome not in ('delivered','superseded','retry','blocked')
    then raise exception 'invalid_outbox_outcome' using errcode='22023'; end if;
  if p_outcome in ('delivered','superseded') then
    if jsonb_typeof(p_receipt) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_receipt))<>13
      or not (p_receipt ?& array['schema','outcome','source_organization_id','source_time_stream_id','requested_source_revision',
        'applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint',
        'receipt_id','destination_organization_id','shadow_only'])
      or p_receipt->>'schema' is distinct from 'operations-personnel-cost-receipt-v1'
      or p_receipt->'shadow_only' is distinct from 'true'::jsonb
      or p_receipt->>'source_organization_id' is distinct from v_row.organization_id::text
      or p_receipt->>'source_time_stream_id' is distinct from v_row.source_time_stream_id
      or p_receipt->>'destination_organization_id' is distinct from v_row.destination_organization_id::text
      or p_receipt->>'request_body_sha256' is distinct from v_row.body_sha256
      or jsonb_typeof(p_receipt->'requested_source_revision') is distinct from 'number'
      or (p_receipt->>'requested_source_revision')::numeric <> v_row.source_revision
      or coalesce(p_receipt->>'snapshot_receipt_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(p_receipt->>'receipt_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(p_receipt->>'snapshot_fingerprint','') !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(p_receipt->'applied_source_revision') is distinct from 'number'
      or jsonb_typeof(p_receipt->'current_source_revision') is distinct from 'number'
      or (p_receipt->>'applied_source_revision')::numeric not between 1 and 9007199254740991
      or (p_receipt->>'current_source_revision')::numeric not between 1 and 9007199254740991
      or mod((p_receipt->>'applied_source_revision')::numeric,1)<>0
      or mod((p_receipt->>'current_source_revision')::numeric,1)<>0
      then raise exception 'unbound_outbox_receipt' using errcode='22023'; end if;
    if p_outcome='delivered' and (coalesce(p_receipt->>'outcome','') not in ('accepted','replayed')
      or (p_receipt->>'applied_source_revision')::bigint<>v_row.source_revision
      or (p_receipt->>'current_source_revision')::bigint<v_row.source_revision)
      then raise exception 'inconsistent_delivered_receipt' using errcode='22023'; end if;
    if p_outcome='superseded' and (p_receipt->>'outcome' is distinct from 'stale'
      or (p_receipt->>'applied_source_revision')::bigint<>(p_receipt->>'current_source_revision')::bigint
      or (p_receipt->>'current_source_revision')::bigint<=v_row.source_revision)
      then raise exception 'inconsistent_stale_receipt' using errcode='22023'; end if;
  elsif p_receipt is not null then raise exception 'retry_cannot_ack' using errcode='22023'; end if;
  update public.operations_personnel_cost_outbox set state=p_outcome,receipt=p_receipt,
    last_error=left(p_error,200),lease_owner=null,lease_token=null,lease_until=null,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,power(2,least(attempts,11))::integer)),
    finished_at=case when p_outcome in ('delivered','superseded','blocked') then clock_timestamp() else null end
    where id=p_id;
  return jsonb_build_object('status',p_outcome);
end; $$;
revoke all on function public.finish_operations_personnel_cost_outbox_v1(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_operations_personnel_cost_outbox_v1(uuid,text,uuid,text,jsonb,text) to service_role;
