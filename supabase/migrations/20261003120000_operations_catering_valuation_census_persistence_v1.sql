-- Additive, default-inaccessible Catering valuation persistence kernel.
-- Operations owns mapping/currentness/history. This migration computes no total,
-- publishes nothing to Finance and accepts only service-role calls.

create table public.operations_catering_valuation_mapping_heads (
  organization_id uuid not null,
  economic_scope_id uuid not null,
  current_revision bigint not null default 0 check (current_revision between 0 and 9007199254740991),
  primary key (organization_id,economic_scope_id),
  foreign key (organization_id,economic_scope_id)
    references public.operations_project_scope_heads(organization_id,economic_scope_id)
);

create table public.operations_catering_valuation_mapping_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  economic_scope_id uuid not null,
  mapping_revision bigint not null check (mapping_revision between 1 and 9007199254740991),
  scope_revision bigint not null,
  scope_fingerprint text not null check (scope_fingerprint ~ '^[0-9a-f]{64}$'),
  mapping jsonb not null,
  mapping_raw text not null,
  mapping_fingerprint text not null check (mapping_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (organization_id,economic_scope_id,mapping_revision),
  foreign key (organization_id,economic_scope_id)
    references public.operations_catering_valuation_mapping_heads(organization_id,economic_scope_id),
  foreign key (organization_id,economic_scope_id,scope_revision)
    references public.operations_project_scope_snapshots(organization_id,economic_scope_id,scope_revision)
);

create table public.operations_catering_valuation_census_heads (
  organization_id uuid not null,
  economic_scope_id uuid not null,
  current_observed_revision bigint not null default 0
    check (current_observed_revision between 0 and 9007199254740991),
  primary key (organization_id,economic_scope_id),
  foreign key (organization_id,economic_scope_id)
    references public.operations_project_scope_heads(organization_id,economic_scope_id)
);

create table public.operations_catering_valuation_census_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  economic_scope_id uuid not null,
  observed_revision bigint not null check (observed_revision between 1 and 9007199254740991),
  census_id uuid not null,
  census_revision bigint not null check (census_revision between 1 and 9007199254740991),
  census_fingerprint text not null check (census_fingerprint ~ '^[0-9a-f]{64}$'),
  previous_census_id uuid,
  previous_census_revision bigint,
  previous_census_fingerprint text,
  mapping_revision bigint not null,
  mapping_fingerprint text not null,
  command jsonb not null,
  command_raw text not null,
  command_sha256 text not null check (command_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id,economic_scope_id,observed_revision),
  unique (organization_id,economic_scope_id,census_id),
  unique (organization_id,economic_scope_id,census_revision),
  unique (organization_id,idempotency_key),
  foreign key (organization_id,economic_scope_id)
    references public.operations_catering_valuation_census_heads(organization_id,economic_scope_id),
  foreign key (organization_id,economic_scope_id,mapping_revision)
    references public.operations_catering_valuation_mapping_snapshots(organization_id,economic_scope_id,mapping_revision),
  check ((census_revision=1 and previous_census_id is null and previous_census_revision is null and previous_census_fingerprint is null)
      or (census_revision>1 and previous_census_id is not null and previous_census_revision=census_revision-1
          and previous_census_fingerprint ~ '^[0-9a-f]{64}$'))
);

create table public.operations_catering_valuation_basis_observations (
  organization_id uuid not null,
  economic_scope_id uuid not null,
  observed_revision bigint not null,
  booking_id text not null,
  basis text not null check (basis in ('ingredient_estimate','purchase_estimate','stock_consumption')),
  source_stream_id uuid not null,
  source_observation_id uuid not null,
  source_sequence bigint not null check(source_sequence between 1 and 9007199254740991),
  source_as_of timestamptz not null,
  previous_source_observation_id uuid,
  previous_source_sequence bigint,
  previous_source_fingerprint text,
  expected_effective_observed_revision bigint not null,
  expected_effective_source_observation_id uuid,
  expected_effective_source_sequence bigint,
  expected_effective_source_fingerprint text,
  mapping_revision bigint not null,
  mapping_fingerprint text not null,
  currentness text not null check (currentness in ('current','current_empty','unavailable')),
  unavailable_reason text check (unavailable_reason in ('source_unreachable','source_head_missing')),
  source_revision text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  lines jsonb not null,
  primary key (organization_id,economic_scope_id,observed_revision,booking_id,basis),
  unique (organization_id,economic_scope_id,booking_id,basis,source_observation_id),
  foreign key (organization_id,economic_scope_id,observed_revision)
    references public.operations_catering_valuation_census_snapshots(organization_id,economic_scope_id,observed_revision),
  check ((currentness='current' and unavailable_reason is null and jsonb_typeof(lines)='array' and jsonb_array_length(lines)>0)
      or (currentness='current_empty' and unavailable_reason is null and lines='[]'::jsonb)
      or (currentness='unavailable' and unavailable_reason is not null and lines='[]'::jsonb))
);

create table public.operations_catering_valuation_observed_source_heads (
  organization_id uuid not null,
  economic_scope_id uuid not null,
  booking_id text not null,
  basis text not null check (basis in ('ingredient_estimate','purchase_estimate','stock_consumption')),
  source_stream_id uuid not null,
  source_observation_id uuid not null,
  source_sequence bigint not null,
  source_as_of timestamptz not null,
  source_fingerprint text not null,
  observed_revision bigint not null,
  primary key (organization_id,economic_scope_id,booking_id,basis),
  foreign key (organization_id,economic_scope_id,observed_revision,booking_id,basis)
    references public.operations_catering_valuation_basis_observations(organization_id,economic_scope_id,observed_revision,booking_id,basis)
);

create table public.operations_catering_valuation_effective_basis_heads (
  organization_id uuid not null,
  economic_scope_id uuid not null,
  booking_id text not null,
  basis text not null check (basis in ('ingredient_estimate','purchase_estimate','stock_consumption')),
  effective_observed_revision bigint not null,
  source_stream_id uuid not null,
  source_observation_id uuid not null,
  source_sequence bigint not null,
  source_fingerprint text not null,
  source_as_of timestamptz not null,
  currentness text not null check (currentness in ('current','current_empty')),
  primary key (organization_id,economic_scope_id,booking_id,basis),
  foreign key (organization_id,economic_scope_id,effective_observed_revision,booking_id,basis)
    references public.operations_catering_valuation_basis_observations(organization_id,economic_scope_id,observed_revision,booking_id,basis)
);

create table public.operations_catering_valuation_origin_ownership (
  organization_id uuid not null,
  economic_origin_id uuid not null,
  economic_scope_id uuid not null,
  booking_id text not null,
  basis text not null check (basis in ('ingredient_estimate','purchase_estimate','stock_consumption')),
  first_observed_revision bigint not null,
  primary key (organization_id,economic_origin_id),
  foreign key (organization_id,economic_scope_id,first_observed_revision,booking_id,basis)
    references public.operations_catering_valuation_basis_observations(organization_id,economic_scope_id,observed_revision,booking_id,basis)
);

create table public.operations_catering_valuation_origin_events (
  organization_id uuid not null,
  source_event_id uuid not null,
  economic_origin_id uuid not null,
  economic_scope_id uuid not null,
  booking_id text not null,
  basis text not null,
  observed_revision bigint not null,
  replaces_source_event_id uuid,
  amount_minor bigint,
  issue_code text,
  primary key (organization_id,source_event_id),
  foreign key (organization_id,economic_origin_id)
    references public.operations_catering_valuation_origin_ownership(organization_id,economic_origin_id),
  foreign key (organization_id,economic_scope_id,observed_revision,booking_id,basis)
    references public.operations_catering_valuation_basis_observations(organization_id,economic_scope_id,observed_revision,booking_id,basis),
  foreign key (organization_id,replaces_source_event_id)
    references public.operations_catering_valuation_origin_events(organization_id,source_event_id),
  check ((amount_minor is null and issue_code is not null and length(issue_code) between 1 and 128)
      or (amount_minor is not null and amount_minor between -9007199254740991 and 9007199254740991 and issue_code is null)),
  check (replaces_source_event_id is null or replaces_source_event_id<>source_event_id)
);

create table public.operations_catering_valuation_receipts (
  organization_id uuid not null,
  idempotency_key text not null,
  economic_scope_id uuid not null,
  observed_revision bigint not null,
  command_sha256 text not null check (command_sha256 ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,idempotency_key),
  foreign key (organization_id,economic_scope_id,observed_revision)
    references public.operations_catering_valuation_census_snapshots(organization_id,economic_scope_id,observed_revision)
);

alter table public.operations_catering_valuation_mapping_heads enable row level security;
alter table public.operations_catering_valuation_mapping_snapshots enable row level security;
alter table public.operations_catering_valuation_census_heads enable row level security;
alter table public.operations_catering_valuation_census_snapshots enable row level security;
alter table public.operations_catering_valuation_basis_observations enable row level security;
alter table public.operations_catering_valuation_observed_source_heads enable row level security;
alter table public.operations_catering_valuation_effective_basis_heads enable row level security;
alter table public.operations_catering_valuation_origin_ownership enable row level security;
alter table public.operations_catering_valuation_origin_events enable row level security;
alter table public.operations_catering_valuation_receipts enable row level security;

revoke all on public.operations_catering_valuation_mapping_heads,
  public.operations_catering_valuation_mapping_snapshots,
  public.operations_catering_valuation_census_heads,
  public.operations_catering_valuation_census_snapshots,
  public.operations_catering_valuation_basis_observations,
  public.operations_catering_valuation_observed_source_heads,
  public.operations_catering_valuation_effective_basis_heads,
  public.operations_catering_valuation_origin_ownership,
  public.operations_catering_valuation_origin_events,
  public.operations_catering_valuation_receipts from public,anon,authenticated,service_role;

grant select on public.operations_catering_valuation_mapping_heads,
  public.operations_catering_valuation_mapping_snapshots,
  public.operations_catering_valuation_census_heads,
  public.operations_catering_valuation_census_snapshots,
  public.operations_catering_valuation_basis_observations,
  public.operations_catering_valuation_observed_source_heads,
  public.operations_catering_valuation_effective_basis_heads,
  public.operations_catering_valuation_origin_ownership,
  public.operations_catering_valuation_origin_events,
  public.operations_catering_valuation_receipts to service_role;

create trigger operations_catering_valuation_mapping_snapshots_immutable
before update or delete on public.operations_catering_valuation_mapping_snapshots
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_census_snapshots_immutable
before update or delete on public.operations_catering_valuation_census_snapshots
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_observations_immutable
before update or delete on public.operations_catering_valuation_basis_observations
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_origins_immutable
before update or delete on public.operations_catering_valuation_origin_ownership
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_events_immutable
before update or delete on public.operations_catering_valuation_origin_events
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_receipts_immutable
before update or delete on public.operations_catering_valuation_receipts
for each row execute function public.operations_personnel_evidence_immutable();

create trigger operations_catering_valuation_mapping_snapshots_no_truncate
before truncate on public.operations_catering_valuation_mapping_snapshots
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_census_snapshots_no_truncate
before truncate on public.operations_catering_valuation_census_snapshots
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_observations_no_truncate
before truncate on public.operations_catering_valuation_basis_observations
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_observed_source_heads_no_truncate
before truncate on public.operations_catering_valuation_observed_source_heads
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_effective_heads_no_truncate
before truncate on public.operations_catering_valuation_effective_basis_heads
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_origins_no_truncate
before truncate on public.operations_catering_valuation_origin_ownership
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_events_no_truncate
before truncate on public.operations_catering_valuation_origin_events
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_catering_valuation_receipts_no_truncate
before truncate on public.operations_catering_valuation_receipts
for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.guard_catering_valuation_mapping_head_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'UPDATE' then raise exception 'catering_valuation_mapping_head_cannot_be_removed' using errcode='55000'; end if;
  if row(new.organization_id,new.economic_scope_id) is distinct from row(old.organization_id,old.economic_scope_id)
    or new.current_revision<>old.current_revision+1
    or not exists(select 1 from public.operations_catering_valuation_mapping_snapshots
      where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id
        and mapping_revision=new.current_revision)
  then raise exception 'catering_valuation_saved_mapping_head_required' using errcode='55000'; end if;
  return new;
end;$$;
revoke all on function operations_economy_private.guard_catering_valuation_mapping_head_v1()
from public,anon,authenticated,service_role;
create trigger operations_catering_valuation_mapping_head_guard
before update or delete on public.operations_catering_valuation_mapping_heads
for each row execute function operations_economy_private.guard_catering_valuation_mapping_head_v1();
create trigger operations_catering_valuation_mapping_head_no_truncate
before truncate on public.operations_catering_valuation_mapping_heads
for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.guard_catering_valuation_census_head_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'UPDATE' then raise exception 'catering_valuation_census_head_cannot_be_removed' using errcode='55000'; end if;
  if row(new.organization_id,new.economic_scope_id) is distinct from row(old.organization_id,old.economic_scope_id)
    or new.current_observed_revision<>old.current_observed_revision+1
    or not exists(select 1 from public.operations_catering_valuation_census_snapshots
      where organization_id=new.organization_id and economic_scope_id=new.economic_scope_id
        and observed_revision=new.current_observed_revision)
  then raise exception 'catering_valuation_saved_census_head_required' using errcode='55000'; end if;
  return new;
end;$$;
revoke all on function operations_economy_private.guard_catering_valuation_census_head_v1()
from public,anon,authenticated,service_role;
create trigger operations_catering_valuation_census_head_guard
before update or delete on public.operations_catering_valuation_census_heads
for each row execute function operations_economy_private.guard_catering_valuation_census_head_v1();
create trigger operations_catering_valuation_census_head_no_truncate
before truncate on public.operations_catering_valuation_census_heads
for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.guard_catering_valuation_observed_source_head_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'UPDATE' then raise exception 'catering_valuation_observed_source_head_cannot_be_removed' using errcode='55000'; end if;
  if row(new.organization_id,new.economic_scope_id,new.booking_id,new.basis)
       is distinct from row(old.organization_id,old.economic_scope_id,old.booking_id,old.basis)
    or new.source_stream_id is distinct from old.source_stream_id
    or new.source_sequence<>old.source_sequence+1 or new.source_as_of<=old.source_as_of
    or new.observed_revision<=old.observed_revision
  then raise exception 'catering_valuation_observed_source_head_regression' using errcode='55000'; end if;
  return new;
end;$$;
revoke all on function operations_economy_private.guard_catering_valuation_observed_source_head_v1()
from public,anon,authenticated,service_role;
create trigger operations_catering_valuation_observed_source_head_guard
before update or delete on public.operations_catering_valuation_observed_source_heads
for each row execute function operations_economy_private.guard_catering_valuation_observed_source_head_v1();

create function operations_economy_private.guard_catering_valuation_effective_head_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'UPDATE' then raise exception 'catering_valuation_effective_head_cannot_be_removed' using errcode='55000'; end if;
  if row(new.organization_id,new.economic_scope_id,new.booking_id,new.basis)
       is distinct from row(old.organization_id,old.economic_scope_id,old.booking_id,old.basis)
    or new.source_stream_id is distinct from old.source_stream_id
    or new.effective_observed_revision<=old.effective_observed_revision
    or new.source_sequence<=old.source_sequence or new.source_as_of<=old.source_as_of
  then raise exception 'catering_valuation_effective_head_regression' using errcode='55000'; end if;
  return new;
end;$$;
revoke all on function operations_economy_private.guard_catering_valuation_effective_head_v1()
from public,anon,authenticated,service_role;
create trigger operations_catering_valuation_effective_head_guard
before update or delete on public.operations_catering_valuation_effective_basis_heads
for each row execute function operations_economy_private.guard_catering_valuation_effective_head_v1();

create function operations_economy_private.catering_valuation_exact_keys_v1(p_value jsonb,p_keys text[])
returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(p_value)='object'
    and (select coalesce(array_agg(k order by k collate "C"),'{}'::text[]) from jsonb_object_keys(p_value) k)
      = (select array_agg(k order by k collate "C") from unnest(p_keys) k);
$$;
revoke all on function operations_economy_private.catering_valuation_exact_keys_v1(jsonb,text[])
from public,anon,authenticated,service_role;

create function operations_economy_private.publish_catering_valuation_census_v1(p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_org uuid; v_scope uuid; v_scope_expected bigint; v_scope_fingerprint text;
  v_scope_head public.operations_project_scope_heads%rowtype;
  v_scope_snapshot public.operations_project_scope_snapshots%rowtype;
  v_mapping jsonb; v_mapping_expected bigint; v_mapping_revision bigint; v_mapping_fingerprint text;
  v_mapping_raw text; v_mapping_head public.operations_catering_valuation_mapping_heads%rowtype;
  v_mapping_current bigint:=0; v_stored_mapping public.operations_catering_valuation_mapping_snapshots%rowtype;
  v_census jsonb; v_census_head public.operations_catering_valuation_census_heads%rowtype;
  v_observed_expected bigint; v_observed_current bigint:=0; v_observed_next bigint;
  v_census_id uuid; v_census_revision bigint; v_census_fingerprint text;
  v_previous_id uuid; v_previous_revision bigint; v_previous_fingerprint text;
  v_previous public.operations_catering_valuation_census_snapshots%rowtype;
  v_command_raw text; v_command_hash text; v_idempotency text; v_receipt_row public.operations_catering_valuation_receipts%rowtype;
  v_receipt jsonb; v_booking_ids text[]; v_head jsonb; v_line jsonb; v_booking text; v_basis text;
  v_currentness text; v_reason text; v_lines jsonb; v_event public.operations_catering_valuation_origin_events%rowtype;
  v_source_observation_id uuid; v_source_sequence bigint; v_source_as_of timestamptz;
  v_previous_source_observation_id uuid; v_previous_source_sequence bigint; v_previous_source_fingerprint text;
  v_expected_effective_observed_revision bigint; v_expected_effective_source_observation_id uuid;
  v_expected_effective_source_sequence bigint; v_expected_effective_source_fingerprint text;
  v_observed_source public.operations_catering_valuation_observed_source_heads%rowtype;
  v_effective public.operations_catering_valuation_effective_basis_heads%rowtype;
  v_origin uuid; v_source_event uuid; v_latest_source_event uuid; v_replaces uuid;
  v_amount bigint; v_issue text; v_row record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'catering_valuation_service_role_required' using errcode='42501';
  end if;
  if not operations_economy_private.catering_valuation_exact_keys_v1(p_command,
      array['schema','organization_id','economic_scope_id','expected_scope_revision','expected_scope_fingerprint','mapping','census','idempotency_key'])
    or p_command->>'schema' is distinct from 'operations-catering-valuation-persist.v1'
    or (p_command->>'organization_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (p_command->>'economic_scope_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (p_command->>'expected_scope_revision')!~'^[0-9]+$'
    or (p_command->>'expected_scope_fingerprint')!~'^[0-9a-f]{64}$'
    or not operations_economy_private.scope_text_v1(p_command->>'idempotency_key',256)
  then raise exception 'invalid_catering_valuation_command' using errcode='22023'; end if;

  v_org:=(p_command->>'organization_id')::uuid;
  v_scope:=(p_command->>'economic_scope_id')::uuid;
  v_scope_expected:=(p_command->>'expected_scope_revision')::bigint;
  v_scope_fingerprint:=p_command->>'expected_scope_fingerprint';
  v_idempotency:=p_command->>'idempotency_key';
  v_mapping:=p_command->'mapping'; v_census:=p_command->'census';
  v_command_raw:=operations_economy_private.canonical_json_v1(p_command);
  v_command_hash:=encode(sha256(convert_to(v_command_raw,'UTF8')),'hex');

  perform pg_advisory_xact_lock(hashtextextended('operations-catering-valuation:'||v_org::text,0));
  select * into v_receipt_row from public.operations_catering_valuation_receipts
    where organization_id=v_org and idempotency_key=v_idempotency;
  if found then
    if v_receipt_row.command_sha256 is distinct from v_command_hash then
      raise exception 'catering_valuation_idempotency_conflict' using errcode='23505';
    end if;
    return v_receipt_row.receipt || jsonb_build_object('outcome','replayed');
  end if;

  select * into strict v_scope_head from public.operations_project_scope_heads
    where organization_id=v_org and economic_scope_id=v_scope for share;
  if v_scope_head.current_revision is distinct from v_scope_expected then
    raise exception 'catering_valuation_scope_revision_conflict' using errcode='23505';
  end if;
  select * into strict v_scope_snapshot from public.operations_project_scope_snapshots
    where organization_id=v_org and economic_scope_id=v_scope and scope_revision=v_scope_expected for share;
  if v_scope_snapshot.membership_fingerprint is distinct from v_scope_fingerprint then
    raise exception 'catering_valuation_scope_fingerprint_conflict' using errcode='23505';
  end if;

  if not operations_economy_private.catering_valuation_exact_keys_v1(v_mapping,
      array['expected_revision','revision','fingerprint','bookings'])
    or (v_mapping->>'expected_revision')!~'^[0-9]+$' or (v_mapping->>'revision')!~'^[0-9]+$'
    or (v_mapping->>'fingerprint')!~'^[0-9a-f]{64}$'
    or jsonb_typeof(v_mapping->'bookings')<>'array' or jsonb_array_length(v_mapping->'bookings')<>2
  then raise exception 'invalid_catering_valuation_mapping' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(v_mapping->'bookings') b
    where not operations_economy_private.catering_valuation_exact_keys_v1(b,array['booking_id','source_project_id','obligation_id','mapping_revision'])
      or not operations_economy_private.scope_text_v1(b->>'booking_id',256)
      or (b->>'source_project_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (b->>'obligation_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not operations_economy_private.scope_text_v1(b->>'mapping_revision',256))
    or v_mapping->'bookings' is distinct from
      (select jsonb_agg(value order by value->>'booking_id' collate "C")
       from jsonb_array_elements(v_mapping->'bookings'))
  then raise exception 'invalid_catering_valuation_mapping' using errcode='22023'; end if;
  select array_agg(b->>'booking_id' order by b->>'booking_id' collate "C") into v_booking_ids
    from jsonb_array_elements(v_mapping->'bookings') b;
  if v_booking_ids[1]=v_booking_ids[2]
    or v_booking_ids is distinct from (select array_agg(value#>>'{}' order by value#>>'{}' collate "C")
      from jsonb_array_elements(v_scope_snapshot.membership->'local_booking_ids'))
  then raise exception 'catering_valuation_mapping_scope_mismatch' using errcode='22023'; end if;
  v_mapping_expected:=(v_mapping->>'expected_revision')::bigint;
  v_mapping_revision:=(v_mapping->>'revision')::bigint;
  v_mapping_fingerprint:=v_mapping->>'fingerprint';
  v_mapping_raw:=operations_economy_private.canonical_json_v1(v_mapping->'bookings');
  if encode(sha256(convert_to(v_mapping_raw,'UTF8')),'hex') is distinct from v_mapping_fingerprint then
    raise exception 'catering_valuation_mapping_fingerprint_invalid' using errcode='22023';
  end if;

  insert into public.operations_catering_valuation_mapping_heads(organization_id,economic_scope_id)
    values(v_org,v_scope) on conflict do nothing;
  select * into strict v_mapping_head from public.operations_catering_valuation_mapping_heads
    where organization_id=v_org and economic_scope_id=v_scope for update;
  v_mapping_current:=v_mapping_head.current_revision;
  if v_mapping_expected<>v_mapping_current then
    raise exception 'catering_valuation_mapping_revision_conflict' using errcode='23505';
  end if;
  if v_mapping_revision=v_mapping_current+1 then
    insert into public.operations_catering_valuation_mapping_snapshots(
      organization_id,economic_scope_id,mapping_revision,scope_revision,scope_fingerprint,mapping,mapping_raw,mapping_fingerprint)
    values(v_org,v_scope,v_mapping_revision,v_scope_expected,v_scope_fingerprint,v_mapping->'bookings',v_mapping_raw,v_mapping_fingerprint);
    update public.operations_catering_valuation_mapping_heads set current_revision=v_mapping_revision
      where organization_id=v_org and economic_scope_id=v_scope;
  elsif v_mapping_revision=v_mapping_current and v_mapping_current>0 then
    select * into strict v_stored_mapping from public.operations_catering_valuation_mapping_snapshots
      where organization_id=v_org and economic_scope_id=v_scope and mapping_revision=v_mapping_revision;
    if v_stored_mapping.mapping_fingerprint is distinct from v_mapping_fingerprint
      or v_stored_mapping.mapping is distinct from v_mapping->'bookings' then
      raise exception 'catering_valuation_mapping_revision_reused' using errcode='23505';
    end if;
  else raise exception 'catering_valuation_mapping_revision_invalid' using errcode='23505'; end if;

  if not operations_economy_private.catering_valuation_exact_keys_v1(v_census,
      array['expected_observed_revision','census_id','census_revision','census_fingerprint','previous_census_id','previous_census_revision','previous_census_fingerprint','booking_basis_heads'])
    or (v_census->>'expected_observed_revision')!~'^[0-9]+$'
    or (v_census->>'census_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (v_census->>'census_revision')!~'^[0-9]+$' or (v_census->>'census_fingerprint')!~'^[0-9a-f]{64}$'
    or jsonb_typeof(v_census->'booking_basis_heads')<>'array' or jsonb_array_length(v_census->'booking_basis_heads')<>6
  then raise exception 'invalid_catering_valuation_census' using errcode='22023'; end if;
  v_observed_expected:=(v_census->>'expected_observed_revision')::bigint;
  v_census_id:=(v_census->>'census_id')::uuid; v_census_revision:=(v_census->>'census_revision')::bigint;
  v_census_fingerprint:=v_census->>'census_fingerprint';
  v_previous_id:=nullif(v_census->>'previous_census_id','')::uuid;
  v_previous_revision:=nullif(v_census->>'previous_census_revision','')::bigint;
  v_previous_fingerprint:=nullif(v_census->>'previous_census_fingerprint','');
  if encode(sha256(convert_to(operations_economy_private.canonical_json_v1(v_census->'booking_basis_heads'),'UTF8')),'hex')
      is distinct from v_census_fingerprint then
    raise exception 'catering_valuation_census_fingerprint_invalid' using errcode='22023';
  end if;
  if v_census_revision=1 then
    if v_previous_id is not null or v_previous_revision is not null or v_previous_fingerprint is not null then
      raise exception 'invalid_catering_valuation_predecessor' using errcode='22023'; end if;
  else
    select * into strict v_previous from public.operations_catering_valuation_census_snapshots
      where organization_id=v_org and economic_scope_id=v_scope and census_id=v_previous_id for share;
    if row(v_previous.census_revision,v_previous.census_fingerprint)
      is distinct from row(v_previous_revision,v_previous_fingerprint)
      or v_census_revision<>v_previous_revision+1 then
      raise exception 'invalid_catering_valuation_predecessor' using errcode='23505'; end if;
  end if;

  insert into public.operations_catering_valuation_census_heads(organization_id,economic_scope_id)
    values(v_org,v_scope) on conflict do nothing;
  select * into strict v_census_head from public.operations_catering_valuation_census_heads
    where organization_id=v_org and economic_scope_id=v_scope for update;
  v_observed_current:=v_census_head.current_observed_revision;
  if v_observed_expected<>v_observed_current then
    raise exception 'catering_valuation_observed_revision_conflict' using errcode='23505'; end if;
  v_observed_next:=v_observed_current+1;
  if v_census_revision<>v_observed_next
    or (v_census_revision=1 and v_observed_current<>0)
    or (v_census_revision>1 and v_previous.observed_revision is distinct from v_observed_current)
  then raise exception 'catering_valuation_current_predecessor_conflict' using errcode='23505'; end if;

  if exists(select 1 from jsonb_array_elements(v_census->'booking_basis_heads') h
    where not operations_economy_private.catering_valuation_exact_keys_v1(h,
      array['booking_id','basis','currentness','unavailable_reason','source_stream_id','source_revision','source_fingerprint','currency','lines',
        'source_observation_id','source_sequence','source_as_of','previous_source_observation_id','previous_source_sequence','previous_source_fingerprint',
        'expected_effective_observed_revision','expected_effective_source_observation_id','expected_effective_source_sequence','expected_effective_source_fingerprint',
        'mapping_revision','mapping_fingerprint'])
      or not (h->>'booking_id'=any(v_booking_ids))
      or h->>'basis' not in ('ingredient_estimate','purchase_estimate','stock_consumption')
      or h->>'currentness' not in ('current','current_empty','unavailable')
      or (h->>'source_stream_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not operations_economy_private.scope_text_v1(h->>'source_revision',256)
      or (h->>'source_fingerprint')!~'^[0-9a-f]{64}$' or (h->>'currency')!~'^[A-Z]{3}$'
      or (h->>'source_observation_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (h->>'source_sequence')!~'^[1-9][0-9]*$'
      or (h->>'source_as_of')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'
      or (h->>'expected_effective_observed_revision')!~'^[0-9]+$'
      or (h->>'mapping_revision')!~'^[1-9][0-9]*$'
      or (h->>'mapping_revision')::bigint<>v_mapping_revision
      or h->>'mapping_fingerprint' is distinct from v_mapping_fingerprint
      or jsonb_typeof(h->'lines')<>'array'
      or (h->>'currentness'='current' and (jsonb_array_length(h->'lines')=0 or h->'unavailable_reason' is not null))
      or (h->>'currentness'='current_empty' and (h->'lines'<>'[]'::jsonb or h->'unavailable_reason' is not null))
      or (h->>'currentness'='unavailable' and (h->'lines'<>'[]'::jsonb
          or h->>'unavailable_reason' not in ('source_unreachable','source_head_missing'))))
    or (select count(*) from (select h->>'booking_id',h->>'basis' from jsonb_array_elements(v_census->'booking_basis_heads') h group by 1,2) q)<>6
    or v_census->'booking_basis_heads' is distinct from
      (select jsonb_agg(value order by value->>'booking_id' collate "C",value->>'basis' collate "C")
       from jsonb_array_elements(v_census->'booking_basis_heads'))
  then raise exception 'invalid_catering_valuation_basis_heads' using errcode='22023'; end if;
  if exists(
    select 1
    from jsonb_array_elements(v_census->'booking_basis_heads') h
    cross join lateral jsonb_array_elements(h->'lines') l
    group by l->>'economic_origin_id'
    having count(*)>1)
  then raise exception 'duplicate_catering_valuation_command_origin' using errcode='22023'; end if;

  insert into public.operations_catering_valuation_census_snapshots(
    organization_id,economic_scope_id,observed_revision,census_id,census_revision,census_fingerprint,
    previous_census_id,previous_census_revision,previous_census_fingerprint,mapping_revision,mapping_fingerprint,
    command,command_raw,command_sha256,idempotency_key)
  values(v_org,v_scope,v_observed_next,v_census_id,v_census_revision,v_census_fingerprint,
    v_previous_id,v_previous_revision,v_previous_fingerprint,v_mapping_revision,v_mapping_fingerprint,
    p_command,v_command_raw,v_command_hash,v_idempotency);

  for v_head in select value from jsonb_array_elements(v_census->'booking_basis_heads')
    order by value->>'booking_id' collate "C", value->>'basis' collate "C"
  loop
    v_booking:=v_head->>'booking_id'; v_basis:=v_head->>'basis'; v_currentness:=v_head->>'currentness';
    v_reason:=v_head->>'unavailable_reason'; v_lines:=v_head->'lines';
    v_source_observation_id:=(v_head->>'source_observation_id')::uuid;
    v_source_sequence:=(v_head->>'source_sequence')::bigint;
    v_source_as_of:=(v_head->>'source_as_of')::timestamptz;
    v_previous_source_observation_id:=nullif(v_head->>'previous_source_observation_id','')::uuid;
    v_previous_source_sequence:=nullif(v_head->>'previous_source_sequence','')::bigint;
    v_previous_source_fingerprint:=nullif(v_head->>'previous_source_fingerprint','');
    v_expected_effective_observed_revision:=(v_head->>'expected_effective_observed_revision')::bigint;
    v_expected_effective_source_observation_id:=nullif(v_head->>'expected_effective_source_observation_id','')::uuid;
    v_expected_effective_source_sequence:=nullif(v_head->>'expected_effective_source_sequence','')::bigint;
    v_expected_effective_source_fingerprint:=nullif(v_head->>'expected_effective_source_fingerprint','');

    select * into v_observed_source from public.operations_catering_valuation_observed_source_heads
      where organization_id=v_org and economic_scope_id=v_scope and booking_id=v_booking and basis=v_basis for update;
    if found then
      if (v_head->>'source_stream_id')::uuid is distinct from v_observed_source.source_stream_id
        or v_source_sequence<>v_observed_source.source_sequence+1 or v_source_as_of<=v_observed_source.source_as_of
        or row(v_previous_source_observation_id,v_previous_source_sequence,v_previous_source_fingerprint)
          is distinct from row(v_observed_source.source_observation_id,v_observed_source.source_sequence,v_observed_source.source_fingerprint)
      then raise exception 'catering_valuation_source_predecessor_conflict' using errcode='23505'; end if;
    elsif v_source_sequence<>1 or v_previous_source_observation_id is not null
      or v_previous_source_sequence is not null or v_previous_source_fingerprint is not null then
      raise exception 'catering_valuation_source_predecessor_conflict' using errcode='23505';
    end if;

    select * into v_effective from public.operations_catering_valuation_effective_basis_heads
      where organization_id=v_org and economic_scope_id=v_scope and booking_id=v_booking and basis=v_basis for update;
    if found then
      if row(v_expected_effective_observed_revision,v_expected_effective_source_observation_id,
             v_expected_effective_source_sequence,v_expected_effective_source_fingerprint)
        is distinct from row(v_effective.effective_observed_revision,v_effective.source_observation_id,
             v_effective.source_sequence,v_effective.source_fingerprint)
      then raise exception 'catering_valuation_effective_predecessor_conflict' using errcode='23505'; end if;
    elsif v_expected_effective_observed_revision<>0 or v_expected_effective_source_observation_id is not null
      or v_expected_effective_source_sequence is not null or v_expected_effective_source_fingerprint is not null then
      raise exception 'catering_valuation_effective_predecessor_conflict' using errcode='23505';
    end if;
    insert into public.operations_catering_valuation_basis_observations(
      organization_id,economic_scope_id,observed_revision,booking_id,basis,
      source_observation_id,source_sequence,source_as_of,previous_source_observation_id,previous_source_sequence,previous_source_fingerprint,
      expected_effective_observed_revision,expected_effective_source_observation_id,expected_effective_source_sequence,expected_effective_source_fingerprint,
      mapping_revision,mapping_fingerprint,currentness,unavailable_reason,
      source_stream_id,source_revision,source_fingerprint,currency,lines)
    values(v_org,v_scope,v_observed_next,v_booking,v_basis,
      v_source_observation_id,v_source_sequence,v_source_as_of,v_previous_source_observation_id,v_previous_source_sequence,v_previous_source_fingerprint,
      v_expected_effective_observed_revision,v_expected_effective_source_observation_id,v_expected_effective_source_sequence,v_expected_effective_source_fingerprint,
      v_mapping_revision,v_mapping_fingerprint,v_currentness,v_reason,
      (v_head->>'source_stream_id')::uuid,v_head->>'source_revision',v_head->>'source_fingerprint',v_head->>'currency',v_lines);

    insert into public.operations_catering_valuation_observed_source_heads(
      organization_id,economic_scope_id,booking_id,basis,source_stream_id,source_observation_id,source_sequence,source_as_of,source_fingerprint,observed_revision)
    values(v_org,v_scope,v_booking,v_basis,(v_head->>'source_stream_id')::uuid,v_source_observation_id,v_source_sequence,v_source_as_of,v_head->>'source_fingerprint',v_observed_next)
    on conflict(organization_id,economic_scope_id,booking_id,basis) do update set
      source_stream_id=excluded.source_stream_id,source_observation_id=excluded.source_observation_id,source_sequence=excluded.source_sequence,
      source_as_of=excluded.source_as_of,source_fingerprint=excluded.source_fingerprint,observed_revision=excluded.observed_revision;

    if v_currentness<>'unavailable' then
      insert into public.operations_catering_valuation_effective_basis_heads(
        organization_id,economic_scope_id,booking_id,basis,effective_observed_revision,
        source_stream_id,source_observation_id,source_sequence,source_fingerprint,source_as_of,currentness)
      values(v_org,v_scope,v_booking,v_basis,v_observed_next,
        (v_head->>'source_stream_id')::uuid,v_source_observation_id,v_source_sequence,v_head->>'source_fingerprint',v_source_as_of,v_currentness)
      on conflict(organization_id,economic_scope_id,booking_id,basis) do update
        set effective_observed_revision=excluded.effective_observed_revision,
          source_stream_id=excluded.source_stream_id,source_observation_id=excluded.source_observation_id,source_sequence=excluded.source_sequence,
          source_fingerprint=excluded.source_fingerprint,source_as_of=excluded.source_as_of,currentness=excluded.currentness;
    end if;

    for v_line in select value from jsonb_array_elements(v_lines) order by value->>'economic_origin_id' collate "C"
    loop
      if not operations_economy_private.catering_valuation_exact_keys_v1(v_line,
          array['source_event_id','economic_origin_id','replaces_source_event_id','amount_minor','issue_code'])
        or (v_line->>'source_event_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (v_line->>'economic_origin_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (jsonb_typeof(v_line->'replaces_source_event_id')<>'null' and (v_line->>'replaces_source_event_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        or (jsonb_typeof(v_line->'amount_minor')='null' and (jsonb_typeof(v_line->'issue_code')<>'string' or not operations_economy_private.scope_text_v1(v_line->>'issue_code',128)))
        or (jsonb_typeof(v_line->'amount_minor')<>'null' and (jsonb_typeof(v_line->'amount_minor')<>'number'
          or (v_line->>'amount_minor')::numeric<>trunc((v_line->>'amount_minor')::numeric)
          or (v_line->>'amount_minor')::numeric not between -9007199254740991 and 9007199254740991
          or jsonb_typeof(v_line->'issue_code')<>'null'))
      then raise exception 'invalid_catering_valuation_line' using errcode='22023'; end if;
      v_origin:=(v_line->>'economic_origin_id')::uuid; v_source_event:=(v_line->>'source_event_id')::uuid;
      v_replaces:=nullif(v_line->>'replaces_source_event_id','')::uuid;
      v_amount:=case when jsonb_typeof(v_line->'amount_minor')='null' then null else (v_line->>'amount_minor')::bigint end;
      v_issue:=case when jsonb_typeof(v_line->'issue_code')='null' then null else v_line->>'issue_code' end;

      select * into v_row from public.operations_catering_valuation_origin_ownership
        where organization_id=v_org and economic_origin_id=v_origin for update;
      if found and row(v_row.economic_scope_id,v_row.booking_id,v_row.basis)
          is distinct from row(v_scope,v_booking,v_basis) then
        raise exception 'catering_valuation_origin_already_owned' using errcode='23505';
      end if;
      insert into public.operations_catering_valuation_origin_ownership(
        organization_id,economic_origin_id,economic_scope_id,booking_id,basis,first_observed_revision)
      values(v_org,v_origin,v_scope,v_booking,v_basis,v_observed_next) on conflict do nothing;

      select source_event_id into v_latest_source_event
        from public.operations_catering_valuation_origin_events
        where organization_id=v_org and economic_origin_id=v_origin
        order by observed_revision desc,source_event_id desc limit 1 for share;
      select * into v_event from public.operations_catering_valuation_origin_events
        where organization_id=v_org and source_event_id=v_source_event;
      if found then
        if row(v_event.economic_origin_id,v_event.economic_scope_id,v_event.booking_id,v_event.basis,
               v_event.replaces_source_event_id,v_event.amount_minor,v_event.issue_code)
          is distinct from row(v_origin,v_scope,v_booking,v_basis,v_replaces,v_amount,v_issue)
          or v_latest_source_event is distinct from v_source_event then
          raise exception 'catering_valuation_source_event_reused' using errcode='23505'; end if;
      else
        if v_latest_source_event is not null then
          if v_replaces is distinct from v_latest_source_event then
            raise exception 'catering_valuation_correction_predecessor_invalid' using errcode='23505'; end if;
        elsif v_replaces is not null then
          raise exception 'catering_valuation_correction_predecessor_invalid' using errcode='23505';
        end if;
        insert into public.operations_catering_valuation_origin_events(
          organization_id,source_event_id,economic_origin_id,economic_scope_id,booking_id,basis,
          observed_revision,replaces_source_event_id,amount_minor,issue_code)
        values(v_org,v_source_event,v_origin,v_scope,v_booking,v_basis,v_observed_next,v_replaces,v_amount,v_issue);
      end if;
    end loop;
  end loop;

  update public.operations_catering_valuation_census_heads set current_observed_revision=v_observed_next
    where organization_id=v_org and economic_scope_id=v_scope;
  v_receipt:=jsonb_build_object('schema','operations-catering-valuation-persistence-receipt.v1',
    'outcome','accepted','organization_id',v_org,'economic_scope_id',v_scope,
    'mapping_revision',v_mapping_revision,'observed_revision',v_observed_next,
    'census_id',v_census_id,'census_revision',v_census_revision,
    'census_fingerprint',v_census_fingerprint,'economic_total_minor',null);
  insert into public.operations_catering_valuation_receipts(
    organization_id,idempotency_key,economic_scope_id,observed_revision,command_sha256,receipt)
  values(v_org,v_idempotency,v_scope,v_observed_next,v_command_hash,v_receipt);
  return v_receipt;
exception
  when no_data_found or too_many_rows then
    raise exception 'catering_valuation_prerequisite_missing_or_ambiguous' using errcode='23505';
end;$$;

revoke all on function operations_economy_private.publish_catering_valuation_census_v1(jsonb)
from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.publish_catering_valuation_census_v1(jsonb) to service_role;

create function public.publish_operations_catering_valuation_census_v1(p_command jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select operations_economy_private.publish_catering_valuation_census_v1(p_command);
$$;
revoke all on function public.publish_operations_catering_valuation_census_v1(jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.publish_operations_catering_valuation_census_v1(jsonb) to service_role;

comment on function public.publish_operations_catering_valuation_census_v1(jsonb) is
'Default-inaccessible persistence kernel only. No authenticated Catering source endpoint, totals, Finance delivery or production activation.';
