-- DORMANT DRAFT: not a migration, no enrollment/key provisioning or dispatch activation.
-- Trusted Operations publisher attests its TLS-authenticated Time read, NOT a Time signature.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table operations_economy_private.personnel_issuers_v1 (
 issuer_id uuid not null, enrollment_epoch uuid not null, organization_id uuid not null,
 destination_organization_id uuid not null, secret bytea not null check(octet_length(secret)>=32),
 enabled boolean not null default false, primary key(issuer_id,enrollment_epoch)
);
create table operations_economy_private.personnel_issuer_streams_v1 (
 issuer_id uuid not null, enrollment_epoch uuid not null, source_stream_id text not null,
 revision_floor bigint not null check(revision_floor between 0 and 9007199254740990),
 source_binding jsonb not null, primary key(issuer_id,enrollment_epoch,source_stream_id),
 foreign key(issuer_id,enrollment_epoch) references operations_economy_private.personnel_issuers_v1
);
create table operations_economy_private.personnel_issuer_nonces_v1 (
 issuer_id uuid not null, enrollment_epoch uuid not null, nonce uuid not null,
 command_sha256 text not null, primary key(issuer_id,enrollment_epoch,nonce),
 foreign key(issuer_id,enrollment_epoch) references operations_economy_private.personnel_issuers_v1
);
create table operations_economy_private.personnel_accepted_issuances_v1 (
 outbox_id uuid primary key references public.operations_personnel_cost_outbox(id),
 issuer_id uuid not null, enrollment_epoch uuid not null, command_sha256 text not null,
 occurred_at timestamptz not null, raw_envelope text not null, fingerprint text not null,
 foreign key(issuer_id,enrollment_epoch) references operations_economy_private.personnel_issuers_v1,
 check(fingerprint=encode(sha256(convert_to(raw_envelope,'UTF8')),'hex'))
);
revoke all on operations_economy_private.personnel_issuers_v1,
 operations_economy_private.personnel_issuer_streams_v1,operations_economy_private.personnel_issuer_nonces_v1,
 operations_economy_private.personnel_accepted_issuances_v1 from public,anon,authenticated,service_role;
alter table operations_economy_private.personnel_issuers_v1 enable row level security;
alter table operations_economy_private.personnel_issuer_streams_v1 enable row level security;
alter table operations_economy_private.personnel_issuer_nonces_v1 enable row level security;
alter table operations_economy_private.personnel_accepted_issuances_v1 enable row level security;
create trigger personnel_accepted_issuances_immutable before update or delete on operations_economy_private.personnel_accepted_issuances_v1
 for each row execute function public.operations_personnel_evidence_immutable();
create trigger personnel_accepted_issuances_no_truncate before truncate on operations_economy_private.personnel_accepted_issuances_v1
 for each statement execute function public.operations_personnel_evidence_immutable();
create trigger personnel_issuer_streams_immutable before update or delete on operations_economy_private.personnel_issuer_streams_v1
 for each row execute function public.operations_personnel_evidence_immutable();
create trigger personnel_issuer_streams_no_truncate before truncate on operations_economy_private.personnel_issuer_streams_v1
 for each statement execute function public.operations_personnel_evidence_immutable();

-- Read-only ancestry predicate reveals no secret or monetary payload.
create function operations_economy_private.personnel_issued_ancestor_v1(p_org uuid,p_stream text,p_revision bigint,p_issuer uuid,p_epoch uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from operations_economy_private.personnel_accepted_issuances_v1 m
 join public.operations_personnel_cost_outbox o on o.id=m.outbox_id
 join operations_economy_private.personnel_issuers_v1 i on i.issuer_id=m.issuer_id and i.enrollment_epoch=m.enrollment_epoch
 where o.organization_id=p_org and o.source_time_stream_id=p_stream and o.source_revision=p_revision
 and m.issuer_id=p_issuer and m.enrollment_epoch=p_epoch and i.enabled and i.organization_id=p_org)
$$;
revoke all on function operations_economy_private.personnel_issued_ancestor_v1(uuid,text,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function operations_economy_private.personnel_issued_ancestor_v1(uuid,text,bigint,uuid,uuid) to service_role;
create function public.get_operations_personnel_issued_ancestor_v1(p_org uuid,p_stream text,p_revision bigint,p_issuer uuid,p_epoch uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select operations_economy_private.personnel_issued_ancestor_v1(p_org,p_stream,p_revision,p_issuer,p_epoch)
$$;
revoke all on function public.get_operations_personnel_issued_ancestor_v1(uuid,text,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_operations_personnel_issued_ancestor_v1(uuid,text,bigint,uuid,uuid) to service_role;

create function operations_economy_private.issue_personnel_v1(p_body text,p_timestamp bigint,p_nonce uuid,p_signature text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;i operations_economy_private.personnel_issuers_v1%rowtype;
 f operations_economy_private.personnel_issuer_streams_v1%rowtype;
 b public.operations_personnel_source_bindings%rowtype;o public.operations_personnel_cost_outbox%rowtype;
 m operations_economy_private.personnel_accepted_issuances_v1%rowtype;
 result jsonb;digest text;expected bigint;stream text;org uuid;worker uuid;prior text;issued timestamptz;envelope text;
begin
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
 if c#>>'{snapshot,organization_id}' is distinct from org::text or c#>>'{snapshot,source_time_stream_id}' is distinct from stream
  or (c#>>'{snapshot,source_revision}')::bigint is distinct from expected+1 then raise exception 'issuer_source_mismatch' using errcode='22023';end if;
 select * into f from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=i.issuer_id and enrollment_epoch=i.enrollment_epoch and source_stream_id=stream for share;
 if not found or expected<f.revision_floor then raise exception 'issuer_stream_below_floor_or_absent' using errcode='42501';end if;
 select * into b from public.operations_personnel_source_bindings where organization_id=org and worker_id=worker for share;
 if not found or not b.enabled or to_jsonb(b) is distinct from f.source_binding then raise exception 'issuer_source_binding_changed' using errcode='42501';end if;
 perform 1 from public.operations_personnel_transport_routes where organization_id=org and destination_organization_id=i.destination_organization_id for share;
 if not found then raise exception 'issuer_destination_changed' using errcode='42501';end if;
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
 result:=public.publish_operations_personnel_cost_ingress_v1(c->'snapshot',c->'raw_time_snapshot',c->'source_evidence',expected,c->>'idempotency_key');
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
  insert into operations_economy_private.personnel_accepted_issuances_v1 values(o.id,i.issuer_id,i.enrollment_epoch,digest,issued,envelope,encode(sha256(convert_to(envelope,'UTF8')),'hex')) returning * into m;
 end if;
 return jsonb_build_object('schema','operations-personnel-issued-receipt.v1','status',result->>'status','outbox_id',o.id,'source_revision',o.source_revision,'fingerprint',m.fingerprint,'occurred_at',m.occurred_at);
end;$$;
revoke all on function operations_economy_private.issue_personnel_v1(text,bigint,uuid,text) from public,anon,authenticated,service_role;
-- No exposed wrapper or caller grant: dormant until the complete source/receiver
-- and outbox mode-isolation closure is reviewed. Tests invoke as database owner.
