-- Additive recipient-scoped shadow evidence only. Default-off; no official costs or billing writes.
create table public.operations_finance_invoice_enrollments (
 key_id text primary key check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 source_organization_id uuid not null,
 destination_organization_id uuid not null,
 enabled boolean not null default false,
 created_at timestamptz not null default now()
);
-- Server-maintained exact project capability map, not a guessed inverse/name mapping.
create table public.operations_finance_invoice_project_scopes (
 key_id text not null references public.operations_finance_invoice_enrollments(key_id),
 source_project_id uuid not null,
 destination_project_id uuid not null,
 enabled boolean not null default false,
 primary key(key_id,source_project_id,destination_project_id)
);
create table public.operations_finance_invoice_streams (
 organization_id uuid not null,
 source_organization_id uuid not null,
 invoice_id uuid not null,
 current_revision bigint not null default 0 check(current_revision between 0 and 9007199254740991),
 primary key(organization_id,source_organization_id,invoice_id)
);
create table public.operations_finance_invoice_snapshots (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 source_organization_id uuid not null,
 invoice_id uuid not null,
 source_revision bigint not null check(source_revision between 1 and 9007199254740991),
 source_publication_fingerprint text not null check(source_publication_fingerprint ~ '^[0-9a-f]{64}$'),
 envelope jsonb not null,
 raw_body text not null check(octet_length(raw_body)<=262144),
 body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
 snapshot_fingerprint text not null check(snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 unique(organization_id,source_organization_id,invoice_id,source_revision),
 foreign key(organization_id,source_organization_id,invoice_id)
 references public.operations_finance_invoice_streams(organization_id,source_organization_id,invoice_id)
);
create table public.operations_finance_invoice_receipts (
 id uuid primary key,
 key_id text not null references public.operations_finance_invoice_enrollments(key_id),
 nonce text not null check(nonce ~ '^[A-Za-z0-9_-]{16,128}$'),
 organization_id uuid not null,
 source_organization_id uuid not null,
 invoice_id uuid not null,
 requested_source_revision bigint not null,
 snapshot_receipt_id uuid not null references public.operations_finance_invoice_snapshots(id),
 request_body_sha256 text not null check(request_body_sha256 ~ '^[0-9a-f]{64}$'),
 signed_at timestamptz not null,
 receipt jsonb not null,
 committed_at timestamptz not null default now(),
 unique(key_id,nonce)
);
alter table public.operations_finance_invoice_enrollments enable row level security;
alter table public.operations_finance_invoice_project_scopes enable row level security;
alter table public.operations_finance_invoice_streams enable row level security;
alter table public.operations_finance_invoice_snapshots enable row level security;
alter table public.operations_finance_invoice_receipts enable row level security;
revoke all on public.operations_finance_invoice_enrollments,public.operations_finance_invoice_project_scopes,
 public.operations_finance_invoice_streams,public.operations_finance_invoice_snapshots,public.operations_finance_invoice_receipts
 from public,anon,authenticated;
grant select,insert,update on public.operations_finance_invoice_enrollments,public.operations_finance_invoice_project_scopes,
 public.operations_finance_invoice_streams to service_role;
grant select,insert on public.operations_finance_invoice_snapshots,public.operations_finance_invoice_receipts to service_role;
create function public.operations_finance_invoice_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 raise exception 'Invoice destination evidence is append-only' using errcode='55000';
end $$;
revoke all on function public.operations_finance_invoice_immutable() from public,anon,authenticated;
create trigger operations_finance_invoice_snapshots_immutable before update or delete on public.operations_finance_invoice_snapshots
 for each row execute function public.operations_finance_invoice_immutable();
create trigger operations_finance_invoice_snapshots_no_truncate before truncate on public.operations_finance_invoice_snapshots
 for each statement execute function public.operations_finance_invoice_immutable();
create trigger operations_finance_invoice_receipts_immutable before update or delete on public.operations_finance_invoice_receipts
 for each row execute function public.operations_finance_invoice_immutable();
create trigger operations_finance_invoice_receipts_no_truncate before truncate on public.operations_finance_invoice_receipts
 for each statement execute function public.operations_finance_invoice_immutable();

create function public.operations_validate_finance_invoice_destination_v1(p jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare a jsonb; total numeric:=0; sign integer; expected_status text;
 fields text[]:=array['schema_version','source_organization_id','destination_organization_id','invoice_id','source_revision',
 'source_publication_fingerprint','source_observation_id','provider_document_number','document_fingerprint','invoice_kind',
 'currency','recipient_net_minor','invoice_status','provider_source_changed','accounting_state','settlement_state',
 'provider_approval_state','credit_relation_coverage','allocations']; key text;
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invoice destination object required' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p))<>19 or not(p ?& fields)
 or p->>'schema_version' is distinct from 'finance-project-invoice-destination-v1' then
 raise exception 'Exact recipient invoice contract required' using errcode='22023'; end if;
 foreach key in array array['source_organization_id','destination_organization_id','invoice_id','source_observation_id'] loop
  if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception 'Invoice destination UUID required' using errcode='22023'; end if;
 end loop;
 foreach key in array array['source_publication_fingerprint','document_fingerprint'] loop
  if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~ '^[0-9a-f]{64}$' then
  raise exception 'Invoice fingerprint required' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(p->'source_revision') is distinct from 'number' or (p->>'source_revision')::numeric<>trunc((p->>'source_revision')::numeric)
 or (p->>'source_revision')::numeric not between 1 and 9007199254740991
 or jsonb_typeof(p->'recipient_net_minor') is distinct from 'number' or (p->>'recipient_net_minor')::numeric<>trunc((p->>'recipient_net_minor')::numeric)
 or abs((p->>'recipient_net_minor')::numeric)>9007199254740991
 or jsonb_typeof(p->'provider_document_number') is distinct from 'string' or length(p->>'provider_document_number') not between 1 and 256
 or p->>'provider_document_number'<>btrim(p->>'provider_document_number')
 or coalesce(p->>'currency','') !~ '^[A-Z]{3}$'
 or coalesce(p->>'invoice_kind','') not in ('invoice','credit')
 or coalesce(p->>'invoice_status','') not in ('received','needs_matching','in_approval','approved','rejected','investigation')
 or jsonb_typeof(p->'provider_source_changed') is distinct from 'boolean'
 or coalesce(p->>'accounting_state','') not in ('draft','booked','cancelled')
 or coalesce(p->>'settlement_state','') not in ('unpaid','part_paid','paid','inconsistent')
 or coalesce(p->>'provider_approval_state','') not in ('pending','not_pending')
 or p->>'credit_relation_coverage' is distinct from (case when p->>'invoice_kind'='credit' then 'unresolved' else 'not_applicable' end)
 or jsonb_typeof(p->'allocations') is distinct from 'array' then
 raise exception 'Invoice destination money/state invalid' using errcode='22023'; end if;
 if jsonb_array_length(p->'allocations')>10000 then raise exception 'Too many allocations' using errcode='22023'; end if;
 sign:=case when p->>'invoice_kind'='credit' then -1 else 1 end;
 expected_status:=case when p->>'invoice_status'='approved' then 'confirmed' when p->>'invoice_status'='rejected' then 'rejected' else 'preliminary' end;
 if sign*(p->>'recipient_net_minor')::numeric<0
 or (p->>'invoice_status'='approved' and (p->>'provider_source_changed')::boolean) then
 raise exception 'Invoice sign/approval invalid' using errcode='22023'; end if;
 for a in select * from jsonb_array_elements(p->'allocations') loop
  if jsonb_typeof(a) is distinct from 'object' then raise exception 'Allocation object required' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(a))<>8 or not(a ?& array['allocation_id','project_id','cost_line_id',
   'destination_organization_id','destination_project_id','amount_minor','consumes_commitment','status']) then
  raise exception 'Exact allocation fields required' using errcode='22023'; end if;
  foreach key in array array['allocation_id','project_id','cost_line_id','destination_organization_id','destination_project_id'] loop
   if jsonb_typeof(a->key) is distinct from 'string' or a->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'Allocation UUID required' using errcode='22023'; end if;
  end loop;
  if (a->>'destination_organization_id')::uuid<>(p->>'destination_organization_id')::uuid then
  raise exception 'Another recipient allocation denied' using errcode='42501'; end if;
  if jsonb_typeof(a->'amount_minor') is distinct from 'number' or (a->>'amount_minor')::numeric<>trunc((a->>'amount_minor')::numeric)
  or abs((a->>'amount_minor')::numeric)>9007199254740991 or sign*(a->>'amount_minor')::numeric<=0
  or jsonb_typeof(a->'consumes_commitment') is distinct from 'boolean' or a->>'status' is distinct from expected_status then
  raise exception 'Allocation money/state invalid' using errcode='22023'; end if;
  total:=total+(a->>'amount_minor')::numeric;
 end loop;
 if (select count(*) from jsonb_array_elements(p->'allocations'))<>(select count(distinct (e->>'allocation_id')::uuid) from jsonb_array_elements(p->'allocations') e)
 or total<>(p->>'recipient_net_minor')::numeric then
 raise exception 'Recipient total/identity reconciliation failed' using errcode='22023'; end if;
end $$;
revoke all on function public.operations_validate_finance_invoice_destination_v1(jsonb) from public,anon,authenticated;
grant execute on function public.operations_validate_finance_invoice_destination_v1(jsonb) to service_role;

create schema if not exists operations_invoice_private;
revoke all on schema operations_invoice_private from public,anon,authenticated;
grant usage on schema operations_invoice_private to service_role;
create function operations_invoice_private.receive_finance_project_invoice_destination_v1(p_key_id text,p_timestamp text,p_nonce text,p_raw_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; enrollment public.operations_finance_invoice_enrollments%rowtype;
 saved public.operations_finance_invoice_snapshots%rowtype; current_head bigint; requested bigint;
 source_org uuid; dest_org uuid; iid uuid; outcome text; receipt_id uuid:=gen_random_uuid(); receipt jsonb; body_hash text;
begin
 if p_key_id is null or p_key_id !~ '^[A-Za-z0-9_-]{4,64}$' or p_timestamp is null or p_timestamp !~ '^\d{10}$'
 or abs(extract(epoch from clock_timestamp())-p_timestamp::bigint)>120 or p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,128}$'
 or p_raw_body is null or octet_length(p_raw_body)>262144 then
 raise exception 'Invoice transport freshness/size invalid' using errcode='22023'; end if;
 p:=p_raw_body::jsonb;
 perform public.operations_validate_finance_invoice_destination_v1(p);
 source_org:=(p->>'source_organization_id')::uuid;dest_org:=(p->>'destination_organization_id')::uuid;iid:=(p->>'invoice_id')::uuid;
 requested:=(p->>'source_revision')::bigint;
 select * into enrollment from public.operations_finance_invoice_enrollments
 where key_id=p_key_id and source_organization_id=source_org and destination_organization_id=dest_org and enabled for share;
 if not found then raise exception 'Invoice source/destination enrollment denied' using errcode='42501'; end if;
 -- Configuration stays fixed while the full recipient snapshot is checked/committed.
 perform 1 from public.operations_finance_invoice_project_scopes where key_id=p_key_id for share;
 if exists(select 1 from jsonb_array_elements(p->'allocations') a where not exists(
  select 1 from public.operations_finance_invoice_project_scopes s where s.key_id=p_key_id and s.enabled
   and s.source_project_id=(a->>'project_id')::uuid and s.destination_project_id=(a->>'destination_project_id')::uuid)) then
 raise exception 'Invoice project scope denied' using errcode='42501'; end if;
 perform 1 from public.projects target where target.id in
  (select (a->>'destination_project_id')::uuid from jsonb_array_elements(p->'allocations') a) for share;
 if exists(select 1 from jsonb_array_elements(p->'allocations') a where not exists(
  select 1 from public.projects target where target.id=(a->>'destination_project_id')::uuid
   and target.organization_id=dest_org and target.deleted_at is null)) then
 raise exception 'Invoice destination project tenant/deletion denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-destination-nonce:'||p_key_id||':'||p_nonce,0));
 if exists(select 1 from public.operations_finance_invoice_receipts where key_id=p_key_id and nonce=p_nonce) then
 raise exception 'Invoice nonce replay denied' using errcode='42501'; end if;
 insert into public.operations_finance_invoice_streams(organization_id,source_organization_id,invoice_id)
 values(dest_org,source_org,iid) on conflict do nothing;
 select current_revision into current_head from public.operations_finance_invoice_streams
 where organization_id=dest_org and source_organization_id=source_org and invoice_id=iid for update;
 select * into saved from public.operations_finance_invoice_snapshots where organization_id=dest_org and source_organization_id=source_org
 and invoice_id=iid and source_revision=requested;
 if found then
  if saved.raw_body<>p_raw_body or saved.envelope<>p then raise exception 'Changed immutable invoice revision denied' using errcode='22023'; end if;
  outcome:='replayed';
 elsif requested<current_head then
  select * into saved from public.operations_finance_invoice_snapshots where organization_id=dest_org and source_organization_id=source_org
   and invoice_id=iid and source_revision=current_head;
  outcome:='stale';
 elsif requested=current_head then
  raise exception 'Invoice stream snapshot missing' using errcode='55000';
 else
  insert into public.operations_finance_invoice_snapshots(organization_id,source_organization_id,invoice_id,source_revision,
   source_publication_fingerprint,envelope,raw_body,body_sha256,snapshot_fingerprint)
  values(dest_org,source_org,iid,requested,p->>'source_publication_fingerprint',p,p_raw_body,
   encode(sha256(convert_to(p_raw_body,'UTF8')),'hex'),encode(sha256(convert_to(p_raw_body,'UTF8')),'hex')) returning * into saved;
  update public.operations_finance_invoice_streams set current_revision=requested
   where organization_id=dest_org and source_organization_id=source_org and invoice_id=iid;
  current_head:=requested;outcome:='accepted';
 end if;
 if saved.id is null then raise exception 'Invoice committed snapshot missing' using errcode='55000'; end if;
 body_hash:=encode(sha256(convert_to(p_raw_body,'UTF8')),'hex');
 receipt:=jsonb_build_object('schema','finance-project-invoice-destination-receipt-v1','outcome',outcome,
 'source_organization_id',source_org,'destination_organization_id',dest_org,'invoice_id',iid,
 'requested_source_revision',requested,'applied_source_revision',saved.source_revision,'current_source_revision',current_head,
 'request_body_sha256',body_hash,'snapshot_receipt_id',saved.id,'snapshot_fingerprint',saved.snapshot_fingerprint,
 'receipt_id',receipt_id,'shadow_only',true);
 insert into public.operations_finance_invoice_receipts(id,key_id,nonce,organization_id,source_organization_id,invoice_id,
 requested_source_revision,snapshot_receipt_id,request_body_sha256,signed_at,receipt)
 values(receipt_id,p_key_id,p_nonce,dest_org,source_org,iid,requested,saved.id,body_hash,to_timestamp(p_timestamp::bigint),receipt);
 return receipt;
end $$;
revoke all on function operations_invoice_private.receive_finance_project_invoice_destination_v1(text,text,text,text) from public,anon,authenticated;
grant execute on function operations_invoice_private.receive_finance_project_invoice_destination_v1(text,text,text,text) to service_role;
create function public.operations_receive_finance_project_invoice_destination_v1(p_key_id text,p_timestamp text,p_nonce text,p_raw_body text)
returns jsonb language sql security invoker set search_path='' as $$
 select operations_invoice_private.receive_finance_project_invoice_destination_v1(p_key_id,p_timestamp,p_nonce,p_raw_body);
$$;
revoke all on function public.operations_receive_finance_project_invoice_destination_v1(text,text,text,text) from public,anon,authenticated;
grant execute on function public.operations_receive_finance_project_invoice_destination_v1(text,text,text,text) to service_role;
create view public.operations_finance_invoice_current with (security_invoker=true) as
 select s.* from public.operations_finance_invoice_streams h join public.operations_finance_invoice_snapshots s
 on s.organization_id=h.organization_id and s.source_organization_id=h.source_organization_id and s.invoice_id=h.invoice_id
 and s.source_revision=h.current_revision;
revoke all on public.operations_finance_invoice_current from public,anon,authenticated;
grant select on public.operations_finance_invoice_current to service_role;
