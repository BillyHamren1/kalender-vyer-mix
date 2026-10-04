\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit nologin nosuperuser nocreatedb nocreaterole noreplication bypassrls;
create schema auth;
create schema operations_economy_private;
create schema operations_hired_private;
grant usage on schema operations_economy_private to authenticated,service_role;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function operations_economy_private.canonical_json_v1(p jsonb) returns text
language sql immutable set search_path='' as $$select p::text$$;
create function operations_economy_private.invoice_kernel_read_gate_guard_v1() returns trigger
language plpgsql as $$begin if new.organization_id is distinct from old.organization_id then raise exception 'gate_identity_immutable' using errcode='55000';end if;return new;end$$;
create function public.operations_personnel_evidence_immutable() returns trigger
language plpgsql as $$begin raise exception 'immutable' using errcode='55000';end$$;

create table public.projects(id uuid primary key,organization_id uuid not null,deleted_at timestamptz);
create function operations_economy_private.authorize_obligation_admin_v1(p_project uuid) returns uuid
language plpgsql security definer set search_path='' as $$declare org uuid:=nullif(current_setting('request.jwt.claim.organization_id',true),'')::uuid;begin
  if auth.uid() is null or org is null or current_setting('request.jwt.claim.role',true)<>'admin' then raise exception 'obligation_admin_required' using errcode='42501';end if;
  perform 1 from public.projects where id=p_project and organization_id=org and deleted_at is null;
  if not found then raise exception 'obligation_project_access_denied' using errcode='42501';end if;return org;
end$$;

create table public.operations_project_obligation_heads(
  organization_id uuid,project_id uuid,obligation_id uuid,currency text,category text,cost_basis text,current_revision bigint,
  primary key(organization_id,obligation_id));
create table public.operations_project_obligation_baselines(
  event_id uuid primary key,organization_id uuid,project_id uuid,obligation_id uuid,revision bigint,currency text,category text,cost_basis text,
  estimate_minor bigint,committed_minor bigint,fingerprint text);
create table public.operations_project_obligation_invoice_bindings(
  event_id uuid primary key,binding_sequence bigint generated always as identity,organization_id uuid,project_id uuid,obligation_id uuid,
  source_anchor text,baseline_event_id uuid,source_snapshot_id uuid,source_allocation_id uuid,source_organization_id uuid,invoice_id uuid,
  source_economic_revision bigint,source_economic_fingerprint text,source_raw_body_sha256 text,source_status text);
create table public.operations_finance_invoice_economic_current_v2(
  organization_id uuid,source_organization_id uuid,invoice_id uuid,source_economic_revision bigint,source_economic_fingerprint text,
  source_currentness text,envelope jsonb,primary key(organization_id,source_organization_id,invoice_id));
create table public.operations_obligation_source_policy_heads(
  organization_id uuid,project_id uuid,obligation_id uuid,source_anchor text,current_revision bigint,
  primary key(organization_id,obligation_id,source_anchor));
create table public.operations_obligation_source_policies(
  event_id uuid primary key,organization_id uuid,project_id uuid,obligation_id uuid,source_anchor text,policy_revision bigint,
  baseline_event_id uuid,binding_event_id uuid,source_economic_revision bigint,source_economic_fingerprint text,
  replaces_estimate_minor bigint,consumes_commitment_minor bigint);
create table public.operations_obligation_credit_capacity_heads(
  organization_id uuid,project_id uuid,obligation_id uuid,source_anchor text,original_anchor text,current_revision bigint,
  primary key(organization_id,source_anchor));
create table public.operations_obligation_credit_capacity_events(
  event_id uuid primary key,organization_id uuid,project_id uuid,obligation_id uuid,source_anchor text,original_anchor text,revision bigint,
  reserved_minor bigint,source_proof_fingerprint text);
create function operations_economy_private.read_credit_capacity_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('state','local_capacity_proven','event_id',e.event_id)
  from public.operations_obligation_credit_capacity_heads h join public.operations_obligation_credit_capacity_events e
    on e.organization_id=h.organization_id and e.source_anchor=h.source_anchor and e.revision=h.current_revision
  where h.organization_id=p_org and h.project_id=p_project and h.obligation_id=p_obligation and h.source_anchor=p_anchor
$$;
create table public.operations_hired_assignment_heads(
  organization_id uuid,source_identity text,current_revision bigint,primary key(organization_id,source_identity));
create table public.operations_hired_assignment_events(
  event_id uuid primary key,organization_id uuid,project_id uuid,obligation_id uuid,source_identity text,revision bigint,fingerprint text);
create table public.operations_hired_test_sources(
  organization_id uuid,project_id uuid,obligation_id uuid,source_identity text,state text,coverage text,amount_minor bigint,assignment_event_id uuid,
  primary key(organization_id,source_identity));
create function operations_hired_private.read_source_v1(p_org uuid,p_project uuid,p_obligation uuid,p_identity text)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('state',state,'assignment_event_id',assignment_event_id,
    'current_source',jsonb_build_object('coverage',coverage,'amount_minor',amount_minor))
  from public.operations_hired_test_sources where organization_id=p_org and project_id=p_project and obligation_id=p_obligation and source_identity=p_identity
$$;

insert into public.projects values
  ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null);
insert into public.operations_project_obligation_heads values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','SEK','supplier','invoice',1);
insert into public.operations_project_obligation_baselines values
  ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1,'SEK','supplier','invoice',5000,5000,repeat('4',64));
insert into public.operations_project_obligation_invoice_bindings(event_id,organization_id,project_id,obligation_id,source_anchor,baseline_event_id,source_snapshot_id,source_allocation_id,source_organization_id,invoice_id,source_economic_revision,source_economic_fingerprint,source_raw_body_sha256,source_status)
values('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('a',64),'44444444-4444-4444-8444-444444444444','56565656-5656-4565-8565-565656565656','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888',1,repeat('1',64),repeat('2',64),'preliminary');
insert into public.operations_finance_invoice_economic_current_v2 values
  ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888',1,repeat('1',64),'saved_receiver_heads_only',
   jsonb_build_object('recipient_net_minor',6000,'allocations',jsonb_build_array(jsonb_build_object('allocation_id','66666666-6666-4666-8666-666666666666','amount_minor',5400,'status','preliminary'))));
insert into public.operations_obligation_source_policy_heads values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('a',64),1);
insert into public.operations_obligation_source_policies values
  ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('a',64),1,'44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',1,repeat('1',64),5000,5000);

set request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';
set request.jwt.claim.organization_id='11111111-1111-4111-8111-111111111111';
set request.jwt.claim.role='admin';
