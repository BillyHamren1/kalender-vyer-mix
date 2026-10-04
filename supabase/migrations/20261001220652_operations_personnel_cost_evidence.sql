-- Additive shadow evidence only. No legacy cost reader/writer is replaced.
-- Never apply to production until isolated SQL/RLS/advisor and runtime gates pass.

create table public.operations_personnel_rate_history (
  organization_id uuid not null,
  worker_id uuid not null,
  rate_revision text not null check (length(rate_revision) between 1 and 200),
  category text not null check (category in ('work','travel')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  hourly_rate_minor bigint not null check (hourly_rate_minor between 0 and 9007199254740991),
  effective_from date not null,
  effective_to date check (effective_to is null or effective_to > effective_from),
  source_reference text not null check (length(source_reference) > 0),
  created_at timestamptz not null default now(),
  primary key (organization_id, worker_id, rate_revision)
);
create index operations_personnel_rate_history_lookup
  on public.operations_personnel_rate_history (organization_id, worker_id, category, currency, effective_from);

create table public.operations_personnel_cost_streams (
  organization_id uuid not null,
  source_time_stream_id text not null check (length(source_time_stream_id) between 1 and 256),
  worker_id uuid not null,
  work_date date not null,
  time_organization_id uuid not null,
  time_auth_worker_id uuid not null,
  current_revision bigint not null default 0 check (current_revision between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, source_time_stream_id),
  unique (organization_id, worker_id, work_date)
);
create table public.operations_personnel_cost_publications (
  organization_id uuid not null,
  source_time_stream_id text not null,
  source_revision bigint not null check (source_revision between 1 and 9007199254740991),
  source_time_report_id uuid not null,
  time_snapshot_version bigint not null check (time_snapshot_version between 1 and 9007199254740991),
  source_snapshot_hash text not null check (source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (length(idempotency_key) between 12 and 200),
  -- jsonb equality binds each retry to the exact complete payload + raw evidence.
  cost_snapshot jsonb not null check (jsonb_typeof(cost_snapshot) = 'object'),
  raw_time_snapshot jsonb not null check (jsonb_typeof(raw_time_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (organization_id, source_time_stream_id, source_revision),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, source_time_stream_id)
    references public.operations_personnel_cost_streams (organization_id, source_time_stream_id)
);

alter table public.operations_personnel_rate_history enable row level security;
alter table public.operations_personnel_cost_streams enable row level security;
alter table public.operations_personnel_cost_publications enable row level security;
revoke all on public.operations_personnel_rate_history, public.operations_personnel_cost_streams,
  public.operations_personnel_cost_publications from public, anon, authenticated;
grant select, insert on public.operations_personnel_rate_history to service_role;
grant select, insert, update on public.operations_personnel_cost_streams to service_role;
grant select, insert on public.operations_personnel_cost_publications to service_role;

create function public.operations_personnel_evidence_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'operations_personnel_evidence_is_append_only' using errcode = '55000';
end;
$$;
revoke all on function public.operations_personnel_evidence_immutable() from public, anon, authenticated;
create trigger operations_personnel_rate_append_only before update or delete
  on public.operations_personnel_rate_history for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_publication_append_only before update or delete
  on public.operations_personnel_cost_publications for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_rate_no_truncate before truncate
  on public.operations_personnel_rate_history for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_personnel_publication_no_truncate before truncate
  on public.operations_personnel_cost_publications for each statement execute function public.operations_personnel_evidence_immutable();

-- Source authorization/hash verification happens in the Operations-only service:
-- read immutable Time snapshot -> verify canonical SHA/id -> resolve exact tenant,
-- worker/project bindings -> read rates at work date -> engine calculation.
-- This RPC adds atomic publication order/idempotency and saved-rate review safety.
-- p_expected_revision is CAS state read by that service, never accepted from UI.
create function public.publish_operations_personnel_cost_v1(
  p_snapshot jsonb,
  p_raw_time_snapshot jsonb,
  p_expected_revision bigint,
  p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_stream text;
  v_worker uuid;
  v_work_date date;
  v_source_revision bigint;
  v_time_version bigint;
  v_head public.operations_personnel_cost_streams%rowtype;
  v_previous public.operations_personnel_cost_publications%rowtype;
  v_retry public.operations_personnel_cost_publications%rowtype;
  v_old_economics jsonb;
  v_new_economics jsonb;
  v_line jsonb;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot->>'schema_version' is distinct from 'operations-personnel-cost-v1'
    or jsonb_typeof(p_snapshot->'lines') is distinct from 'array'
    or jsonb_typeof(p_raw_time_snapshot) is distinct from 'object'
    or length(p_idempotency_key) not between 12 and 200
    or p_idempotency_key is null
    or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740990
    then raise exception 'invalid_personnel_publication' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(p_snapshot)) <> 11
    or jsonb_array_length(p_snapshot->'lines') > 1000
    or exists (select 1 from jsonb_object_keys(p_snapshot) k where k not in
      ('schema_version','organization_id','source_time_stream_id','source_time_report_id','source_revision',
       'time_snapshot_version','source_snapshot_hash','worker_id','work_date','calculation_version','lines'))
    or jsonb_typeof(p_snapshot->'source_revision') is distinct from 'number'
    or jsonb_typeof(p_snapshot->'time_snapshot_version') is distinct from 'number'
    or (p_snapshot->>'source_revision')::numeric not between 1 and 9007199254740991
    or mod((p_snapshot->>'source_revision')::numeric,1) <> 0
    or (p_snapshot->>'time_snapshot_version')::numeric not between 1 and 9007199254740991
    or mod((p_snapshot->>'time_snapshot_version')::numeric,1) <> 0
    or coalesce(p_snapshot->>'organization_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_snapshot->>'worker_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_snapshot->>'source_time_report_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_snapshot->>'source_snapshot_hash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_snapshot->>'work_date','') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_snapshot->'source_time_stream_id') is distinct from 'string'
    or length(coalesce(p_snapshot->>'source_time_stream_id','')) not between 1 and 256
    or btrim(p_snapshot->>'source_time_stream_id') is distinct from p_snapshot->>'source_time_stream_id'
    or jsonb_typeof(p_snapshot->'calculation_version') is distinct from 'string'
    or length(btrim(coalesce(p_snapshot->>'calculation_version',''))) not between 1 and 200
    or btrim(p_snapshot->>'calculation_version') is distinct from p_snapshot->>'calculation_version'
    or jsonb_typeof(p_raw_time_snapshot->'version') is distinct from 'number'
    or (p_raw_time_snapshot->>'version')::numeric not between 1 and 9007199254740991
    or mod((p_raw_time_snapshot->>'version')::numeric,1) <> 0
    or coalesce(p_raw_time_snapshot->>'workDate','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_raw_time_snapshot->>'organizationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_raw_time_snapshot->>'workerId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'invalid_personnel_publication_shape' using errcode='22023'; end if;
  v_org := (p_snapshot->>'organization_id')::uuid;
  v_stream := p_snapshot->>'source_time_stream_id';
  v_worker := (p_snapshot->>'worker_id')::uuid;
  v_work_date := (p_snapshot->>'work_date')::date;
  v_source_revision := (p_snapshot->>'source_revision')::numeric::bigint;
  v_time_version := (p_snapshot->>'time_snapshot_version')::numeric::bigint;
  if v_org is null or v_worker is null or v_work_date is null
    or v_stream is null or length(v_stream) not between 1 and 256
    or v_source_revision is null or v_source_revision <> p_expected_revision + 1
    or v_time_version is null or v_time_version < 1
    or p_raw_time_snapshot->>'schemaVersion' is distinct from 'day-submission.v1'
    or p_raw_time_snapshot->>'status' is distinct from 'submitted'
    or p_raw_time_snapshot->>'syncState' is distinct from 'synced'
    or p_raw_time_snapshot#>>'{attestation,confirmedByWorker}' is distinct from 'true'
    or p_raw_time_snapshot->>'snapshotHash' is distinct from p_snapshot->>'source_snapshot_hash'
    or p_raw_time_snapshot->>'id' is distinct from p_snapshot->>'source_time_report_id'
    or (p_raw_time_snapshot->>'version')::numeric::bigint is distinct from v_time_version
    or (p_raw_time_snapshot->>'workDate')::date is distinct from v_work_date
    then raise exception 'source_snapshot_identity_mismatch' using errcode='22023'; end if;
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'invalid_cost_line' using errcode='22023'; end if;
    if (select count(*) from jsonb_object_keys(v_line)) <> 10
      or exists (select 1 from jsonb_object_keys(v_line) k where k not in
        ('source_time_line_id','source_project_id','source_booking_id','minutes','rate_revision',
         'hourly_rate_minor','amount_minor','currency','status','coverage'))
      or jsonb_typeof(v_line->'minutes') is distinct from 'number'
      or (v_line->>'minutes')::numeric not between 0 and 9007199254740991
      or mod((v_line->>'minutes')::numeric,1) <> 0
      or coalesce(v_line->>'source_project_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_line->'source_booking_id' <> 'null'::jsonb and coalesce(v_line->>'source_booking_id','') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or jsonb_typeof(v_line->'source_time_line_id') is distinct from 'string'
      or length(coalesce(v_line->>'source_time_line_id','')) not between 1 and 256
      or btrim(v_line->>'source_time_line_id') is distinct from v_line->>'source_time_line_id'
      then raise exception 'invalid_cost_line_shape' using errcode='22023'; end if;
    if coalesce(v_line->>'status','') not in ('preliminary','confirmed','rejected')
      or coalesce(v_line->>'coverage','') not in ('complete','missing_rate')
      or coalesce(v_line->>'currency','') !~ '^[A-Z]{3}$'
      or v_line->>'minutes' is null
      or (v_line->>'minutes')::numeric::bigint not between 0 and 9007199254740991
      or v_line->>'source_project_id' is null or v_line->>'source_time_line_id' is null
      then raise exception 'invalid_cost_line' using errcode='22023'; end if;
    if v_line->>'coverage'='missing_rate' and
      (v_line->'rate_revision' is distinct from 'null'::jsonb
       or v_line->'hourly_rate_minor' is distinct from 'null'::jsonb
       or v_line->'amount_minor' is distinct from 'null'::jsonb)
      then raise exception 'missing_rate_must_be_null' using errcode='22023'; end if;
    if v_line->>'coverage'='complete' and
      (jsonb_typeof(v_line->'rate_revision') is distinct from 'string'
       or length(btrim(coalesce(v_line->>'rate_revision',''))) not between 1 and 200
       or btrim(v_line->>'rate_revision') is distinct from v_line->>'rate_revision'
       or jsonb_typeof(v_line->'hourly_rate_minor') is distinct from 'number'
       or jsonb_typeof(v_line->'amount_minor') is distinct from 'number'
       or (v_line->>'hourly_rate_minor')::numeric not between 0 and 9007199254740991
       or mod((v_line->>'hourly_rate_minor')::numeric,1) <> 0
       or (v_line->>'amount_minor')::numeric not between 0 and 9007199254740991
       or mod((v_line->>'amount_minor')::numeric,1) <> 0
       or coalesce(v_line->>'rate_revision','')='' or v_line->>'hourly_rate_minor' is null
       or v_line->>'amount_minor' is null
       or (v_line->>'hourly_rate_minor')::numeric::bigint not between 0 and 9007199254740991
       or (v_line->>'amount_minor')::numeric::bigint not between 0 and 9007199254740991)
      then raise exception 'complete_cost_is_invalid' using errcode='22023'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_snapshot->'lines')) <>
    (select count(distinct value->>'source_time_line_id') from jsonb_array_elements(p_snapshot->'lines'))
    then raise exception 'duplicate_cost_line' using errcode='23505'; end if;
  insert into public.operations_personnel_cost_streams
    (organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id)
    values (v_org,v_stream,v_worker,v_work_date,
      (p_raw_time_snapshot->>'organizationId')::uuid,(p_raw_time_snapshot->>'workerId')::uuid)
    on conflict (organization_id,source_time_stream_id) do nothing;
  select * into strict v_head from public.operations_personnel_cost_streams
    where organization_id=v_org and source_time_stream_id=v_stream for update;
  if v_head.worker_id <> v_worker or v_head.work_date <> v_work_date
    or v_head.time_organization_id <> (p_raw_time_snapshot->>'organizationId')::uuid
    or v_head.time_auth_worker_id <> (p_raw_time_snapshot->>'workerId')::uuid
    then raise exception 'stream_identity_mismatch' using errcode='22023'; end if;
  select * into v_retry from public.operations_personnel_cost_publications
    where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if v_retry.source_time_stream_id <> v_stream or v_retry.cost_snapshot <> p_snapshot
      or v_retry.raw_time_snapshot <> p_raw_time_snapshot
      then raise exception 'idempotency_payload_conflict' using errcode='23505'; end if;
    return jsonb_build_object('status','duplicate','source_revision',v_retry.source_revision,
      'current_revision',v_head.current_revision);
  end if;
  if v_head.current_revision <> p_expected_revision then
    return jsonb_build_object('status','stale','current_revision',v_head.current_revision);
  end if;
  if v_head.current_revision > 0 then
    select * into strict v_previous from public.operations_personnel_cost_publications
      where organization_id=v_org and source_time_stream_id=v_stream and source_revision=v_head.current_revision;
    if v_time_version < v_previous.time_snapshot_version then
      return jsonb_build_object('status','stale_time_snapshot','current_revision',v_head.current_revision);
    end if;
    if v_time_version = v_previous.time_snapshot_version then
      if v_previous.source_time_report_id <> (p_snapshot->>'source_time_report_id')::uuid
        or v_previous.source_snapshot_hash <> p_snapshot->>'source_snapshot_hash'
        or v_previous.raw_time_snapshot <> p_raw_time_snapshot
        then raise exception 'same_time_version_changed' using errcode='23505'; end if;
      select coalesce(jsonb_agg(value - 'status' order by value->>'source_time_line_id'),'[]'::jsonb)
        into v_old_economics from jsonb_array_elements(v_previous.cost_snapshot->'lines');
      select coalesce(jsonb_agg(value - 'status' order by value->>'source_time_line_id'),'[]'::jsonb)
        into v_new_economics from jsonb_array_elements(p_snapshot->'lines');
      if v_old_economics <> v_new_economics
        or p_snapshot->>'calculation_version' is distinct from v_previous.cost_snapshot->>'calculation_version'
        then raise exception 'review_changed_saved_calculation' using errcode='23505'; end if;
    end if;
  end if;
  insert into public.operations_personnel_cost_publications
    (organization_id,source_time_stream_id,source_revision,source_time_report_id,time_snapshot_version,
     source_snapshot_hash,idempotency_key,cost_snapshot,raw_time_snapshot)
    values (v_org,v_stream,v_source_revision,(p_snapshot->>'source_time_report_id')::uuid,v_time_version,
      p_snapshot->>'source_snapshot_hash',p_idempotency_key,p_snapshot,p_raw_time_snapshot);
  update public.operations_personnel_cost_streams set current_revision=v_source_revision,updated_at=now()
    where organization_id=v_org and source_time_stream_id=v_stream;
  return jsonb_build_object('status','accepted','source_revision',v_source_revision,
    'source_time_report_id',p_snapshot->>'source_time_report_id','time_snapshot_version',v_time_version);
end;
$$;
revoke all on function public.publish_operations_personnel_cost_v1(jsonb,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.publish_operations_personnel_cost_v1(jsonb,jsonb,bigint,text) to service_role;

-- Complete current publication; never aggregate old+new source revisions.
create view public.operations_personnel_cost_current with (security_invoker=true) as
  select p.* from public.operations_personnel_cost_publications p
  join public.operations_personnel_cost_streams s using (organization_id,source_time_stream_id)
  where p.source_revision=s.current_revision;
revoke all on public.operations_personnel_cost_current from public,anon,authenticated;
grant select on public.operations_personnel_cost_current to service_role;

-- Rollback: stop new boundary/export consumer before removing these unused shadow
-- objects. Preserve exported evidence; do not delete publications to revert totals.
