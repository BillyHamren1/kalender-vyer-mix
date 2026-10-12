-- DORMANT DRAFT: apply only after TEXT, accepted transport and both metadata v2 overrides.
-- No enrollment, secrets, caller grants or activation. Canonical implementations
-- are moved behind fixed-owner-only ports; original function OIDs stay facades.
-- Ownership fence domain: hashtextextended('eventflow:personnel-accepted-ownership:v1',0).
-- Writers hold SHARED before row locks, provisioning holds EXCLUSIVE first.
-- Never implicitly enroll inside publication; never upgrade a normal writer lock.
create table operations_economy_private.personnel_accepted_workers_v1 (
 organization_id uuid not null,worker_id uuid not null,issuer_id uuid not null,enrollment_epoch uuid not null,
 enabled boolean not null default false,source_binding jsonb not null,primary key(organization_id,worker_id),
 foreign key(issuer_id,enrollment_epoch) references operations_economy_private.personnel_issuers_v1
);
revoke all on operations_economy_private.personnel_accepted_workers_v1 from public,anon,authenticated,service_role;
alter table operations_economy_private.personnel_accepted_workers_v1 enable row level security;
create function operations_economy_private.personnel_ownership_read_lock_v1() returns void
language sql volatile security invoker set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('eventflow:personnel-accepted-ownership:v1',0))
$$;
revoke all on function operations_economy_private.personnel_ownership_read_lock_v1() from public,anon;
grant execute on function operations_economy_private.personnel_ownership_read_lock_v1() to authenticated,service_role;
create function operations_economy_private.personnel_ownership_statement_v1() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if tg_argv[0]='exclusive' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('eventflow:personnel-accepted-ownership:v1',0));
 else perform operations_economy_private.personnel_ownership_read_lock_v1();end if;
 return null;
end;$$;
revoke all on function operations_economy_private.personnel_ownership_statement_v1() from public,anon,authenticated,service_role;
create trigger personnel_worker_ownership_statement before insert or update or delete or truncate on operations_economy_private.personnel_accepted_workers_v1 for each statement execute function operations_economy_private.personnel_ownership_statement_v1('exclusive');
create trigger personnel_stream_ownership_statement before insert or update or delete or truncate on operations_economy_private.personnel_issuer_streams_v1 for each statement execute function operations_economy_private.personnel_ownership_statement_v1('exclusive');
create function operations_economy_private.personnel_worker_ownership_immutable_v1() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op<>'UPDATE' then raise exception 'accepted_worker_ownership_permanent' using errcode='42501';end if;
 if (new.organization_id,new.worker_id,new.issuer_id,new.enrollment_epoch,new.source_binding) is distinct from (old.organization_id,old.worker_id,old.issuer_id,old.enrollment_epoch,old.source_binding) then raise exception 'accepted_worker_ownership_immutable' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function operations_economy_private.personnel_worker_ownership_immutable_v1() from public,anon,authenticated,service_role;
create trigger personnel_worker_ownership_immutable before update or delete on operations_economy_private.personnel_accepted_workers_v1 for each row execute function operations_economy_private.personnel_worker_ownership_immutable_v1();
create trigger personnel_worker_ownership_no_truncate before truncate on operations_economy_private.personnel_accepted_workers_v1 for each statement execute function operations_economy_private.personnel_worker_ownership_immutable_v1();

-- Provisioning is owner-only. Freeze actual source identity before any day exists;
-- arbitrary later source-binding changes cannot create a legacy namespace.
create function operations_economy_private.capture_personnel_worker_binding_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.operations_personnel_source_bindings%rowtype;
begin
 select * into b from public.operations_personnel_source_bindings where organization_id=new.organization_id and worker_id=new.worker_id for share;
 if not found or not b.enabled or not exists(select 1 from operations_economy_private.personnel_issuers_v1 where issuer_id=new.issuer_id and enrollment_epoch=new.enrollment_epoch and organization_id=new.organization_id)
 then raise exception 'accepted_worker_provisioning_binding_invalid' using errcode='42501';end if;
 new.source_binding:=to_jsonb(b);return new;
end;$$;
revoke all on function operations_economy_private.capture_personnel_worker_binding_v1() from public,anon,authenticated,service_role;
create trigger personnel_worker_capture_binding before insert on operations_economy_private.personnel_accepted_workers_v1 for each row execute function operations_economy_private.capture_personnel_worker_binding_v1();

-- Predicate intentionally uses persisted worker/head/enrollment, never the current
-- enabled source binding alone: rebinding or disabling cannot turn accepted legacy.
create function operations_economy_private.personnel_accepted_owned_v1(p_org uuid,p_worker uuid,p_stream text)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 return exists(select 1 from operations_economy_private.personnel_accepted_workers_v1 w where w.organization_id=p_org and
  (w.worker_id=p_worker or left(p_stream,length(concat_ws(':','time',w.source_binding->>'time_organization_id',w.source_binding->>'time_personnel_id')||':'))=concat_ws(':','time',w.source_binding->>'time_organization_id',w.source_binding->>'time_personnel_id')||':' or exists(select 1 from public.operations_personnel_cost_streams s where s.organization_id=p_org and s.source_time_stream_id=p_stream and s.worker_id=w.worker_id)))
 or exists(select 1 from operations_economy_private.personnel_issuer_streams_v1 f join operations_economy_private.personnel_issuers_v1 i using(issuer_id,enrollment_epoch)
  where i.organization_id=p_org and (f.source_stream_id=p_stream or (f.source_binding->>'worker_id')::uuid=p_worker or left(p_stream,length(concat_ws(':','time',f.source_binding->>'time_organization_id',f.source_binding->>'time_personnel_id')||':'))=concat_ws(':','time',f.source_binding->>'time_organization_id',f.source_binding->>'time_personnel_id')||':'))
 or exists(select 1 from public.operations_personnel_cost_streams s join operations_economy_private.personnel_accepted_workers_v1 w on w.organization_id=s.organization_id and (w.source_binding->>'time_organization_id')::uuid=s.time_organization_id and (w.source_binding->>'time_auth_worker_id')::uuid=s.time_auth_worker_id where s.organization_id=p_org and s.source_time_stream_id=p_stream)
 or exists(select 1 from public.operations_personnel_cost_streams s join operations_economy_private.personnel_issuer_streams_v1 f on (f.source_binding->>'time_organization_id')::uuid=s.time_organization_id and (f.source_binding->>'time_auth_worker_id')::uuid=s.time_auth_worker_id join operations_economy_private.personnel_issuers_v1 i using(issuer_id,enrollment_epoch) where i.organization_id=p_org and s.organization_id=p_org and s.source_time_stream_id=p_stream)
 or exists(select 1 from operations_economy_private.personnel_accepted_issuances_v1 m join public.operations_personnel_cost_outbox o on o.id=m.outbox_id
  where o.organization_id=p_org and o.source_time_stream_id=p_stream);
end;$$;
revoke all on function operations_economy_private.personnel_accepted_owned_v1(uuid,uuid,text) from public,anon;
grant execute on function operations_economy_private.personnel_accepted_owned_v1(uuid,uuid,text) to authenticated,service_role;
create function operations_economy_private.assert_personnel_legacy_v1(p_org uuid,p_worker uuid,p_stream text)
returns void language plpgsql security definer set search_path='' as $$begin
 if operations_economy_private.personnel_accepted_owned_v1(p_org,p_worker,p_stream) then raise exception 'accepted_worker_requires_verified_issuer' using errcode='42501';end if;
end;$$;
revoke all on function operations_economy_private.assert_personnel_legacy_v1(uuid,uuid,text) from public,anon;
grant execute on function operations_economy_private.assert_personnel_legacy_v1(uuid,uuid,text) to authenticated,service_role;

-- Direct rows cannot alias a frozen Time identity by changing worker/stream text.
create function operations_economy_private.assert_personnel_legacy_source_v1(p_org uuid,p_time_org uuid,p_time_auth uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 if exists(select 1 from operations_economy_private.personnel_accepted_workers_v1 w where w.organization_id=p_org and (w.source_binding->>'time_organization_id')::uuid=p_time_org and (w.source_binding->>'time_auth_worker_id')::uuid=p_time_auth)
 or exists(select 1 from operations_economy_private.personnel_issuer_streams_v1 f join operations_economy_private.personnel_issuers_v1 i using(issuer_id,enrollment_epoch) where i.organization_id=p_org and (f.source_binding->>'time_organization_id')::uuid=p_time_org and (f.source_binding->>'time_auth_worker_id')::uuid=p_time_auth)
 then raise exception 'accepted_worker_requires_verified_issuer' using errcode='42501';end if;
end;$$;
revoke all on function operations_economy_private.assert_personnel_legacy_source_v1(uuid,uuid,uuid) from public,anon;
grant execute on function operations_economy_private.assert_personnel_legacy_source_v1(uuid,uuid,uuid) to authenticated,service_role;

-- Invoker trigger preserves real DML role. Its definer predicate only reads and
-- locks; no caller flag or supplied owner name can authorize writes.
create function public.operations_personnel_accepted_write_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$
declare j jsonb;v_owner name;
begin
 select pg_catalog.pg_get_userbyid(c.relowner) into strict v_owner from pg_catalog.pg_class c where c.oid='operations_economy_private.personnel_accepted_workers_v1'::regclass;
 if current_user=v_owner then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op='TRUNCATE' then raise exception 'personnel_truncate_owner_required' using errcode='42501';end if;
 if tg_op in ('UPDATE','DELETE') then
  j:=to_jsonb(old);perform operations_economy_private.assert_personnel_legacy_source_v1((j->>'organization_id')::uuid,coalesce(j->>'time_organization_id',j#>>'{raw_time_snapshot,organizationId}')::uuid,coalesce(j->>'time_auth_worker_id',j#>>'{raw_time_snapshot,workerId}')::uuid);perform operations_economy_private.assert_personnel_legacy_v1((j->>'organization_id')::uuid,coalesce(j->>'worker_id',j#>>'{cost_snapshot,worker_id}',(j->>'raw_body')::jsonb->>'worker_id')::uuid,j->>'source_time_stream_id');
 end if;
 if tg_op in ('INSERT','UPDATE') then
  j:=to_jsonb(new);perform operations_economy_private.assert_personnel_legacy_source_v1((j->>'organization_id')::uuid,coalesce(j->>'time_organization_id',j#>>'{raw_time_snapshot,organizationId}')::uuid,coalesce(j->>'time_auth_worker_id',j#>>'{raw_time_snapshot,workerId}')::uuid);perform operations_economy_private.assert_personnel_legacy_v1((j->>'organization_id')::uuid,coalesce(j->>'worker_id',j#>>'{cost_snapshot,worker_id}',(j->>'raw_body')::jsonb->>'worker_id')::uuid,j->>'source_time_stream_id');
 end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function public.operations_personnel_accepted_write_guard_v1() from public,anon,authenticated,service_role;
create trigger accepted_ownership_statement before insert or update or delete or truncate on public.operations_personnel_cost_streams for each statement execute function operations_economy_private.personnel_ownership_statement_v1('shared');
create trigger accepted_ownership_row before insert or update or delete on public.operations_personnel_cost_streams for each row execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_truncate before truncate on public.operations_personnel_cost_streams for each statement execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_statement before insert or update or delete or truncate on public.operations_personnel_cost_publications for each statement execute function operations_economy_private.personnel_ownership_statement_v1('shared');
create trigger accepted_ownership_row before insert or update or delete on public.operations_personnel_cost_publications for each row execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_truncate before truncate on public.operations_personnel_cost_publications for each statement execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_statement before insert or update or delete or truncate on public.operations_personnel_cost_outbox for each statement execute function operations_economy_private.personnel_ownership_statement_v1('shared');
create trigger accepted_ownership_row before insert or update or delete on public.operations_personnel_cost_outbox for each row execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_truncate before truncate on public.operations_personnel_cost_outbox for each statement execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_statement before insert or update or delete or truncate on public.operations_personnel_project_publication_links for each statement execute function operations_economy_private.personnel_ownership_statement_v1('shared');
create trigger accepted_ownership_row before insert or update or delete on public.operations_personnel_project_publication_links for each row execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_truncate before truncate on public.operations_personnel_project_publication_links for each statement execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_statement before insert or update or delete or truncate on public.operations_personnel_project_publication_proofs for each statement execute function operations_economy_private.personnel_ownership_statement_v1('shared');
create trigger accepted_ownership_row before insert or update or delete on public.operations_personnel_project_publication_proofs for each row execute function public.operations_personnel_accepted_write_guard_v1();
create trigger accepted_ownership_truncate before truncate on public.operations_personnel_project_publication_proofs for each statement execute function public.operations_personnel_accepted_write_guard_v1();

-- Canonical donor: scripts/internal-projects/personnel-text-booking.sql; only function name/callees/owner-only invoker boundary change.
create or replace function operations_economy_private.canonical_personnel_cost_v1(
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
      or (v_line->'source_booking_id' is distinct from 'null'::jsonb and
        (jsonb_typeof(v_line->'source_booking_id') is distinct from 'string'
         or octet_length(v_line->>'source_booking_id') not between 1 and 256))
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
revoke all on function operations_economy_private.canonical_personnel_cost_v1(jsonb,jsonb,bigint,text) from public,anon,authenticated,service_role;

-- Canonical donor: supabase/migrations/20261001234356_operations_personnel_project_review_publications.sql; only function name/callees/owner-only invoker boundary change.
create function operations_economy_private.canonical_personnel_proofs_v1(
  p_snapshot jsonb,p_proofs jsonb,p_previous_revision bigint,p_event_kind text,p_actor uuid,p_project uuid,p_review_sequence bigint,p_key text
) returns void language plpgsql security invoker set search_path='' as $$
declare v_proof jsonb; v_org uuid:=(p_snapshot->>'organization_id')::uuid; v_stream text:=p_snapshot->>'source_time_stream_id';
  v_revision bigint:=(p_snapshot->>'source_revision')::bigint;
begin
  insert into public.operations_personnel_project_publication_links(organization_id,source_time_stream_id,source_revision,previous_source_revision,
    event_kind,actor_system_user_id,trigger_project_id,trigger_review_sequence,idempotency_key)
    values(v_org,v_stream,v_revision,p_previous_revision,p_event_kind,p_actor,p_project,p_review_sequence,p_key);
  for v_proof in select value from jsonb_array_elements(p_proofs) loop
    insert into public.operations_personnel_project_publication_proofs(organization_id,source_time_stream_id,source_revision,project_id,
      source_snapshot_hash,time_snapshot_version,source_time_line_ids,economics_fingerprint,review_event_id,review_sequence,economics_match,applied_status,invalidation_reason)
    values(v_org,v_stream,v_revision,(v_proof->>'project_id')::uuid,v_proof->>'source_snapshot_hash',(v_proof->>'time_snapshot_version')::bigint,
      v_proof->'source_time_line_ids',v_proof->>'economics_fingerprint',(v_proof->>'review_event_id')::uuid,(v_proof->>'review_sequence')::bigint,
      (v_proof->>'economics_match')::boolean,v_proof->>'applied_status',v_proof->>'invalidation_reason');
  end loop;
end; $$;
revoke all on function operations_economy_private.canonical_personnel_proofs_v1(jsonb,jsonb,bigint,text,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;

-- Canonical donor: scripts/internal-projects/personnel-text-booking.sql; only function name/callees/owner-only invoker boundary change.
create or replace function operations_economy_private.canonical_personnel_ingress_v1(
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
  v_projection jsonb; v_snapshot jsonb; v_head bigint; v_retry public.operations_personnel_cost_publications%rowtype;
  v_old_lines jsonb; v_new_lines jsonb; v_same_time boolean;
begin
  -- Normalization must not repair a malformed producer envelope. Status is
  -- required as a wire field but carries no authority for the derived result.
  if jsonb_typeof(p_snapshot) is distinct from 'object' or jsonb_typeof(p_snapshot->'lines') is distinct from 'array'
    or (select count(*) from jsonb_object_keys(p_snapshot))<>11 or not (p_snapshot ?& array[
      'schema_version','organization_id','source_time_stream_id','source_time_report_id','source_revision',
      'time_snapshot_version','source_snapshot_hash','worker_id','work_date','calculation_version','lines'])
    or jsonb_array_length(p_snapshot->'lines')>1000
    then raise exception 'invalid_canonical_ingress_shape' using errcode='22023';end if;
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') loop
    if jsonb_typeof(v_line) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_line))<>10
      or not (v_line ?& array['source_time_line_id','source_project_id','source_booking_id','minutes','rate_revision',
        'hourly_rate_minor','amount_minor','currency','status','coverage'])
      or jsonb_typeof(v_line->'status') is distinct from 'string' or coalesce(v_line->>'status','') not in ('preliminary','confirmed','rejected')
      then raise exception 'invalid_canonical_ingress_line' using errcode='22023';end if;
  end loop;
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
  -- Check accepted provenance even on historical duplicate retries. An old shadow
  -- receipt must never be relabeled accepted merely by replaying its key.
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') where value->>'coverage'='complete' loop
    if not exists(select 1 from public.operations_personnel_accepted_rate_history_v1 r
      join lateral (select value b from jsonb_array_elements(p_raw_time_snapshot->'blocks')
        where value->>'id'=v_line->>'source_time_line_id') block on true
      where r.organization_id=v_org and r.worker_id=v_worker and r.rate_revision=v_line->>'rate_revision'
        and r.category=block.b->>'kind' and r.currency=v_line->>'currency'
        and r.effective_from <= (p_snapshot->>'work_date')::date
        and (r.effective_to is null or (p_snapshot->>'work_date')::date<r.effective_to)
        and to_jsonb(r.hourly_rate_minor)=v_line->'hourly_rate_minor') then
      raise exception 'accepted_rate_provenance_required' using errcode='22023';
    end if;
  end loop;
  v_review_seq := (p_source_evidence->>'project_review_sequence')::numeric::bigint;
  select * into v_route from public.operations_personnel_transport_routes where organization_id=v_org;
  if not found then raise exception 'transport_route_not_enrolled' using errcode='22023'; end if;
  -- Serialize first publication too, before reading project decisions. All review
  -- commands use this same stream row lock; no globally approved transient outbox.
  -- A malformed/stale first CAS must not create a persistent empty stream.
  if p_expected_revision>0 and not exists(select 1 from public.operations_personnel_cost_streams
    where organization_id=v_org and source_time_stream_id=v_stream) then
    return jsonb_build_object('status','stale','current_revision',0);end if;
  insert into public.operations_personnel_cost_streams(organization_id,source_time_stream_id,worker_id,work_date,time_organization_id,time_auth_worker_id)
    values(v_org,v_stream,v_worker,(p_snapshot->>'work_date')::date,v_binding.time_organization_id,v_binding.time_auth_worker_id)
    on conflict(organization_id,source_time_stream_id) do nothing;
  select current_revision into strict v_head from public.operations_personnel_cost_streams
    where organization_id=v_org and source_time_stream_id=v_stream for update;
  select * into v_retry from public.operations_personnel_cost_publications where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    select jsonb_agg(value-'status' order by ord) into v_old_lines from jsonb_array_elements(v_retry.cost_snapshot->'lines') with ordinality l(value,ord);
    select jsonb_agg(value-'status' order by ord) into v_new_lines from jsonb_array_elements(p_snapshot->'lines') with ordinality l(value,ord);
    select * into strict v_existing from public.operations_personnel_cost_outbox where organization_id=v_org
      and source_time_stream_id=v_retry.source_time_stream_id and source_revision=v_retry.source_revision;
    if v_retry.source_time_stream_id is distinct from v_stream or v_retry.source_revision<>p_expected_revision+1
      or (v_retry.cost_snapshot-'lines') is distinct from (p_snapshot-'lines') or v_old_lines is distinct from v_new_lines
      or v_retry.raw_time_snapshot is distinct from p_raw_time_snapshot or v_existing.source_evidence is distinct from p_source_evidence
      or not exists(select 1 from public.operations_personnel_project_publication_links where organization_id=v_org
        and source_time_stream_id=v_stream and source_revision=v_retry.source_revision and event_kind='time_ingress')
      then raise exception 'canonical_ingress_idempotency_conflict' using errcode='23505'; end if;
    perform operations_economy_private.assert_issued_publication_reviews_v1(v_org,v_stream,v_retry.source_revision);
    return jsonb_build_object('status','duplicate','source_revision',v_retry.source_revision,'outbox_id',v_existing.id,'body_sha256',v_existing.body_sha256);
  end if;
  if v_head<>p_expected_revision then return jsonb_build_object('status','stale','current_revision',v_head);end if;
  select * into v_existing from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=v_stream
    and source_revision=v_head;
  v_same_time:=found and (v_existing.raw_body::jsonb->>'time_snapshot_version')::bigint=(p_snapshot->>'time_snapshot_version')::bigint;
  -- Immutable allocation identity must exist in the actual frozen document.
  for v_line in select value from jsonb_array_elements(p_snapshot->'lines') loop
    select value into v_block from jsonb_array_elements(p_raw_time_snapshot->'blocks')
      where value->>'id'=v_line->>'source_time_line_id' and value->>'kind' in ('work','travel') and (value->>'durationMinutes')::numeric>0;
    if not found then raise exception 'allocation_not_in_frozen_time' using errcode='22023'; end if;
    select * into v_target from public.operations_personnel_target_bindings where organization_id=v_org
      and source_system=v_block#>>'{target,sourceSystem}' and target_kind=v_block#>>'{target,kind}'
      and external_id=v_block#>>'{target,externalId}' and target_version=v_block#>>'{target,version}';
    if not found or v_target.source_project_id <> (v_line->>'source_project_id')::uuid
      or v_target.source_booking_id is distinct from (v_line->>'source_booking_id')
      or v_target.currency is distinct from v_line->>'currency'
      or v_line->'minutes' is distinct from v_block->'durationMinutes'
      then raise exception 'allocation_binding_mismatch' using errcode='22023'; end if;
    if v_line->>'coverage'='complete' then
      select * into v_rate from public.operations_personnel_accepted_rate_history_v1 where organization_id=v_org and worker_id=v_worker
        and rate_revision=v_line->>'rate_revision' and category=v_block->>'kind' and currency=v_line->>'currency'
        and effective_from <= (p_snapshot->>'work_date')::date
        and (effective_to is null or (p_snapshot->>'work_date')::date<effective_to);
      if not found or v_rate.hourly_rate_minor <> (v_line->>'hourly_rate_minor')::bigint
        or floor(((v_line->>'minutes')::numeric*v_rate.hourly_rate_minor+30)/60) <> (v_line->>'amount_minor')::numeric
        then raise exception 'historical_rate_calculation_mismatch' using errcode='22023'; end if;
    elsif not coalesce(v_same_time,false) and exists(select 1 from public.operations_personnel_accepted_rate_history_v1
      where organization_id=v_org and worker_id=v_worker and category=v_block->>'kind' and currency=v_line->>'currency'
        and effective_from <= (p_snapshot->>'work_date')::date and (effective_to is null or (p_snapshot->>'work_date')::date<effective_to)) then
      raise exception 'missing_rate_has_resolved_history' using errcode='22023';
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
  -- Derive every project status from the Operations ledger BEFORE publishing.
  -- Time's whole-day project status remains immutable provenance only.
  v_projection:=operations_economy_private.derive_project_status_snapshot_v1(p_snapshot,p_source_evidence->>'submission_state',v_head+1);
  v_snapshot:=v_projection->'snapshot';v_body:=v_snapshot::text;
  if octet_length(v_body)>262144 then raise exception 'transport_body_too_large' using errcode='22023';end if;
  v_result:=operations_economy_private.canonical_personnel_cost_v1(v_snapshot,p_raw_time_snapshot,v_head,p_idempotency_key);
  if v_result->>'status' is distinct from 'accepted' then return v_result;end if;
  insert into public.operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,
    source_evidence,destination_organization_id,key_id,endpoint_url)
    values(v_org,v_stream,v_head+1,v_body,encode(sha256(convert_to(v_body,'UTF8')),'hex'),p_source_evidence,
      v_route.destination_organization_id,v_route.key_id,v_route.endpoint_url) returning id into v_id;
  perform operations_economy_private.canonical_personnel_proofs_v1(v_snapshot,v_projection->'proofs',v_head,'time_ingress',null,null,null,p_idempotency_key);
  return v_result||jsonb_build_object('outbox_id',v_id,'body_sha256',encode(sha256(convert_to(v_body,'UTF8')),'hex'));
end; $$;
revoke all on function operations_economy_private.canonical_personnel_ingress_v1(jsonb,jsonb,jsonb,bigint,text) from public,anon,authenticated,service_role;

-- Canonical donor: supabase/migrations/20261012165000_operations_personnel_review_issuance.sql; only function name/callees/owner-only invoker boundary change.
create or replace function operations_economy_private.canonical_personnel_reviews_v1(
  p_source_time_stream_id text,p_project_id uuid,p_expected_source_revision bigint,p_expected_review_sequence bigint,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_org uuid;v_actor uuid:=auth.uid();v_head bigint;v_source public.operations_personnel_cost_publications%rowtype;
  v_old_outbox public.operations_personnel_cost_outbox%rowtype;v_outbox public.operations_personnel_cost_outbox%rowtype;
  v_link public.operations_personnel_project_publication_links%rowtype;v_selected public.operations_project_personnel_reviews%rowtype;
  v_route public.operations_personnel_transport_routes%rowtype;v_projected jsonb;v_snapshot jsonb;v_receipt jsonb;v_body text;v_hash text;v_selected_ids jsonb;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
  if p_source_time_stream_id is null or p_source_time_stream_id<>btrim(p_source_time_stream_id) or length(p_source_time_stream_id) not between 1 and 256
    or p_expected_source_revision is null or p_expected_source_revision not between 1 and 9007199254740990
    or p_expected_review_sequence is null or p_expected_review_sequence not between 1 and 9007199254740991
    or p_idempotency_key is null or p_idempotency_key<>btrim(p_idempotency_key) or length(p_idempotency_key) not between 12 and 200
    then raise exception 'invalid_project_review_publication' using errcode='22023'; end if;
  select current_revision into v_head from public.operations_personnel_cost_streams where organization_id=v_org and source_time_stream_id=p_source_time_stream_id for update;
  if not found then raise exception 'source_stream_not_found' using errcode='22023'; end if;
  select * into v_link from public.operations_personnel_project_publication_links where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if v_link.event_kind<>'project_review' or v_link.source_time_stream_id<>p_source_time_stream_id or v_link.actor_system_user_id<>v_actor
      or v_link.trigger_project_id<>p_project_id or v_link.trigger_review_sequence<>p_expected_review_sequence or v_link.previous_source_revision<>p_expected_source_revision
      then raise exception 'project_publication_idempotency_conflict' using errcode='23505'; end if;
    select * into strict v_outbox from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_link.source_revision;
    perform operations_economy_private.assert_issued_publication_reviews_v1(v_org,p_source_time_stream_id,v_link.source_revision);
    perform operations_economy_private.assert_issued_frozen_rates_v1(cost_snapshot,raw_time_snapshot) from public.operations_personnel_cost_publications where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_link.source_revision;
    if not exists(select 1 from public.operations_issued_project_review_events_v1 where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and project_id=p_project_id and review_sequence=p_expected_review_sequence) then raise exception 'legacy_review_event_not_issued' using errcode='22023';end if;
    return jsonb_build_object('status','duplicate','source_revision',v_link.source_revision,'outbox_id',v_outbox.id,'body_sha256',v_outbox.body_sha256);
  end if;
  if v_head<>p_expected_source_revision then return jsonb_build_object('status','stale_source','current_source_revision',v_head); end if;
  select * into v_selected from public.operations_issued_project_review_events_v1 where organization_id=v_org and source_time_stream_id=p_source_time_stream_id
    and project_id=p_project_id order by review_sequence desc limit 1;
  if not found or v_selected.review_sequence<>p_expected_review_sequence then
    return jsonb_build_object('status','stale_review','current_review_sequence',coalesce(v_selected.review_sequence,0)); end if;
  select * into strict v_source from public.operations_personnel_cost_publications where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_head;
  perform operations_economy_private.assert_issued_frozen_rates_v1(v_source.cost_snapshot,v_source.raw_time_snapshot);
  select * into strict v_old_outbox from public.operations_personnel_cost_outbox where organization_id=v_org and source_time_stream_id=p_source_time_stream_id and source_revision=v_head;
  select jsonb_agg(value->'source_time_line_id' order by value->>'source_time_line_id' collate "C") into v_selected_ids
    from jsonb_array_elements(v_source.cost_snapshot->'lines') where (value->>'source_project_id')::uuid=p_project_id;
  if v_selected.source_snapshot_hash<>v_source.source_snapshot_hash or v_selected.time_snapshot_version<>v_source.time_snapshot_version
    or v_selected_ids is null or v_selected.source_time_line_ids is distinct from v_selected_ids
    or v_selected.economics_fingerprint<>operations_economy_private.project_fingerprint_v1(v_source.cost_snapshot,p_project_id) then
    return jsonb_build_object('status','stale_project_economics','current_source_revision',v_head); end if;
  select * into v_route from public.operations_personnel_transport_routes where organization_id=v_org;
  if not found then raise exception 'transport_route_not_enrolled' using errcode='22023'; end if;
  v_projected:=operations_economy_private.derive_project_status_snapshot_v1(v_source.cost_snapshot,v_old_outbox.source_evidence->>'submission_state',v_head+1);
  v_snapshot:=v_projected->'snapshot';v_body:=v_snapshot::text;
  if octet_length(v_body)>262144 then raise exception 'transport_body_too_large' using errcode='22023'; end if;
  v_hash:=encode(sha256(convert_to(v_body,'UTF8')),'hex');
  v_receipt:=operations_economy_private.canonical_personnel_cost_v1(v_snapshot,v_source.raw_time_snapshot,v_head,p_idempotency_key);
  if v_receipt->>'status' is distinct from 'accepted' then raise exception 'project_review_publication_not_accepted' using errcode='22023'; end if;
  insert into public.operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,
    source_evidence,destination_organization_id,key_id,endpoint_url)
    values(v_org,p_source_time_stream_id,v_head+1,v_body,v_hash,v_old_outbox.source_evidence,v_route.destination_organization_id,v_route.key_id,v_route.endpoint_url) returning * into v_outbox;
  perform operations_economy_private.canonical_personnel_proofs_v1(v_snapshot,v_projected->'proofs',v_head,'project_review',v_actor,p_project_id,p_expected_review_sequence,p_idempotency_key);
  return v_receipt||jsonb_build_object('outbox_id',v_outbox.id,'body_sha256',v_hash);
end; $$;
revoke all on function operations_economy_private.canonical_personnel_reviews_v1(text,uuid,bigint,bigint,text) from public,anon,authenticated,service_role;

create or replace function public.publish_operations_personnel_cost_v1(p_snapshot jsonb,p_raw_time_snapshot jsonb,p_expected_revision bigint,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 perform operations_economy_private.assert_personnel_legacy_source_v1((p_snapshot->>'organization_id')::uuid,(p_raw_time_snapshot->>'organizationId')::uuid,(p_raw_time_snapshot->>'workerId')::uuid);
 perform operations_economy_private.assert_personnel_legacy_v1((p_snapshot->>'organization_id')::uuid,(p_snapshot->>'worker_id')::uuid,p_snapshot->>'source_time_stream_id');
 return operations_economy_private.canonical_personnel_cost_v1(p_snapshot,p_raw_time_snapshot,p_expected_revision,p_idempotency_key);
end;$$;

create or replace function operations_economy_private.record_project_publication_proofs_v1(p_snapshot jsonb,p_proofs jsonb,p_previous_revision bigint,p_event_kind text,p_actor uuid,p_project uuid,p_review_sequence bigint,p_key text) returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 perform operations_economy_private.assert_personnel_legacy_v1((p_snapshot->>'organization_id')::uuid,(p_snapshot->>'worker_id')::uuid,p_snapshot->>'source_time_stream_id');
 perform operations_economy_private.canonical_personnel_proofs_v1(p_snapshot,p_proofs,p_previous_revision,p_event_kind,p_actor,p_project,p_review_sequence,p_key);
end;$$;

create or replace function public.publish_operations_personnel_cost_ingress_v1(p_snapshot jsonb,p_raw_time_snapshot jsonb,p_source_evidence jsonb,p_expected_revision bigint,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 perform operations_economy_private.assert_personnel_legacy_source_v1((p_snapshot->>'organization_id')::uuid,(p_raw_time_snapshot->>'organizationId')::uuid,(p_raw_time_snapshot->>'workerId')::uuid);
 perform operations_economy_private.assert_personnel_legacy_v1((p_snapshot->>'organization_id')::uuid,(p_snapshot->>'worker_id')::uuid,p_snapshot->>'source_time_stream_id');
 return operations_economy_private.canonical_personnel_ingress_v1(p_snapshot,p_raw_time_snapshot,p_source_evidence,p_expected_revision,p_idempotency_key);
end;$$;

create or replace function operations_economy_private.publish_project_reviews_v1(p_source_time_stream_id text,p_project_id uuid,p_expected_source_revision bigint,p_expected_review_sequence bigint,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 perform operations_economy_private.assert_personnel_legacy_v1(operations_economy_private.authorize_project_v1(p_project_id,false),null,p_source_time_stream_id);
 return operations_economy_private.canonical_personnel_reviews_v1(p_source_time_stream_id,p_project_id,p_expected_source_revision,p_expected_review_sequence,p_idempotency_key);
end;$$;

create or replace function public.publish_operations_personnel_cost_outbox_v1(
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
  perform operations_economy_private.personnel_ownership_read_lock_v1();
 perform operations_economy_private.assert_personnel_legacy_source_v1((p_snapshot->>'organization_id')::uuid,(p_raw_time_snapshot->>'organizationId')::uuid,(p_raw_time_snapshot->>'workerId')::uuid);
  perform operations_economy_private.assert_personnel_legacy_v1((p_snapshot->>'organization_id')::uuid,(p_snapshot->>'worker_id')::uuid,p_snapshot->>'source_time_stream_id');
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

create or replace function operations_economy_private.issue_personnel_v1(p_body text,p_timestamp bigint,p_nonce uuid,p_signature text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;i operations_economy_private.personnel_issuers_v1%rowtype;
 f operations_economy_private.personnel_issuer_streams_v1%rowtype;
 b public.operations_personnel_source_bindings%rowtype;o public.operations_personnel_cost_outbox%rowtype;
 m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
 refs jsonb;result jsonb;digest text;expected bigint;stream text;org uuid;worker uuid;prior text;issued timestamptz;envelope text;
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 if p_body is null or octet_length(p_body)>2097152 or p_timestamp is null or p_nonce is null
  or p_signature is null or p_signature!~'^[0-9a-f]{64}$'
  or abs(extract(epoch from clock_timestamp())-p_timestamp)>60 then raise exception 'invalid_issuer_attempt' using errcode='22023';end if;
 c:=p_body::jsonb;
 if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>11
  or not(c ?& array['schema','issuer_id','enrollment_epoch','organization_id','destination_organization_id','source_stream_id','expected_revision','idempotency_key','snapshot','raw_time_snapshot','source_evidence'])
  or c->>'schema' is distinct from 'operations-personnel-issuer-command.v1'
  or jsonb_typeof(c->'expected_revision') is distinct from 'number'
  or (c->>'expected_revision')::numeric not between 0 and 9007199254740990
  or mod((c->>'expected_revision')::numeric,1)<>0 then raise exception 'invalid_issuer_command' using errcode='22023';end if;
 select * into i from operations_economy_private.personnel_issuers_v1
  where issuer_id=(c->>'issuer_id')::uuid and enrollment_epoch=(c->>'enrollment_epoch')::uuid for share;
 if not found or not i.enabled or i.organization_id::text is distinct from c->>'organization_id'
  or i.destination_organization_id::text is distinct from c->>'destination_organization_id' then raise exception 'issuer_not_enrolled' using errcode='42501';end if;
 if encode(extensions.hmac(convert_to(concat_ws(E'\n','operations-personnel-source-attestation.v1',p_timestamp::text,p_nonce::text,p_body),'UTF8'),i.secret,'sha256'),'hex')<>p_signature
  then raise exception 'invalid_issuer_signature' using errcode='42501';end if;
 org:=i.organization_id;stream:=c->>'source_stream_id';expected:=(c->>'expected_revision')::bigint;worker:=(c#>>'{snapshot,worker_id}')::uuid;
 perform operations_economy_private.assert_personnel_issuer_mode_v1(org,worker,i.issuer_id,i.enrollment_epoch);
 if c#>>'{snapshot,organization_id}' is distinct from org::text or c#>>'{snapshot,source_time_stream_id}' is distinct from stream
  or (c#>>'{snapshot,source_revision}')::bigint is distinct from expected+1 then raise exception 'issuer_source_mismatch' using errcode='22023';end if;
 select * into f from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=i.issuer_id and enrollment_epoch=i.enrollment_epoch and source_stream_id=stream for share;
 if not found or expected<f.revision_floor then raise exception 'issuer_stream_below_floor_or_absent' using errcode='42501';end if;
 select * into b from public.operations_personnel_source_bindings where organization_id=org and worker_id=worker for share;
 if not found or not b.enabled or to_jsonb(b) is distinct from f.source_binding then raise exception 'issuer_source_binding_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_transport_routes where organization_id=org and destination_organization_id=i.destination_organization_id for share;
 if not found then raise exception 'issuer_destination_changed' using errcode='42501';end if;
 if not i.metadata_required and exists(select 1 from jsonb_array_elements(c#>'{snapshot,lines}') l left join public.projects p on p.id=(l->>'source_project_id')::uuid where p.id is null or p.deleted_at is not null or p.project_kind is null or p.project_kind not in ('internal_project','internal_activity') or p.booking_id is not null or l->'source_booking_id' is distinct from 'null'::jsonb) then raise exception 'customer_requires_causal_metadata' using errcode='42501';end if;
 if i.metadata_required then refs:=operations_economy_private.capture_personnel_metadata_refs_v2(org,c->'snapshot');end if;
 -- Lock the same existing head used by canonical ingress before deciding whether
 -- saved economics can be reused. A new signed review does not promote shadow money.
 perform 1 from public.operations_personnel_cost_streams where organization_id=org and source_time_stream_id=stream for update;
 if exists(select 1 from public.operations_personnel_cost_publications p where p.organization_id=org and p.source_time_stream_id=stream
   and p.source_revision=expected and p.time_snapshot_version=(c#>>'{snapshot,time_snapshot_version}')::bigint)
  and not operations_economy_private.personnel_issued_ancestor_v1(org,stream,expected,i.issuer_id,i.enrollment_epoch)
  then raise exception 'unissued_same_version_ancestor' using errcode='42501';end if;
 digest:=encode(sha256(convert_to(p_body,'UTF8')),'hex');
 insert into operations_economy_private.personnel_issuer_nonces_v1 values(i.issuer_id,i.enrollment_epoch,p_nonce,digest) on conflict do nothing;
 select command_sha256 into prior from operations_economy_private.personnel_issuer_nonces_v1 where issuer_id=i.issuer_id and enrollment_epoch=i.enrollment_epoch and nonce=p_nonce;
 if prior<>digest then raise exception 'issuer_nonce_conflict' using errcode='23505';end if;
 -- The canonical ingress owns the stream lock, source validation, accepted rate
 -- and project proof checks. Only its fresh accepted result can mint a marker.
 result:=operations_economy_private.canonical_personnel_ingress_v1(c->'snapshot',c->'raw_time_snapshot',c->'source_evidence',expected,c->>'idempotency_key');
 if result->>'status' not in ('accepted','duplicate') then raise exception 'issuer_publication_not_accepted' using errcode='40001';end if;
 select * into strict o from public.operations_personnel_cost_outbox where id=(result->>'outbox_id')::uuid;
 if o.organization_id<>org or o.source_time_stream_id<>stream or o.source_revision<>expected+1
  or o.destination_organization_id<>i.destination_organization_id then raise exception 'issuer_outbox_mismatch' using errcode='22023';end if;
 perform operations_economy_private.assert_issued_frozen_rates_v1(o.raw_body::jsonb,c->'raw_time_snapshot');
 perform operations_economy_private.assert_issued_publication_reviews_v1(org,stream,o.source_revision);
 if result->>'status'='duplicate' then
  select * into m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
  if not found or m.issuer_id<>i.issuer_id or m.enrollment_epoch<>i.enrollment_epoch or m.command_sha256<>digest
   then raise exception 'legacy_shadow_publication_not_issued' using errcode='42501';end if;
 else
  issued:=clock_timestamp();
  envelope:=jsonb_build_object('schema','operations-personnel-accepted-envelope.v1','issuer_id',i.issuer_id,'enrollment_epoch',i.enrollment_epoch,
   'source_organization_id',org,'destination_organization_id',i.destination_organization_id,'source_stream_id',stream,'source_revision',o.source_revision,
   'outbox_id',o.id,'occurred_at',issued,'membership','full_stream','source_snapshot_sha256',o.body_sha256,'snapshot',o.raw_body::jsonb)::text;
  if i.metadata_required then envelope:=(envelope::jsonb||jsonb_build_object('schema','operations-personnel-accepted-envelope.v2','project_metadata_refs',refs))::text;end if;
  if octet_length(envelope)>524288 then raise exception 'accepted_envelope_too_large' using errcode='22023';end if;
  insert into operations_economy_private.personnel_accepted_issuances_v1 values(o.id,i.issuer_id,i.enrollment_epoch,digest,issued,envelope,encode(sha256(convert_to(envelope,'UTF8')),'hex')) returning * into m;
 end if;
 return jsonb_build_object('schema','operations-personnel-issued-receipt.v1','status',result->>'status','outbox_id',o.id,'source_revision',o.source_revision,'fingerprint',m.fingerprint,'occurred_at',m.occurred_at);
end;$$;

create or replace function operations_economy_private.issue_personnel_project_review_v1(
 p_issuer uuid,p_epoch uuid,p_stream text,p_project uuid,p_expected bigint,p_review bigint,p_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ancestor_envelope jsonb;org uuid;actor uuid:=auth.uid();digest text;result jsonb;issued timestamptz;envelope text;
 i operations_economy_private.personnel_issuers_v1%rowtype;
 f operations_economy_private.personnel_issuer_streams_v1%rowtype;
 b public.operations_personnel_source_bindings%rowtype;
 ancestor public.operations_personnel_cost_outbox%rowtype;
 o public.operations_personnel_cost_outbox%rowtype;
 m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 -- Stable authority fence: existing auth/profile/membership/project rows remain
 -- current until this transaction ends, including while waiting on issuer/head.
 -- Revocation either wins these locks and is observed, or waits behind this
 -- publication; explicit grant events use their existing advisory protocol.
 perform 1 from auth.users where id=actor for share;
 perform 1 from public.profiles where user_id=actor order by id for share;
 perform 1 from public.user_roles where user_id=actor order by id for share;
 perform 1 from public.projects where id=p_project for share;
 org:=operations_economy_private.authorize_project_v1(p_project,false);
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','project-review-grant',org,p_project,actor),0));
 org:=operations_economy_private.authorize_project_v1(p_project,false);
 if p_expected is null or p_expected not between 1 and 9007199254740990
  or p_review is null or p_review not between 1 and 9007199254740991
  or p_stream is null or p_stream<>btrim(p_stream) or length(p_stream) not between 1 and 256
  or p_key is null or p_key<>btrim(p_key) or length(p_key) not between 12 and 200
  then raise exception 'invalid_accepted_review_command' using errcode='22023';end if;
 select * into i from operations_economy_private.personnel_issuers_v1
  where issuer_id=p_issuer and enrollment_epoch=p_epoch for share;
 if not found or not i.enabled or i.organization_id<>org then raise exception 'review_issuer_not_enrolled' using errcode='42501';end if;
 select * into f from operations_economy_private.personnel_issuer_streams_v1
  where issuer_id=p_issuer and enrollment_epoch=p_epoch and source_stream_id=p_stream for share;
 if not found or p_expected<=f.revision_floor then raise exception 'review_ancestor_below_floor_or_absent' using errcode='42501';end if;
 perform operations_economy_private.assert_personnel_issuer_mode_v1(org,(f.source_binding->>'worker_id')::uuid,p_issuer,p_epoch);
 -- Binding and route locks follow source issuer ordering before canonical head.
 select * into b from public.operations_personnel_source_bindings
  where organization_id=org and worker_id=(f.source_binding->>'worker_id')::uuid for share;
 if not found or not b.enabled or to_jsonb(b) is distinct from f.source_binding then raise exception 'review_source_binding_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_transport_routes where organization_id=org and destination_organization_id=i.destination_organization_id for share;
 if not found then raise exception 'review_destination_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_cost_streams where organization_id=org and source_time_stream_id=p_stream for update;
 if not found then raise exception 'review_stream_not_found' using errcode='22023';end if;
 select a.* into ancestor from public.operations_personnel_cost_outbox a
  join operations_economy_private.personnel_accepted_issuances_v1 marker on marker.outbox_id=a.id
  where a.organization_id=org and a.source_time_stream_id=p_stream and a.source_revision=p_expected
   and a.destination_organization_id=i.destination_organization_id
   and marker.issuer_id=p_issuer and marker.enrollment_epoch=p_epoch;
 if not found or (ancestor.raw_body::jsonb->>'worker_id')::uuid is distinct from b.worker_id
  then raise exception 'accepted_review_ancestor_required' using errcode='42501';end if;
 if not i.metadata_required and exists(select 1 from jsonb_array_elements(ancestor.raw_body::jsonb->'lines') l left join public.projects p on p.id=(l->>'source_project_id')::uuid where p.id is null or p.deleted_at is not null or p.project_kind is null or p.project_kind not in ('internal_project','internal_activity') or p.booking_id is not null or l->'source_booking_id' is distinct from 'null'::jsonb) then raise exception 'customer_requires_causal_metadata' using errcode='42501';end if;
 select raw_envelope::jsonb into strict ancestor_envelope from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=ancestor.id;
 if i.metadata_required and (ancestor_envelope->>'schema' is distinct from 'operations-personnel-accepted-envelope.v2' or jsonb_typeof(ancestor_envelope->'project_metadata_refs') is distinct from 'array') then raise exception 'review_causal_ancestor_required';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('schema','operations-personnel-review-command.v1',
  'actor',actor,'organization',org,'issuer',p_issuer,'epoch',p_epoch,'stream',p_stream,'project',p_project,
  'expected_revision',p_expected,'review_sequence',p_review,'idempotency_key',p_key)::text,'UTF8')),'hex');
 result:=operations_economy_private.canonical_personnel_reviews_v1(p_stream,p_project,p_expected,p_review,p_key);
 if result->>'status' not in ('accepted','duplicate') then return result;end if;
 select * into strict o from public.operations_personnel_cost_outbox where id=(result->>'outbox_id')::uuid;
 if o.organization_id<>org or o.source_time_stream_id<>p_stream or o.source_revision<>p_expected+1
  or o.destination_organization_id<>i.destination_organization_id then raise exception 'accepted_review_outbox_mismatch' using errcode='22023';end if;
 perform operations_economy_private.assert_issued_publication_reviews_v1(org,p_stream,o.source_revision);
 perform operations_economy_private.assert_issued_frozen_rates_v1(cost_snapshot,raw_time_snapshot)
  from public.operations_personnel_cost_publications where organization_id=org and source_time_stream_id=p_stream and source_revision=o.source_revision;
 if result->>'status'='duplicate' then
  select * into m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
  if not found or m.issuer_id<>p_issuer or m.enrollment_epoch<>p_epoch or m.command_sha256<>digest
   then raise exception 'shadow_review_publication_not_issued' using errcode='42501';end if;
 else
  issued:=clock_timestamp();
  envelope:=jsonb_build_object('schema','operations-personnel-accepted-envelope.v1','issuer_id',p_issuer,'enrollment_epoch',p_epoch,
   'source_organization_id',org,'destination_organization_id',i.destination_organization_id,'source_stream_id',p_stream,'source_revision',o.source_revision,
   'outbox_id',o.id,'occurred_at',issued,'membership','full_stream','source_snapshot_sha256',o.body_sha256,'snapshot',o.raw_body::jsonb)::text;
  if i.metadata_required then
   if (select jsonb_agg(id order by id) from(select distinct l->>'source_project_id' id from jsonb_array_elements(o.raw_body::jsonb->'lines')l)t) is distinct from (select jsonb_agg(r->>'source_project_id' order by r->>'source_project_id') from jsonb_array_elements(ancestor_envelope->'project_metadata_refs')r) then raise exception 'review_causal_membership_changed';end if;
   envelope:=(envelope::jsonb||jsonb_build_object('schema','operations-personnel-accepted-envelope.v2','project_metadata_refs',ancestor_envelope->'project_metadata_refs'))::text;
  end if;
  if octet_length(envelope)>524288 then raise exception 'accepted_review_envelope_too_large' using errcode='22023';end if;
  insert into operations_economy_private.personnel_accepted_issuances_v1 values(o.id,p_issuer,p_epoch,digest,issued,envelope,encode(sha256(convert_to(envelope,'UTF8')),'hex')) returning * into m;
 end if;
 return jsonb_build_object('schema','operations-personnel-issued-receipt.v1','status',result->>'status','outbox_id',o.id,
  'source_revision',o.source_revision,'fingerprint',m.fingerprint,'occurred_at',m.occurred_at);
end;$$;

create or replace function operations_economy_private.enroll_personnel_stream_v1(p_issuer uuid,p_epoch uuid,p_stream text)
returns bigint language plpgsql security definer set search_path='' as $$
declare i operations_economy_private.personnel_issuers_v1%rowtype;s public.operations_personnel_cost_streams%rowtype;
 b public.operations_personnel_source_bindings%rowtype;f operations_economy_private.personnel_issuer_streams_v1%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('eventflow:personnel-accepted-ownership:v1',0));
 select * into strict i from operations_economy_private.personnel_issuers_v1 where issuer_id=p_issuer and enrollment_epoch=p_epoch for share;
 select * into s from public.operations_personnel_cost_streams where organization_id=i.organization_id and source_time_stream_id=p_stream;
 if not found then raise exception 'canonical_stream_missing' using errcode='22023';end if;
 select * into b from public.operations_personnel_source_bindings where organization_id=i.organization_id and worker_id=s.worker_id for share;
 if not found or not b.enabled then raise exception 'source_binding_not_enabled' using errcode='42501';end if;
 select * into strict s from public.operations_personnel_cost_streams where organization_id=i.organization_id and source_time_stream_id=p_stream for update;
 if s.worker_id<>b.worker_id or s.time_organization_id<>b.time_organization_id or s.time_auth_worker_id<>b.time_auth_worker_id
  then raise exception 'canonical_stream_binding_changed' using errcode='42501';end if;
 select * into f from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=p_issuer and enrollment_epoch=p_epoch and source_stream_id=p_stream;
 if found then
  if f.source_binding is distinct from to_jsonb(b) then raise exception 'enrollment_binding_conflict' using errcode='23505';end if;
  return f.revision_floor;
 end if;
 insert into operations_economy_private.personnel_issuer_streams_v1 values(p_issuer,p_epoch,p_stream,s.current_revision,to_jsonb(b));
 return s.current_revision;
end;$$;

create function operations_economy_private.assert_personnel_issuer_mode_v1(p_org uuid,p_worker uuid,p_issuer uuid,p_epoch uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 if not exists(select 1 from operations_economy_private.personnel_accepted_workers_v1 w where w.organization_id=p_org and w.worker_id=p_worker and w.issuer_id=p_issuer and w.enrollment_epoch=p_epoch and w.enabled and w.source_binding=(select to_jsonb(b) from public.operations_personnel_source_bindings b where b.organization_id=p_org and b.worker_id=p_worker))
 then raise exception 'accepted_worker_mode_not_enabled' using errcode='42501';end if;
end;$$;
revoke all on function operations_economy_private.assert_personnel_issuer_mode_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.get_operations_personnel_publish_mode_v1(p_org uuid,p_worker uuid,p_stream text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w operations_economy_private.personnel_accepted_workers_v1%rowtype;i operations_economy_private.personnel_issuers_v1%rowtype;b public.operations_personnel_source_bindings%rowtype;f operations_economy_private.personnel_issuer_streams_v1%rowtype;
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 if p_org is null or p_worker is null then raise exception 'invalid_personnel_mode_identity' using errcode='22023';end if;
 if not operations_economy_private.personnel_accepted_owned_v1(p_org,p_worker,p_stream) then return jsonb_build_object('mode','legacy');end if;
 select * into w from operations_economy_private.personnel_accepted_workers_v1 where organization_id=p_org and worker_id=p_worker;
 if not found or not w.enabled then return jsonb_build_object('mode','blocked','reason','accepted_worker_mode_not_enabled');end if;
 select * into i from operations_economy_private.personnel_issuers_v1 where issuer_id=w.issuer_id and enrollment_epoch=w.enrollment_epoch;
 if not found or not i.enabled or i.organization_id<>p_org then return jsonb_build_object('mode','blocked','reason','accepted_issuer_not_enabled');end if;
 select * into b from public.operations_personnel_source_bindings where organization_id=p_org and worker_id=p_worker;
 if not found or not b.enabled or to_jsonb(b) is distinct from w.source_binding then return jsonb_build_object('mode','blocked','reason','accepted_binding_not_enabled');end if;
 if p_stream is not null then
  select * into f from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=w.issuer_id and enrollment_epoch=w.enrollment_epoch and source_stream_id=p_stream;
  if not found then return jsonb_build_object('mode','blocked','reason','accepted_stream_bootstrap_required');end if;
  if f.source_binding is distinct from to_jsonb(b) then return jsonb_build_object('mode','blocked','reason','accepted_binding_changed');end if;
 end if;
 return jsonb_build_object('mode','accepted','issuer_id',w.issuer_id,'enrollment_epoch',w.enrollment_epoch,'destination_organization_id',i.destination_organization_id);
end;$$;
revoke all on function public.get_operations_personnel_publish_mode_v1(uuid,uuid,text) from public,anon,authenticated,service_role;

create function operations_economy_private.claim_accepted_personnel_scoped_v1(p_issuer uuid,p_epoch uuid,p_owner text,p_limit integer default 1,p_lease_seconds integer default 30)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare leased integer:=0;b public.operations_personnel_source_bindings%rowtype;o public.operations_personnel_cost_outbox%rowtype;m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
 i operations_economy_private.personnel_issuers_v1%rowtype;r operations_economy_private.personnel_accepted_routes_v1%rowtype;
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 select * into i from operations_economy_private.personnel_issuers_v1 where issuer_id=p_issuer and enrollment_epoch=p_epoch for share;
 select * into r from operations_economy_private.personnel_accepted_routes_v1 where issuer_id=p_issuer and enrollment_epoch=p_epoch for share;
 if i.issuer_id is null or r.issuer_id is null or not i.enabled or not r.enabled or r.secret=i.secret then raise exception 'accepted_dispatch_mode_not_enabled' using errcode='42501';end if;
 if p_owner is null or length(p_owner) not between 1 and 128 or p_owner<>btrim(p_owner)
  or p_limit is null or p_limit not between 1 and 20 or p_lease_seconds is null or p_lease_seconds not between 5 and 120
  then raise exception 'invalid_accepted_claim' using errcode='22023';end if;
 for o in select q.* from public.operations_personnel_cost_outbox q
  join operations_economy_private.personnel_accepted_issuances_v1 m0 on m0.outbox_id=q.id
  join operations_economy_private.personnel_issuers_v1 i0 using(issuer_id,enrollment_epoch)
  join operations_economy_private.personnel_accepted_routes_v1 r0 using(issuer_id,enrollment_epoch)
  where m0.issuer_id=p_issuer and m0.enrollment_epoch=p_epoch
   and exists(select 1 from operations_economy_private.personnel_accepted_workers_v1 w join public.operations_personnel_cost_streams s on s.organization_id=w.organization_id and s.worker_id=w.worker_id join public.operations_personnel_source_bindings b0 on b0.organization_id=w.organization_id and b0.worker_id=w.worker_id where w.organization_id=q.organization_id and s.source_time_stream_id=q.source_time_stream_id and w.issuer_id=p_issuer and w.enrollment_epoch=p_epoch and w.enabled and b0.enabled and to_jsonb(b0)=w.source_binding)
   and q.state in ('queued','retry') and q.next_attempt_at<=clock_timestamp() and i0.enabled and r0.enabled
   and(q.lease_until is null or q.lease_until<=clock_timestamp())
   and not exists(select 1 from public.operations_personnel_cost_outbox prior
    join operations_economy_private.personnel_accepted_issuances_v1 pm on pm.outbox_id=prior.id
    where prior.organization_id=q.organization_id and prior.source_time_stream_id=q.source_time_stream_id
     and prior.source_revision<q.source_revision and prior.state<>'delivered')
  order by q.created_at,q.source_revision,q.id limit least(1000,p_limit*128)
 loop
  -- Current source authority is checked and locked BEFORE leasing the candidate.
  -- A revoked worker is skipped without poisoning its queue or other workers.
  select * into b from public.operations_personnel_source_bindings where organization_id=o.organization_id and worker_id=(o.raw_body::jsonb->>'worker_id')::uuid for share;
  if not found or not b.enabled or not exists(select 1 from operations_economy_private.personnel_accepted_workers_v1 w where w.organization_id=o.organization_id and w.worker_id=b.worker_id and w.issuer_id=p_issuer and w.enrollment_epoch=p_epoch and w.enabled and w.source_binding=to_jsonb(b)) then continue;end if;
  select q.* into o from public.operations_personnel_cost_outbox q where q.id=o.id and q.state in ('queued','retry') and q.next_attempt_at<=clock_timestamp() and(q.lease_until is null or q.lease_until<=clock_timestamp()) for update skip locked;
  if not found then continue;end if;
  select * into strict m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
  select * into strict i from operations_economy_private.personnel_issuers_v1 where issuer_id=m.issuer_id and enrollment_epoch=m.enrollment_epoch for share;
  select * into strict r from operations_economy_private.personnel_accepted_routes_v1 where issuer_id=m.issuer_id and enrollment_epoch=m.enrollment_epoch for share;
  if not i.enabled or not r.enabled or r.secret=i.secret or i.organization_id<>o.organization_id or i.destination_organization_id<>o.destination_organization_id then continue;end if;
  update public.operations_personnel_cost_outbox set lease_owner=p_owner,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=attempts+1,
   accepted_lease_route_sha256=encode(sha256(convert_to(concat_ws(E'\n',i.issuer_id::text,i.enrollment_epoch::text,i.organization_id::text,i.destination_organization_id::text,r.endpoint_url,encode(r.secret,'hex')),'UTF8')),'hex') where id=o.id returning * into o;
  return next jsonb_build_object('id',o.id,'organization_id',o.organization_id,'source_time_stream_id',o.source_time_stream_id,'source_revision',o.source_revision,
   'raw_body',m.raw_envelope,'body_sha256',m.fingerprint,'destination_organization_id',o.destination_organization_id,'issuer_id',m.issuer_id,'enrollment_epoch',m.enrollment_epoch,
   'endpoint_url',r.endpoint_url,'lease_owner',o.lease_owner,'lease_token',o.lease_token);
  leased:=leased+1;if leased>=p_limit then return;end if;
 end loop;
end;$$;
revoke all on function operations_economy_private.claim_accepted_personnel_scoped_v1(uuid,uuid,text,integer,integer) from public,anon,authenticated,service_role;

create or replace function public.claim_operations_personnel_cost_outbox_v1(p_owner text,p_limit integer default 20,p_lease_seconds integer default 30)
returns setof public.operations_personnel_cost_outbox language plpgsql security invoker set search_path='' as $$
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
  if p_owner is null or length(p_owner) not between 1 and 128 or p_owner<>btrim(p_owner)
    or p_limit is null or p_limit not between 1 and 100 or p_lease_seconds is null or p_lease_seconds not between 5 and 120
    then raise exception 'invalid_outbox_claim' using errcode='22023'; end if;
  return query with candidates as (
    select o.id from public.operations_personnel_cost_outbox o
    join public.operations_personnel_transport_routes r on r.organization_id=o.organization_id
      and r.enabled and r.key_id=o.key_id and r.endpoint_url=o.endpoint_url and r.destination_organization_id=o.destination_organization_id
    where not operations_economy_private.personnel_accepted_owned_v1(o.organization_id,null,o.source_time_stream_id) and o.state in ('queued','retry') and o.next_attempt_at<=clock_timestamp()
      and (o.lease_until is null or o.lease_until<=clock_timestamp())
    order by o.created_at,o.source_revision limit p_limit for update of o skip locked
  ) update public.operations_personnel_cost_outbox o set lease_owner=p_owner,lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1
    from candidates c where o.id=c.id returning o.*;
end; $$;

create or replace function public.finish_operations_personnel_cost_outbox_v1(
  p_id uuid,p_owner text,p_lease_token uuid,p_outcome text,p_receipt jsonb default null,p_error text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row public.operations_personnel_cost_outbox%rowtype;
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
  if operations_economy_private.personnel_is_accepted_outbox_v1(p_id) then raise exception 'accepted_outbox_cannot_use_shadow_finish' using errcode='42501';end if;
  select * into v_row from public.operations_personnel_cost_outbox where id=p_id;
  if found then perform operations_economy_private.assert_personnel_legacy_v1(v_row.organization_id,null,v_row.source_time_stream_id);end if;
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

create or replace function operations_economy_private.finish_accepted_personnel_v1(p_id uuid,p_owner text,p_token uuid,p_outcome text,p_raw_ack text default null,p_signature text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_personnel_cost_outbox%rowtype;m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
 i operations_economy_private.personnel_issuers_v1%rowtype;r operations_economy_private.personnel_accepted_routes_v1%rowtype;a jsonb;
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 select * into o from public.operations_personnel_cost_outbox where id=p_id for update;
 if not found or o.lease_owner is distinct from p_owner or o.lease_token is distinct from p_token or o.lease_until is null or o.lease_until<=clock_timestamp()
  or o.state not in ('queued','retry') then raise exception 'accepted_lease_not_owned' using errcode='42501';end if;
 select * into strict m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
 perform operations_economy_private.assert_personnel_issuer_mode_v1(o.organization_id,(o.raw_body::jsonb->>'worker_id')::uuid,m.issuer_id,m.enrollment_epoch);
 select * into strict i from operations_economy_private.personnel_issuers_v1 where issuer_id=m.issuer_id and enrollment_epoch=m.enrollment_epoch for share;
 select * into strict r from operations_economy_private.personnel_accepted_routes_v1 where issuer_id=m.issuer_id and enrollment_epoch=m.enrollment_epoch for share;
 if not i.enabled or not r.enabled or r.secret=i.secret or i.organization_id<>o.organization_id or i.destination_organization_id<>o.destination_organization_id
  or o.accepted_lease_route_sha256 is distinct from encode(sha256(convert_to(concat_ws(E'\n',i.issuer_id::text,i.enrollment_epoch::text,i.organization_id::text,i.destination_organization_id::text,r.endpoint_url,encode(r.secret,'hex')),'UTF8')),'hex') then raise exception 'accepted_route_not_enabled' using errcode='42501';end if;
 if p_outcome='delivered' then
  if p_raw_ack is null or octet_length(p_raw_ack)>16384 or p_signature is null or p_signature!~'^[0-9a-f]{64}$'
   or encode(extensions.hmac(convert_to('operations-personnel-accepted-ack.v1'||E'\n'||p_raw_ack,'UTF8'),r.secret,'sha256'),'hex')<>p_signature
   then raise exception 'accepted_ack_signature_invalid' using errcode='42501';end if;
  a:=p_raw_ack::jsonb;
  if jsonb_typeof(a) is distinct from 'object' or (select count(*) from jsonb_object_keys(a))<>12
   or not(a ?& array['schema','outcome','issuer_id','enrollment_epoch','source_organization_id','destination_organization_id','source_stream_id','source_revision','outbox_id','envelope_sha256','receipt_id','financially_applied'])
   or a->>'schema' is distinct from 'operations-personnel-accepted-receipt.v1' or coalesce(a->>'outcome','') not in ('received','replayed')
   or a->'financially_applied' is distinct from 'false'::jsonb or a->>'issuer_id' is distinct from m.issuer_id::text
   or a->>'enrollment_epoch' is distinct from m.enrollment_epoch::text or a->>'source_organization_id' is distinct from o.organization_id::text
   or a->>'destination_organization_id' is distinct from o.destination_organization_id::text or a->>'source_stream_id' is distinct from o.source_time_stream_id
   or jsonb_typeof(a->'source_revision') is distinct from 'number' or (a->>'source_revision')::numeric is distinct from o.source_revision::numeric
   or a->>'outbox_id' is distinct from o.id::text or a->>'envelope_sha256' is distinct from m.fingerprint
   or coalesce(a->>'receipt_id','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then raise exception 'accepted_ack_unbound' using errcode='22023';end if;
 elsif p_outcome is null or p_outcome not in ('retry','blocked') or p_raw_ack is not null or p_signature is not null then raise exception 'invalid_accepted_outcome' using errcode='22023';end if;
 update public.operations_personnel_cost_outbox set state=p_outcome,receipt=case when p_outcome='delivered' then jsonb_build_object('raw_ack',p_raw_ack,'signature',p_signature) else null end,
  last_error=case when p_outcome='delivered' then null else left(coalesce(p_error,'accepted_delivery_failed'),120) end,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,least(attempts,9)))::integer),
  finished_at=case when p_outcome='delivered' then clock_timestamp() else null end,lease_owner=null,lease_token=null,lease_until=null,accepted_lease_route_sha256=null where id=o.id;
 return jsonb_build_object('status',p_outcome,'outbox_id',o.id,'financially_applied',false);
end;$$;

create function public.issue_operations_personnel_accepted_v1(p_body text,p_timestamp bigint,p_nonce uuid,p_signature text) returns jsonb language sql security definer set search_path='' as $$select operations_economy_private.issue_personnel_v1(p_body,p_timestamp,p_nonce,p_signature)$$;
revoke all on function public.issue_operations_personnel_accepted_v1(text,bigint,uuid,text) from public,anon,authenticated,service_role;

create function public.claim_operations_personnel_accepted_v1(p_issuer uuid,p_epoch uuid,p_owner text,p_limit integer default 1,p_lease_seconds integer default 60) returns setof jsonb language sql security definer set search_path='' as $$select * from operations_economy_private.claim_accepted_personnel_scoped_v1(p_issuer,p_epoch,p_owner,p_limit,p_lease_seconds)$$;
revoke all on function public.claim_operations_personnel_accepted_v1(uuid,uuid,text,integer,integer) from public,anon,authenticated,service_role;

create function public.finish_operations_personnel_accepted_v1(p_id uuid,p_owner text,p_token uuid,p_outcome text,p_raw_ack text default null,p_signature text default null,p_error text default null) returns jsonb language sql security definer set search_path='' as $$select operations_economy_private.finish_accepted_personnel_v1(p_id,p_owner,p_token,p_outcome,p_raw_ack,p_signature,p_error)$$;
revoke all on function public.finish_operations_personnel_accepted_v1(uuid,text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
