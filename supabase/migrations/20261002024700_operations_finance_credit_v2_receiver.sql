-- Additive recipient-scoped shadow evidence only. Default-off; no official costs or billing writes.
create table public.operations_finance_credit_v2_enrollments (
 key_id text primary key check(key_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 source_organization_id uuid not null,
 destination_organization_id uuid not null,
 enabled boolean not null default false,
 created_at timestamptz not null default now()
);
-- Server-maintained exact project capability map, not a guessed inverse/name mapping.
create table public.operations_finance_credit_v2_project_scopes (
 key_id text not null references public.operations_finance_credit_v2_enrollments(key_id),
 source_project_id uuid not null,
 destination_project_id uuid not null,
 enabled boolean not null default false,
 primary key(key_id,source_project_id,destination_project_id)
);
create table public.operations_finance_credit_v2_streams (
 organization_id uuid not null,
 source_organization_id uuid not null,
 invoice_id uuid not null,
 current_revision bigint not null default 0 check(current_revision between 0 and 9007199254740991),
 primary key(organization_id,source_organization_id,invoice_id)
);
create table public.operations_finance_credit_v2_snapshots (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 source_organization_id uuid not null,
 invoice_id uuid not null,
 source_revision bigint not null check(source_revision between 1 and 9007199254740991),
 source_publication_fingerprint text not null check(source_publication_fingerprint ~ '^[0-9a-f]{64}$'),
 source_economic_revision bigint not null check(source_economic_revision between 1 and 9007199254740991),
 source_economic_publication_fingerprint text not null check(source_economic_publication_fingerprint ~ '^[0-9a-f]{64}$'),
 envelope jsonb not null,
 raw_body text not null check(octet_length(raw_body)<=262144),
 body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
 snapshot_fingerprint text not null check(snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 unique(organization_id,source_organization_id,invoice_id,source_revision),
 foreign key(organization_id,source_organization_id,invoice_id)
 references public.operations_finance_credit_v2_streams(organization_id,source_organization_id,invoice_id)
);
create table public.operations_finance_credit_v2_receipts (
 id uuid primary key,
 key_id text not null references public.operations_finance_credit_v2_enrollments(key_id),
 nonce text not null check(nonce ~ '^[A-Za-z0-9_-]{16,128}$'),
 organization_id uuid not null,
 source_organization_id uuid not null,
 invoice_id uuid not null,
 requested_source_revision bigint not null,
 snapshot_receipt_id uuid not null references public.operations_finance_credit_v2_snapshots(id),
 request_body_sha256 text not null check(request_body_sha256 ~ '^[0-9a-f]{64}$'),
 signed_at timestamptz not null,
 receipt jsonb not null,
 committed_at timestamptz not null default now(),
 unique(key_id,nonce)
);
alter table public.operations_finance_credit_v2_enrollments enable row level security;
alter table public.operations_finance_credit_v2_project_scopes enable row level security;
alter table public.operations_finance_credit_v2_streams enable row level security;
alter table public.operations_finance_credit_v2_snapshots enable row level security;
alter table public.operations_finance_credit_v2_receipts enable row level security;
revoke all on public.operations_finance_credit_v2_enrollments,public.operations_finance_credit_v2_project_scopes,
 public.operations_finance_credit_v2_streams,public.operations_finance_credit_v2_snapshots,public.operations_finance_credit_v2_receipts
 from public,anon,authenticated,service_role;
grant select,insert,update on public.operations_finance_credit_v2_enrollments,public.operations_finance_credit_v2_project_scopes to service_role;
grant select on public.operations_finance_credit_v2_streams,public.operations_finance_credit_v2_snapshots,public.operations_finance_credit_v2_receipts to service_role;

create function operations_invoice_private.credit_v2_configuration_identity_guard() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then
 raise exception 'V2 configuration identity is immutable; rotate through a new enrollment' using errcode='55000';end if;
 return new;
end $$;
revoke all on function operations_invoice_private.credit_v2_configuration_identity_guard() from public,anon,authenticated,service_role;
create trigger operations_credit_v2_enrollment_identity before update on public.operations_finance_credit_v2_enrollments
 for each row execute function operations_invoice_private.credit_v2_configuration_identity_guard();
create trigger operations_credit_v2_scope_identity before update on public.operations_finance_credit_v2_project_scopes
 for each row execute function operations_invoice_private.credit_v2_configuration_identity_guard();
create trigger operations_credit_v2_enrollment_no_delete before delete on public.operations_finance_credit_v2_enrollments
 for each row execute function public.operations_finance_invoice_immutable();
create trigger operations_credit_v2_enrollment_no_truncate before truncate on public.operations_finance_credit_v2_enrollments
 for each statement execute function public.operations_finance_invoice_immutable();
create trigger operations_credit_v2_scope_no_delete before delete on public.operations_finance_credit_v2_project_scopes
 for each row execute function public.operations_finance_invoice_immutable();
create trigger operations_credit_v2_scope_no_truncate before truncate on public.operations_finance_credit_v2_project_scopes
 for each statement execute function public.operations_finance_invoice_immutable();
create function operations_invoice_private.credit_v2_stream_guard() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'V2 evidence stream cannot be deleted' using errcode='55000';end if;
 if tg_op='INSERT' then
 if new.current_revision<>0 then raise exception 'New V2 stream must start empty' using errcode='55000';end if;
 elsif new.organization_id is distinct from old.organization_id or new.source_organization_id is distinct from old.source_organization_id
 or new.invoice_id is distinct from old.invoice_id or new.current_revision<=old.current_revision then
 raise exception 'V2 stream identity/monotonicity conflict' using errcode='55000';
 elsif not exists(select 1 from public.operations_finance_credit_v2_snapshots saved where saved.organization_id=new.organization_id
 and saved.source_organization_id=new.source_organization_id and saved.invoice_id=new.invoice_id and saved.source_revision=new.current_revision) then
 raise exception 'V2 stream must advance to its saved snapshot' using errcode='55000';end if;
 return new;
end $$;
revoke all on function operations_invoice_private.credit_v2_stream_guard() from public,anon,authenticated,service_role;
create trigger operations_credit_v2_stream_guard before insert or update or delete on public.operations_finance_credit_v2_streams
 for each row execute function operations_invoice_private.credit_v2_stream_guard();
create trigger operations_credit_v2_stream_no_truncate before truncate on public.operations_finance_credit_v2_streams
 for each statement execute function public.operations_finance_invoice_immutable();

create trigger operations_credit_v2_snapshots_immutable before update or delete on public.operations_finance_credit_v2_snapshots
 for each row execute function public.operations_finance_invoice_immutable();
create trigger operations_credit_v2_snapshots_no_truncate before truncate on public.operations_finance_credit_v2_snapshots
 for each statement execute function public.operations_finance_invoice_immutable();
create trigger operations_credit_v2_receipts_immutable before update or delete on public.operations_finance_credit_v2_receipts
 for each row execute function public.operations_finance_invoice_immutable();
create trigger operations_credit_v2_receipts_no_truncate before truncate on public.operations_finance_credit_v2_receipts
 for each statement execute function public.operations_finance_invoice_immutable();

-- Common selected economics must also agree when an opaque full fingerprint ties.
-- Relationship metadata/sequence never authorizes a changed local amount/status.
create function operations_invoice_private.credit_destination_economics_v2(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare common jsonb;item jsonb;selected jsonb:='[]';k text;
begin
 if p is null then return null;end if;
 common:=p-array['schema_version','source_revision','source_publication_fingerprint','source_economic_revision',
 'source_economic_publication_fingerprint','credit_relationship_fingerprint','credit_relation_coverage','allocations'];
 foreach k in array array['source_organization_id','destination_organization_id','invoice_id','source_observation_id'] loop
 common:=jsonb_set(common,array[k],to_jsonb(lower(p->>k)));
 end loop;
 for item in select value from jsonb_array_elements(p->'allocations') order by lower(value->>'allocation_id') loop
 item:=item-array['source_anchor','credited_source_anchor'];
 foreach k in array array['allocation_id','project_id','cost_line_id','destination_organization_id','destination_project_id'] loop
 item:=jsonb_set(item,array[k],to_jsonb(lower(item->>k)));
 end loop;
 selected:=selected||jsonb_build_array(item);
 end loop;
 return common||jsonb_build_object('allocations',selected);
end $$;
revoke all on function operations_invoice_private.credit_destination_economics_v2(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_invoice_private.credit_destination_economics_v2(jsonb) to service_role;

create function operations_invoice_private.validate_credit_destination_v2(p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare a jsonb;projected jsonb:='[]';k text;uuid_pattern text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if jsonb_typeof(p) is distinct from 'object' or p->>'schema_version' is distinct from 'finance-project-invoice-destination-v2'
 or not p ?& array['schema_version','source_organization_id','destination_organization_id','invoice_id','source_revision',
 'source_publication_fingerprint','source_observation_id','provider_document_number','document_fingerprint','invoice_kind','currency',
 'recipient_net_minor','invoice_status','provider_source_changed','accounting_state','settlement_state','provider_approval_state',
 'credit_relation_coverage','allocations','source_economic_revision','source_economic_publication_fingerprint','credit_relationship_fingerprint']
 or p-array['schema_version','source_organization_id','destination_organization_id','invoice_id','source_revision',
 'source_publication_fingerprint','source_observation_id','provider_document_number','document_fingerprint','invoice_kind','currency',
 'recipient_net_minor','invoice_status','provider_source_changed','accounting_state','settlement_state','provider_approval_state',
 'credit_relation_coverage','allocations','source_economic_revision','source_economic_publication_fingerprint','credit_relationship_fingerprint']<>'{}'::jsonb
 then raise exception 'Exact credit destination v2 required' using errcode='22023';end if;
 foreach k in array array['source_organization_id','destination_organization_id','invoice_id','source_observation_id'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or lower(p->>k) !~ uuid_pattern then raise exception 'Credit destination UUID required' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(p->'source_economic_revision') is distinct from 'number' or (p->>'source_economic_revision')::numeric not between 1 and 9007199254740991
 or trunc((p->>'source_economic_revision')::numeric)<>(p->>'source_economic_revision')::numeric
 or jsonb_typeof(p->'source_economic_publication_fingerprint') is distinct from 'string' or p->>'source_economic_publication_fingerprint' !~ '^[0-9a-f]{64}$'
 or (p->'credit_relationship_fingerprint'<>'null'::jsonb and (jsonb_typeof(p->'credit_relationship_fingerprint') is distinct from 'string'
 or p->>'credit_relationship_fingerprint' !~ '^[0-9a-f]{64}$'))
 or jsonb_typeof(p->'allocations') is distinct from 'array' then raise exception 'Credit economic provenance required' using errcode='22023';end if;
 for a in select value from jsonb_array_elements(p->'allocations') loop
 if jsonb_typeof(a) is distinct from 'object' or not a ?& array['allocation_id','project_id','cost_line_id','destination_organization_id',
 'destination_project_id','amount_minor','consumes_commitment','status','source_anchor','credited_source_anchor']
 or a-array['allocation_id','project_id','cost_line_id','destination_organization_id','destination_project_id','amount_minor',
 'consumes_commitment','status','source_anchor','credited_source_anchor']<>'{}'::jsonb then raise exception 'Exact credit allocation v2 required' using errcode='22023';end if;
 foreach k in array array['allocation_id','project_id','cost_line_id','destination_organization_id','destination_project_id'] loop
 if jsonb_typeof(a->k) is distinct from 'string' or lower(a->>k) !~ uuid_pattern then raise exception 'Credit allocation UUID required' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(a->'source_anchor') is distinct from 'string' or a->>'source_anchor' !~ '^[0-9a-f]{64}$'
 or (a->'credited_source_anchor'<>'null'::jsonb and (jsonb_typeof(a->'credited_source_anchor') is distinct from 'string'
 or a->>'credited_source_anchor' !~ '^[0-9a-f]{64}$'))
 or a->>'source_anchor'=a->>'credited_source_anchor' then raise exception 'Credit source anchor required' using errcode='22023';end if;
 if a->>'source_anchor'<>encode(sha256(convert_to(array_to_string(array['finance-invoice-allocation-source-anchor-v1',
 lower(p->>'source_organization_id'),lower(p->>'invoice_id'),lower(a->>'allocation_id'),lower(p->>'document_fingerprint'),upper(p->>'currency')],chr(10)),'UTF8')),'hex')
 then raise exception 'Credit own source anchor mismatch' using errcode='22023';end if;
 projected:=projected||jsonb_build_array(a-array['source_anchor','credited_source_anchor']);
 end loop;
 if jsonb_typeof(p->'credit_relation_coverage') is distinct from 'string' or p->>'credit_relation_coverage' not in('not_applicable','unresolved','linked')
 or (p->>'invoice_kind'='invoice' and (p->>'credit_relation_coverage'<>'not_applicable' or p->'credit_relationship_fingerprint'<>'null'::jsonb
 or exists(select 1 from jsonb_array_elements(p->'allocations') item where item->'credited_source_anchor'<>'null'::jsonb)))
 or (p->>'invoice_kind'='credit' and p->>'credit_relation_coverage'='not_applicable')
 or (p->>'credit_relation_coverage'='linked' and (p->'credit_relationship_fingerprint'='null'::jsonb or jsonb_array_length(projected)=0
 or exists(select 1 from jsonb_array_elements(p->'allocations') item where item->'credited_source_anchor'='null'::jsonb)))
 then raise exception 'Credit relationship evidence shape invalid' using errcode='22023';end if;
 perform public.operations_validate_finance_invoice_destination_v1((p-array['source_economic_revision','source_economic_publication_fingerprint',
 'credit_relationship_fingerprint'])||jsonb_build_object('schema_version','finance-project-invoice-destination-v1','allocations',projected,
 'credit_relation_coverage',case when p->>'invoice_kind'='invoice' then 'not_applicable' else 'unresolved' end));
end $$;
revoke all on function operations_invoice_private.validate_credit_destination_v2(jsonb) from public,anon,authenticated,service_role;
create function operations_invoice_private.receive_finance_project_invoice_destination_v2(p_key_id text,p_timestamp text,p_nonce text,p_raw_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; enrollment public.operations_finance_credit_v2_enrollments%rowtype;
 saved public.operations_finance_credit_v2_snapshots%rowtype; current_head bigint; requested bigint;
 source_org uuid; dest_org uuid; iid uuid; outcome text; receipt_id uuid:=gen_random_uuid(); receipt jsonb; body_hash text; previous_head public.operations_finance_credit_v2_snapshots%rowtype; v1_head public.operations_finance_invoice_snapshots%rowtype;
begin
 if p_key_id is null or p_key_id !~ '^[A-Za-z0-9_-]{4,64}$' or p_timestamp is null or p_timestamp !~ '^[1-9][0-9]{0,11}$'
 or abs(extract(epoch from clock_timestamp())-p_timestamp::bigint)>120 or p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,128}$'
 or p_raw_body is null or octet_length(p_raw_body)>262144 then
 raise exception 'Invoice transport freshness/size invalid' using errcode='22023'; end if;
 p:=p_raw_body::jsonb;
 perform operations_invoice_private.validate_credit_destination_v2(p);
 source_org:=(p->>'source_organization_id')::uuid;dest_org:=(p->>'destination_organization_id')::uuid;iid:=(p->>'invoice_id')::uuid;
 requested:=(p->>'source_revision')::bigint;
 select * into enrollment from public.operations_finance_credit_v2_enrollments
 where key_id=p_key_id and source_organization_id=source_org and destination_organization_id=dest_org and enabled for share;
 if not found then raise exception 'Invoice source/destination enrollment denied' using errcode='42501'; end if;
 -- Configuration stays fixed while the full recipient snapshot is checked/committed.
 perform 1 from public.operations_finance_credit_v2_project_scopes where key_id=p_key_id for share;
 if exists(select 1 from jsonb_array_elements(p->'allocations') a where not exists(
  select 1 from public.operations_finance_credit_v2_project_scopes s where s.key_id=p_key_id and s.enabled
   and s.source_project_id=(a->>'project_id')::uuid and s.destination_project_id=(a->>'destination_project_id')::uuid)) then
 raise exception 'Invoice project scope denied' using errcode='42501'; end if;
 perform 1 from public.projects target where target.id in
  (select (a->>'destination_project_id')::uuid from jsonb_array_elements(p->'allocations') a) for share;
 if exists(select 1 from jsonb_array_elements(p->'allocations') a where not exists(
  select 1 from public.projects target where target.id=(a->>'destination_project_id')::uuid
   and target.organization_id=dest_org and target.deleted_at is null)) then
 raise exception 'Invoice destination project tenant/deletion denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('credit-destination-v2-nonce:'||p_key_id||':'||p_nonce,0));
 if exists(select 1 from public.operations_finance_credit_v2_receipts where key_id=p_key_id and nonce=p_nonce) then
 raise exception 'Invoice nonce replay denied' using errcode='42501'; end if;
 insert into public.operations_finance_credit_v2_streams(organization_id,source_organization_id,invoice_id)
 values(dest_org,source_org,iid) on conflict do nothing;
 select current_revision into current_head from public.operations_finance_credit_v2_streams
 where organization_id=dest_org and source_organization_id=source_org and invoice_id=iid for update;
 select snapshot.* into previous_head from public.operations_finance_credit_v2_snapshots snapshot
 where snapshot.organization_id=dest_org and snapshot.source_organization_id=source_org and snapshot.invoice_id=iid and snapshot.source_revision=current_head;
 -- Atomic v1 head barrier where it exists. A later first v1 arrival is independently
 -- checked by the unified view, because the frozen v1 receiver is unchanged.
 perform current_revision from public.operations_finance_invoice_streams
 where organization_id=dest_org and source_organization_id=source_org and invoice_id=iid for share;
 select snapshot.* into v1_head from public.operations_finance_invoice_current snapshot
 where snapshot.organization_id=dest_org and snapshot.source_organization_id=source_org and snapshot.invoice_id=iid;
 if v1_head.id is not null and v1_head.source_revision=(p->>'source_economic_revision')::bigint
 and (v1_head.source_publication_fingerprint<>p->>'source_economic_publication_fingerprint'
 or operations_invoice_private.credit_destination_economics_v2(v1_head.envelope)<>operations_invoice_private.credit_destination_economics_v2(p)) then
 raise exception 'Equal v1/v2 economic fingerprint mismatch' using errcode='22023';end if;
 if requested>current_head and previous_head.id is not null and
 ((p->>'source_economic_revision')::bigint<previous_head.source_economic_revision or
 ((p->>'source_economic_revision')::bigint=previous_head.source_economic_revision and
 (p->>'source_economic_publication_fingerprint'<>previous_head.source_economic_publication_fingerprint
 or operations_invoice_private.credit_destination_economics_v2(previous_head.envelope)<>operations_invoice_private.credit_destination_economics_v2(p)))) then
 raise exception 'V2 economic version cannot decrease or conflict' using errcode='22023';end if;
 select * into saved from public.operations_finance_credit_v2_snapshots where organization_id=dest_org and source_organization_id=source_org
 and invoice_id=iid and source_revision=requested;
 if found then
  if saved.raw_body<>p_raw_body or saved.envelope<>p then raise exception 'Changed immutable invoice revision denied' using errcode='22023'; end if;
  outcome:='replayed';
 elsif requested<current_head then
  select * into saved from public.operations_finance_credit_v2_snapshots where organization_id=dest_org and source_organization_id=source_org
   and invoice_id=iid and source_revision=current_head;
  outcome:='stale';
 elsif requested=current_head then
  raise exception 'Invoice stream snapshot missing' using errcode='55000';
 else
  insert into public.operations_finance_credit_v2_snapshots(organization_id,source_organization_id,invoice_id,source_revision,
   source_publication_fingerprint,source_economic_revision,source_economic_publication_fingerprint,envelope,raw_body,body_sha256,snapshot_fingerprint)
  values(dest_org,source_org,iid,requested,p->>'source_publication_fingerprint',(p->>'source_economic_revision')::bigint,p->>'source_economic_publication_fingerprint',p,p_raw_body,
   encode(sha256(convert_to(p_raw_body,'UTF8')),'hex'),encode(sha256(convert_to(p_raw_body,'UTF8')),'hex')) returning * into saved;
  update public.operations_finance_credit_v2_streams set current_revision=requested
   where organization_id=dest_org and source_organization_id=source_org and invoice_id=iid;
  current_head:=requested;outcome:='accepted';
 end if;
 if saved.id is null then raise exception 'Invoice committed snapshot missing' using errcode='55000'; end if;
 body_hash:=encode(sha256(convert_to(p_raw_body,'UTF8')),'hex');
 receipt:=jsonb_build_object('schema','finance-project-invoice-destination-receipt-v2','outcome',outcome,
 'source_organization_id',source_org,'destination_organization_id',dest_org,'invoice_id',iid,
 'requested_source_revision',requested,'applied_source_revision',saved.source_revision,'current_source_revision',current_head,
 'request_body_sha256',body_hash,'snapshot_receipt_id',saved.id,'snapshot_fingerprint',saved.snapshot_fingerprint,
 'receipt_id',receipt_id,'shadow_only',true);
 insert into public.operations_finance_credit_v2_receipts(id,key_id,nonce,organization_id,source_organization_id,invoice_id,
 requested_source_revision,snapshot_receipt_id,request_body_sha256,signed_at,receipt)
 values(receipt_id,p_key_id,p_nonce,dest_org,source_org,iid,requested,saved.id,body_hash,to_timestamp(p_timestamp::bigint),receipt);
 return receipt;
end $$;
revoke all on function operations_invoice_private.receive_finance_project_invoice_destination_v2(text,text,text,text) from public,anon,authenticated;
grant execute on function operations_invoice_private.receive_finance_project_invoice_destination_v2(text,text,text,text) to service_role;
create function public.operations_receive_finance_project_invoice_destination_v2(p_key_id text,p_timestamp text,p_nonce text,p_raw_body text)
returns jsonb language sql security invoker set search_path='' as $$
 select operations_invoice_private.receive_finance_project_invoice_destination_v2(p_key_id,p_timestamp,p_nonce,p_raw_body);
$$;
revoke all on function public.operations_receive_finance_project_invoice_destination_v2(text,text,text,text) from public,anon,authenticated;
grant execute on function public.operations_receive_finance_project_invoice_destination_v2(text,text,text,text) to service_role;

create view public.operations_finance_invoice_economic_current_v2 with (security_invoker=true) as
with v2 as (select snapshot.* from public.operations_finance_credit_v2_streams head join public.operations_finance_credit_v2_snapshots snapshot
 on snapshot.organization_id=head.organization_id and snapshot.source_organization_id=head.source_organization_id
 and snapshot.invoice_id=head.invoice_id and snapshot.source_revision=head.current_revision),
joined as (select coalesce(a.organization_id,b.organization_id) organization_id,coalesce(a.source_organization_id,b.source_organization_id) source_organization_id,
 coalesce(a.invoice_id,b.invoice_id) invoice_id,a.id v1_id,b.id v2_id,a.source_revision v1_revision,b.source_economic_revision v2_revision,
 a.source_publication_fingerprint v1_fp,b.source_economic_publication_fingerprint v2_fp,a.envelope v1_envelope,b.envelope v2_envelope,
 a.body_sha256 v1_raw_sha,b.body_sha256 v2_raw_sha,
 coalesce(a.source_revision=b.source_economic_revision and (a.source_publication_fingerprint<>b.source_economic_publication_fingerprint
 or operations_invoice_private.credit_destination_economics_v2(a.envelope)<>operations_invoice_private.credit_destination_economics_v2(b.envelope)),false) conflict
 from public.operations_finance_invoice_current a full join v2 b on a.organization_id=b.organization_id
 and a.source_organization_id=b.source_organization_id and a.invoice_id=b.invoice_id)
select organization_id,source_organization_id,invoice_id,
 case when conflict then 'conflict' when v2_id is not null and (v1_id is null or v2_revision>=v1_revision) then 'v2' else 'v1' end source_protocol,
 greatest(v1_revision,v2_revision) source_economic_revision,
 case when conflict then null when v2_id is not null and (v1_id is null or v2_revision>=v1_revision) then v2_fp else v1_fp end source_economic_fingerprint,
 case when conflict then null when v2_id is not null and (v1_id is null or v2_revision>=v1_revision) then v2_id else v1_id end snapshot_id,
 case when conflict then null when v2_id is not null and (v1_id is null or v2_revision>=v1_revision) then v2_raw_sha else v1_raw_sha end raw_body_sha256,
 case when conflict then null when v2_id is not null and (v1_id is null or v2_revision>=v1_revision) then v2_envelope else v1_envelope end envelope,
 case when conflict then 'economic_fingerprint_conflict' else 'saved_receiver_heads_only' end source_currentness,
 'unresolved'::text local_credit_eligibility,null::bigint eac_minor
from joined;
revoke all on public.operations_finance_invoice_economic_current_v2 from public,anon,authenticated;
grant select on public.operations_finance_invoice_economic_current_v2 to service_role;
