-- DORMANT DRAFT. Apply after accepted-personnel-issuer.sql in isolated tests only.
-- No caller grants, enrollment rows, keys or route activation are installed.
create table operations_economy_private.personnel_accepted_routes_v1 (
 issuer_id uuid not null,enrollment_epoch uuid not null,
 endpoint_url text not null check(endpoint_url ~ '^https://[^/?#@]+/functions/v1/operations-personnel-accepted-receive$'),
 secret bytea not null check(octet_length(secret)>=32),enabled boolean not null default false,
 primary key(issuer_id,enrollment_epoch),
 foreign key(issuer_id,enrollment_epoch) references operations_economy_private.personnel_issuers_v1
);
revoke all on operations_economy_private.personnel_accepted_routes_v1 from public,anon,authenticated,service_role;
alter table operations_economy_private.personnel_accepted_routes_v1 enable row level security;

-- Owner-only preparation for an EXISTING canonical stream; absent streams fail.
-- Same stream row lock as ingress. Existing floor is immutable and retries cannot
-- advance it or silently rebind a worker. Keys and enablement remain separate.
create function operations_economy_private.enroll_personnel_stream_v1(p_issuer uuid,p_epoch uuid,p_stream text)
returns bigint language plpgsql security definer set search_path='' as $$
declare i operations_economy_private.personnel_issuers_v1%rowtype;s public.operations_personnel_cost_streams%rowtype;
 b public.operations_personnel_source_bindings%rowtype;f operations_economy_private.personnel_issuer_streams_v1%rowtype;
begin
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
revoke all on function operations_economy_private.enroll_personnel_stream_v1(uuid,uuid,text) from public,anon,authenticated,service_role;

alter table public.operations_personnel_cost_outbox add column accepted_lease_route_sha256 text check(accepted_lease_route_sha256 is null or accepted_lease_route_sha256 ~ '^[0-9a-f]{64}$');

-- Read-only mode guard used by the existing shadow API; no payload or key leaks.
create function operations_economy_private.personnel_is_accepted_outbox_v1(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=p_id)
$$;
revoke all on function operations_economy_private.personnel_is_accepted_outbox_v1(uuid) from public,anon,authenticated;
grant execute on function operations_economy_private.personnel_is_accepted_outbox_v1(uuid) to service_role;

-- The legacy service role may mutate shadow queue state, but accepted rows can
-- change delivery state only inside owner-executed private procedures. RLS bypass
-- cannot bypass this trigger. Payload immutability remains independently active.
create function public.operations_personnel_accepted_delivery_guard_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if operations_economy_private.personnel_is_accepted_outbox_v1(old.id)
  and current_user is distinct from (select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c
   where c.oid='operations_economy_private.personnel_accepted_issuances_v1'::regclass)
  then raise exception 'accepted_delivery_owner_required' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function public.operations_personnel_accepted_delivery_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_personnel_accepted_delivery_guard before update on public.operations_personnel_cost_outbox
 for each row execute function public.operations_personnel_accepted_delivery_guard_v1();

create function operations_economy_private.claim_accepted_personnel_v1(p_owner text,p_limit integer default 1,p_lease_seconds integer default 30)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_personnel_cost_outbox%rowtype;m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
 i operations_economy_private.personnel_issuers_v1%rowtype;r operations_economy_private.personnel_accepted_routes_v1%rowtype;
begin
 if p_owner is null or length(p_owner) not between 1 and 128 or p_owner<>btrim(p_owner)
  or p_limit is null or p_limit not between 1 and 20 or p_lease_seconds is null or p_lease_seconds not between 5 and 120
  then raise exception 'invalid_accepted_claim' using errcode='22023';end if;
 for o in select q.* from public.operations_personnel_cost_outbox q
  join operations_economy_private.personnel_accepted_issuances_v1 m0 on m0.outbox_id=q.id
  join operations_economy_private.personnel_issuers_v1 i0 using(issuer_id,enrollment_epoch)
  join operations_economy_private.personnel_accepted_routes_v1 r0 using(issuer_id,enrollment_epoch)
  where q.state in ('queued','retry') and q.next_attempt_at<=clock_timestamp() and i0.enabled and r0.enabled
   and(q.lease_until is null or q.lease_until<=clock_timestamp())
   and not exists(select 1 from public.operations_personnel_cost_outbox prior
    join operations_economy_private.personnel_accepted_issuances_v1 pm on pm.outbox_id=prior.id
    where prior.organization_id=q.organization_id and prior.source_time_stream_id=q.source_time_stream_id
     and prior.source_revision<q.source_revision and prior.state<>'delivered')
  order by q.created_at,q.source_revision limit p_limit for update of q skip locked
 loop
  select * into strict m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
  select * into strict i from operations_economy_private.personnel_issuers_v1 where issuer_id=m.issuer_id and enrollment_epoch=m.enrollment_epoch for share;
  select * into strict r from operations_economy_private.personnel_accepted_routes_v1 where issuer_id=m.issuer_id and enrollment_epoch=m.enrollment_epoch for share;
  if not i.enabled or not r.enabled or r.secret=i.secret or i.organization_id<>o.organization_id or i.destination_organization_id<>o.destination_organization_id then continue;end if;
  update public.operations_personnel_cost_outbox set lease_owner=p_owner,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=attempts+1,
   accepted_lease_route_sha256=encode(sha256(convert_to(concat_ws(E'\n',i.issuer_id::text,i.enrollment_epoch::text,i.organization_id::text,i.destination_organization_id::text,r.endpoint_url,encode(r.secret,'hex')),'UTF8')),'hex') where id=o.id returning * into o;
  return next jsonb_build_object('id',o.id,'organization_id',o.organization_id,'source_time_stream_id',o.source_time_stream_id,'source_revision',o.source_revision,
   'raw_body',m.raw_envelope,'body_sha256',m.fingerprint,'destination_organization_id',o.destination_organization_id,'issuer_id',m.issuer_id,'enrollment_epoch',m.enrollment_epoch,
   'endpoint_url',r.endpoint_url,'lease_owner',o.lease_owner,'lease_token',o.lease_token);
 end loop;
end;$$;
revoke all on function operations_economy_private.claim_accepted_personnel_v1(text,integer,integer) from public,anon,authenticated,service_role;

create function operations_economy_private.finish_accepted_personnel_v1(p_id uuid,p_owner text,p_token uuid,p_outcome text,p_raw_ack text default null,p_signature text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_personnel_cost_outbox%rowtype;m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
 i operations_economy_private.personnel_issuers_v1%rowtype;r operations_economy_private.personnel_accepted_routes_v1%rowtype;a jsonb;
begin
 select * into o from public.operations_personnel_cost_outbox where id=p_id for update;
 if not found or o.lease_owner is distinct from p_owner or o.lease_token is distinct from p_token or o.lease_until is null or o.lease_until<=clock_timestamp()
  or o.state not in ('queued','retry') then raise exception 'accepted_lease_not_owned' using errcode='42501';end if;
 select * into strict m from operations_economy_private.personnel_accepted_issuances_v1 where outbox_id=o.id;
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
revoke all on function operations_economy_private.finish_accepted_personnel_v1(uuid,text,uuid,text,text,text,text) from public,anon,authenticated,service_role;

-- Existing shadow claims never obtain a prospective accepted row.
create or replace function public.claim_operations_personnel_cost_outbox_v1(p_owner text,p_limit integer default 20,p_lease_seconds integer default 30)
returns setof public.operations_personnel_cost_outbox language plpgsql security invoker set search_path='' as $$
begin
  if p_owner is null or length(p_owner) not between 1 and 128 or p_owner<>btrim(p_owner)
    or p_limit is null or p_limit not between 1 and 100 or p_lease_seconds is null or p_lease_seconds not between 5 and 120
    then raise exception 'invalid_outbox_claim' using errcode='22023'; end if;
  return query with candidates as (
    select o.id from public.operations_personnel_cost_outbox o
    join public.operations_personnel_transport_routes r on r.organization_id=o.organization_id
      and r.enabled and r.key_id=o.key_id and r.endpoint_url=o.endpoint_url and r.destination_organization_id=o.destination_organization_id
    where not operations_economy_private.personnel_is_accepted_outbox_v1(o.id) and o.state in ('queued','retry') and o.next_attempt_at<=clock_timestamp()
      and (o.lease_until is null or o.lease_until<=clock_timestamp())
    order by o.created_at,o.source_revision limit p_limit for update of o skip locked
  ) update public.operations_personnel_cost_outbox o set lease_owner=p_owner,lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1
    from candidates c where o.id=c.id returning o.*;
end; $$;
revoke all on function public.claim_operations_personnel_cost_outbox_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_operations_personnel_cost_outbox_v1(text,integer,integer) to service_role;


-- Even a previously held shadow lease cannot acknowledge an accepted row.
create or replace function public.finish_operations_personnel_cost_outbox_v1(
  p_id uuid,p_owner text,p_lease_token uuid,p_outcome text,p_receipt jsonb default null,p_error text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row public.operations_personnel_cost_outbox%rowtype;
begin
  if operations_economy_private.personnel_is_accepted_outbox_v1(p_id) then raise exception 'accepted_outbox_cannot_use_shadow_finish' using errcode='42501';end if;
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
