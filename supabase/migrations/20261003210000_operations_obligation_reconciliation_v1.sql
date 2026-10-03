-- Default-off Operations-owned obligation reconciliation.
-- Reads existing saved authorities, appends immutable evidence, and never writes Finance.
create table public.operations_obligation_reconciliation_gates (
  organization_id uuid primary key,
  enabled boolean not null default false
);
alter table public.operations_obligation_reconciliation_gates enable row level security;
revoke all on public.operations_obligation_reconciliation_gates from public,anon,authenticated,service_role;
grant select,insert,update on public.operations_obligation_reconciliation_gates to service_role;
create trigger operations_obligation_reconciliation_gate_identity
before update on public.operations_obligation_reconciliation_gates
for each row execute function operations_economy_private.invoice_kernel_read_gate_guard_v1();
create trigger operations_obligation_reconciliation_gate_no_delete
before delete on public.operations_obligation_reconciliation_gates
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_reconciliation_gate_no_truncate
before truncate on public.operations_obligation_reconciliation_gates
for each statement execute function public.operations_personnel_evidence_immutable();

create table public.operations_obligation_reconciliation_snapshots (
  snapshot_id uuid primary key,
  organization_id uuid not null,
  project_id uuid not null,
  obligation_id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  baseline_event_id uuid not null,
  close_action text not null check (close_action in ('none','close','reopen')),
  document jsonb not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  actor_system_user_id uuid not null,
  reason text not null,
  idempotency_key text not null,
  command jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id,obligation_id,revision),
  unique (organization_id,idempotency_key)
);
create table public.operations_obligation_reconciliation_heads (
  organization_id uuid not null,
  project_id uuid not null,
  obligation_id uuid not null,
  current_revision bigint not null check (current_revision between 1 and 9007199254740991),
  current_snapshot_id uuid not null references public.operations_obligation_reconciliation_snapshots(snapshot_id),
  economic_closed boolean not null,
  frozen_close_snapshot_id uuid references public.operations_obligation_reconciliation_snapshots(snapshot_id),
  primary key (organization_id,obligation_id)
);
create table public.operations_obligation_reconciliation_receipts (
  receipt_id uuid primary key,
  organization_id uuid not null,
  project_id uuid not null,
  obligation_id uuid not null,
  revision bigint not null,
  snapshot_id uuid not null references public.operations_obligation_reconciliation_snapshots(snapshot_id),
  snapshot_fingerprint text not null check (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id,obligation_id,revision)
);
alter table public.operations_obligation_reconciliation_snapshots enable row level security;
alter table public.operations_obligation_reconciliation_heads enable row level security;
alter table public.operations_obligation_reconciliation_receipts enable row level security;
revoke all on public.operations_obligation_reconciliation_snapshots,public.operations_obligation_reconciliation_heads,public.operations_obligation_reconciliation_receipts from public,anon,authenticated,service_role;
grant select on public.operations_obligation_reconciliation_snapshots,public.operations_obligation_reconciliation_heads,public.operations_obligation_reconciliation_receipts to service_role;
create trigger operations_obligation_reconciliation_snapshots_immutable
before update or delete on public.operations_obligation_reconciliation_snapshots
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_reconciliation_snapshots_no_truncate
before truncate on public.operations_obligation_reconciliation_snapshots
for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_reconciliation_receipts_immutable
before update or delete on public.operations_obligation_reconciliation_receipts
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_reconciliation_receipts_no_truncate
before truncate on public.operations_obligation_reconciliation_receipts
for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.obligation_reconciliation_head_guard_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE'
    or (new.organization_id,new.project_id,new.obligation_id) is distinct from (old.organization_id,old.project_id,old.obligation_id)
    or new.current_revision<>old.current_revision+1
    or not exists (
      select 1 from public.operations_obligation_reconciliation_snapshots s
      where s.snapshot_id=new.current_snapshot_id and s.organization_id=new.organization_id
        and s.project_id=new.project_id and s.obligation_id=new.obligation_id and s.revision=new.current_revision)
    or (new.frozen_close_snapshot_id is not null and not exists (
      select 1 from public.operations_obligation_reconciliation_snapshots s
      where s.snapshot_id=new.frozen_close_snapshot_id and s.organization_id=new.organization_id
        and s.project_id=new.project_id and s.obligation_id=new.obligation_id and s.close_action='close'))
  then raise exception 'obligation_reconciliation_head_change_denied' using errcode='55000';end if;
  return new;
end;$$;
revoke all on function operations_economy_private.obligation_reconciliation_head_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_obligation_reconciliation_head_guard
before update or delete on public.operations_obligation_reconciliation_heads
for each row execute function operations_economy_private.obligation_reconciliation_head_guard_v1();
create trigger operations_obligation_reconciliation_heads_no_truncate
before truncate on public.operations_obligation_reconciliation_heads
for each statement execute function public.operations_personnel_evidence_immutable();

-- Pure deterministic calculator. Callers cannot provide it directly; the append function
-- builds this shape exclusively from saved current Operations authorities.
create function operations_economy_private.obligation_reconciliation_document_v1(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  d jsonb;c jsonb;h jsonb;x jsonb;prior text:=null;prior_credit text:=null;prior_hired text:=null;
  issues jsonb:='[]'::jsonb;documents jsonb:='[]'::jsonb;credits jsonb:='[]'::jsonb;hired jsonb:='[]'::jsonb;
  gross numeric:=0;credit_total numeric:=0;replaced numeric:=0;consumed numeric:=0;unallocated numeric:=0;
  estimate numeric;committed numeric;remaining numeric;current_amount numeric;eac numeric;overcredit numeric:=0;
  complete boolean:=true;superseded boolean;active_documents int:=0;key text;expected jsonb;observed jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>10
    or not(p ?& array['schema_version','organization_id','project_id','obligation_id','currency','estimate_minor','committed_minor','documents','credits','hired'])
    or p->>'schema_version' is distinct from 'operations-obligation-reconciliation-input.v1'
  then raise exception 'exact_obligation_reconciliation_input_required' using errcode='22023';end if;
  foreach key in array array['organization_id','project_id','obligation_id'] loop
    if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'invalid_obligation_reconciliation_identity' using errcode='22023';end if;
  end loop;
  if jsonb_typeof(p->'currency') is distinct from 'string' or p->>'currency' !~ '^[A-Z]{3}$'
    or jsonb_typeof(p->'documents') is distinct from 'array' or jsonb_array_length(p->'documents')>10000
    or jsonb_typeof(p->'credits') is distinct from 'array' or jsonb_array_length(p->'credits')>10000
    or jsonb_typeof(p->'hired') is distinct from 'array' or jsonb_array_length(p->'hired')>10000
  then raise exception 'invalid_obligation_reconciliation_envelope' using errcode='22023';end if;
  foreach key in array array['estimate_minor','committed_minor'] loop
    if jsonb_typeof(p->key) is distinct from 'null' and
      (jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric)
       or (p->>key)::numeric not between 0 and 9007199254740991)
    then raise exception 'invalid_obligation_reconciliation_baseline_money' using errcode='22023';end if;
  end loop;
  estimate:=case when jsonb_typeof(p->'estimate_minor')='number' then (p->>'estimate_minor')::numeric end;
  committed:=case when jsonb_typeof(p->'committed_minor')='number' then (p->>'committed_minor')::numeric end;
  if estimate is null then complete:=false;issues:=issues||'"missing_estimate"'::jsonb;end if;
  if committed is null then complete:=false;issues:=issues||'"missing_commitment"'::jsonb;end if;

  for d in select value from jsonb_array_elements(p->'documents') order by value->>'source_anchor' collate "C" loop
    if jsonb_typeof(d) is distinct from 'object' or (select count(*) from jsonb_object_keys(d))<>12
      or not(d ?& array['source_anchor','document_key','allocation_key','status','amount_minor','recipient_net_minor','all_allocations_minor','replaces_estimate_minor','consumes_commitment_minor','current','policy_current','superseded_by'])
      or jsonb_typeof(d->'source_anchor') is distinct from 'string' or d->>'source_anchor' !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(d->'document_key') is distinct from 'string' or length(d->>'document_key') not between 1 and 200
      or jsonb_typeof(d->'allocation_key') is distinct from 'string' or length(d->>'allocation_key') not between 1 and 200
      or jsonb_typeof(d->'current') is distinct from 'boolean' or jsonb_typeof(d->'policy_current') is distinct from 'boolean'
      or jsonb_typeof(d->'status') is distinct from 'string' or d->>'status' not in ('preliminary','confirmed','rejected')
      or jsonb_typeof(d->'superseded_by') not in ('null','string')
    then raise exception 'invalid_obligation_reconciliation_document' using errcode='22023';end if;
    if prior is not null and prior>=d->>'source_anchor' then raise exception 'duplicate_obligation_reconciliation_document' using errcode='23505';end if;
    prior:=d->>'source_anchor';superseded:=jsonb_typeof(d->'superseded_by')='string';
    if superseded and (d->>'superseded_by'=d->>'source_anchor' or d->>'superseded_by' !~ '^[0-9a-f]{64}$')
    then raise exception 'invalid_obligation_reconciliation_supersession' using errcode='22023';end if;
    foreach key in array array['amount_minor','recipient_net_minor','all_allocations_minor','replaces_estimate_minor','consumes_commitment_minor'] loop
      if jsonb_typeof(d->key) is distinct from 'null' and
        (jsonb_typeof(d->key) is distinct from 'number' or (d->>key)::numeric<>trunc((d->>key)::numeric)
         or (d->>key)::numeric not between 0 and 9007199254740991)
      then raise exception 'invalid_obligation_reconciliation_document_money' using errcode='22023';end if;
    end loop;
    if not (d->>'current')::boolean or not (d->>'policy_current')::boolean then
      complete:=false;issues:=issues||to_jsonb('unavailable_document_authority:'||(d->>'source_anchor'));
    elsif jsonb_typeof(d->'amount_minor')<>'number' or jsonb_typeof(d->'recipient_net_minor')<>'number'
      or jsonb_typeof(d->'all_allocations_minor')<>'number' or jsonb_typeof(d->'replaces_estimate_minor')<>'number'
      or jsonb_typeof(d->'consumes_commitment_minor')<>'number'
    then complete:=false;issues:=issues||to_jsonb('missing_document_money:'||(d->>'source_anchor'));
    elsif (d->>'all_allocations_minor')::numeric>(d->>'recipient_net_minor')::numeric then
      complete:=false;issues:=issues||to_jsonb('allocations_exceed_document:'||(d->>'source_anchor'));
    else
      unallocated:=unallocated+(d->>'recipient_net_minor')::numeric-(d->>'all_allocations_minor')::numeric;
      if not superseded and d->>'status'<>'rejected' then
        active_documents:=active_documents+1;gross:=gross+(d->>'amount_minor')::numeric;
        replaced:=replaced+(d->>'replaces_estimate_minor')::numeric;consumed:=consumed+(d->>'consumes_commitment_minor')::numeric;
      end if;
    end if;
    documents:=documents||jsonb_build_array(d||jsonb_build_object('active',not superseded and d->>'status'<>'rejected'));
  end loop;
  -- Every supersession target must be present and must not itself be superseded.
  for d in select value from jsonb_array_elements(documents) where jsonb_typeof(value->'superseded_by')='string' loop
    select value into x from jsonb_array_elements(documents) where value->>'source_anchor'=d->>'superseded_by';
    if x is null or jsonb_typeof(x->'superseded_by')<>'null' then raise exception 'unresolved_obligation_reconciliation_supersession' using errcode='22023';end if;
  end loop;

  for c in select value from jsonb_array_elements(p->'credits') order by value->>'source_anchor' collate "C" loop
    if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>5
      or not(c ?& array['source_anchor','original_anchor','amount_minor','current','capacity_fingerprint'])
      or jsonb_typeof(c->'source_anchor') is distinct from 'string' or c->>'source_anchor' !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(c->'original_anchor') is distinct from 'string' or c->>'original_anchor' !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(c->'current') is distinct from 'boolean'
      or jsonb_typeof(c->'capacity_fingerprint') is distinct from 'string' or c->>'capacity_fingerprint' !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(c->'amount_minor') is distinct from 'number' or (c->>'amount_minor')::numeric<>trunc((c->>'amount_minor')::numeric)
      or (c->>'amount_minor')::numeric not between 1 and 9007199254740991
    then raise exception 'invalid_obligation_reconciliation_credit' using errcode='22023';end if;
    if prior_credit is not null and prior_credit>=c->>'source_anchor' then raise exception 'duplicate_obligation_reconciliation_credit' using errcode='23505';end if;
    prior_credit:=c->>'source_anchor';
    if not(c->>'current')::boolean then complete:=false;issues:=issues||to_jsonb('unavailable_credit_authority:'||(c->>'source_anchor'));
    else credit_total:=credit_total+(c->>'amount_minor')::numeric;end if;
    credits:=credits||jsonb_build_array(c);
  end loop;

  for h in select value from jsonb_array_elements(p->'hired') order by value->>'source_identity' collate "C" loop
    if jsonb_typeof(h) is distinct from 'object' or (select count(*) from jsonb_object_keys(h))<>6
      or not(h ?& array['source_identity','current','coverage','amount_minor','disposition','assignment_fingerprint'])
      or jsonb_typeof(h->'source_identity') is distinct from 'string' or h->>'source_identity' !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(h->'current') is distinct from 'boolean'
      or jsonb_typeof(h->'coverage') is distinct from 'string' or h->>'coverage' not in ('complete','missing_rate','unavailable')
      or h->>'disposition' is distinct from 'operational_only'
      or jsonb_typeof(h->'assignment_fingerprint') is distinct from 'string' or h->>'assignment_fingerprint' !~ '^[0-9a-f]{64}$'
      or (jsonb_typeof(h->'amount_minor') is distinct from 'null' and
          (jsonb_typeof(h->'amount_minor') is distinct from 'number' or (h->>'amount_minor')::numeric<>trunc((h->>'amount_minor')::numeric)
           or (h->>'amount_minor')::numeric not between 0 and 9007199254740991))
    then raise exception 'invalid_obligation_reconciliation_hired' using errcode='22023';end if;
    if prior_hired is not null and prior_hired>=h->>'source_identity' then raise exception 'duplicate_obligation_reconciliation_hired' using errcode='23505';end if;
    prior_hired:=h->>'source_identity';
    if not(h->>'current')::boolean or h->>'coverage'<>'complete' or jsonb_typeof(h->'amount_minor')<>'number' then
      complete:=false;issues:=issues||to_jsonb(case when h->>'coverage'='missing_rate' then 'missing_hired_rate:' else 'unavailable_hired_authority:' end||(h->>'source_identity'));
    end if;
    hired:=hired||jsonb_build_array(h||jsonb_build_object('charged_minor',0));
  end loop;

  if estimate is not null and replaced>estimate then complete:=false;issues:=issues||'"replacement_exceeds_estimate"'::jsonb;end if;
  if committed is not null and consumed>committed then complete:=false;issues:=issues||'"consumption_exceeds_commitment"'::jsonb;end if;
  if greatest(gross,credit_total,replaced,consumed,unallocated)>9007199254740991 then raise exception 'unsafe_obligation_reconciliation_sum' using errcode='22003';end if;
  if complete then
    current_amount:=gross-credit_total;overcredit:=greatest(-current_amount,0);
    remaining:=greatest(estimate-replaced,committed-consumed,0);eac:=current_amount+remaining;
    if abs(eac)>9007199254740991 then raise exception 'unsafe_obligation_reconciliation_sum' using errcode='22003';end if;
  end if;
  return jsonb_build_object(
    'schema_version','operations-obligation-reconciliation-document.v1','organization_id',p->'organization_id','project_id',p->'project_id',
    'obligation_id',p->'obligation_id','currency',p->'currency','documents',documents,'credits',credits,'hired',hired,
    'active_document_count',active_documents,'gross_document_minor',case when complete then gross else null end,
    'credit_minor',case when complete then credit_total else null end,'current_amount_minor',case when complete then current_amount else null end,
    'overcredit_minor',case when complete then overcredit else null end,'remaining_minor',case when complete then remaining else null end,
    'eac_minor',case when complete then eac else null end,'visible_unallocated_minor',case when complete then unallocated else null end,
    'authority_complete',complete,'coverage',case when not complete then 'unavailable' when overcredit>0 then 'exception_overcredit' else 'complete' end,
    'finance_copy_eligible',complete and overcredit=0,'finance_recalculated',false,'missing_cost_is_null',true,'issues',issues);
end;$$;
revoke all on function operations_economy_private.obligation_reconciliation_document_v1(jsonb) from public,anon,authenticated,service_role;

create function operations_economy_private.append_obligation_reconciliation_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  org uuid;actor uuid:=auth.uid();project uuid;obligation uuid;expected bigint;next_revision bigint;snapshot_id uuid:=gen_random_uuid();receipt_id uuid:=gen_random_uuid();
  baseline record;head public.operations_obligation_reconciliation_heads%rowtype;prior public.operations_obligation_reconciliation_snapshots%rowtype;
  binding record;source record;policy record;capacity record;assignment record;allocation jsonb;read_state jsonb;
  documents jsonb:='[]'::jsonb;credits jsonb:='[]'::jsonb;hired jsonb:='[]'::jsonb;sup jsonb;superseded_by jsonb;
  input jsonb;document jsonb;fingerprint text;receipt jsonb;frozen uuid;closed boolean;key text;actual_invoice int;actual_credit int;actual_hired int;
begin
  if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>12
    or not(p ?& array['schema_version','project_id','obligation_id','expected_revision','expected_baseline_event_id','expected_invoice_source_count','expected_credit_source_count','expected_hired_source_count','supersessions','close_action','idempotency_key','reason'])
    or p->>'schema_version' is distinct from 'operations-obligation-reconciliation-append.v1'
  then raise exception 'exact_obligation_reconciliation_command_required' using errcode='22023';end if;
  foreach key in array array['project_id','obligation_id','expected_baseline_event_id'] loop
    if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'invalid_obligation_reconciliation_command_identity' using errcode='22023';end if;
  end loop;
  foreach key in array array['expected_revision','expected_invoice_source_count','expected_credit_source_count','expected_hired_source_count'] loop
    if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric)
      or (p->>key)::numeric not between 0 and (case when key='expected_revision' then 9007199254740990 else 10000 end)
    then raise exception 'invalid_obligation_reconciliation_command_count' using errcode='22023';end if;
  end loop;
  if jsonb_typeof(p->'supersessions') is distinct from 'array' or jsonb_array_length(p->'supersessions')>10000
    or p->>'close_action' not in ('none','close','reopen')
    or jsonb_typeof(p->'idempotency_key') is distinct from 'string' or length(p->>'idempotency_key') not between 12 and 200
    or jsonb_typeof(p->'reason') is distinct from 'string' or length(p->>'reason') not between 3 and 1000
  then raise exception 'invalid_obligation_reconciliation_command' using errcode='22023';end if;
  project:=(p->>'project_id')::uuid;obligation:=(p->>'obligation_id')::uuid;expected:=(p->>'expected_revision')::bigint;
  org:=operations_economy_private.authorize_obligation_admin_v1(project);
  perform 1 from public.operations_obligation_reconciliation_gates where organization_id=org and enabled for share;
  if not found then raise exception 'obligation_reconciliation_gate_disabled' using errcode='42501';end if;
  -- Use the same single canonical lock as every obligation authority writer.
  -- A second candidate-specific advisory key would introduce a lock-order cycle.
  perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
  select * into prior from public.operations_obligation_reconciliation_snapshots where organization_id=org and idempotency_key=p->>'idempotency_key';
  if found then
    if prior.command<>p or prior.actor_system_user_id<>actor then raise exception 'obligation_reconciliation_idempotency_conflict' using errcode='23505';end if;
    select r.receipt into strict receipt from public.operations_obligation_reconciliation_receipts r where r.snapshot_id=prior.snapshot_id;
    return receipt||jsonb_build_object('outcome','replayed');
  end if;
  select * into head from public.operations_obligation_reconciliation_heads where organization_id=org and obligation_id=obligation for update;
  if found and head.project_id<>project then raise exception 'obligation_reconciliation_project_conflict' using errcode='23505';end if;
  if coalesce(head.current_revision,0)<>expected then return jsonb_build_object('outcome','stale','current_revision',coalesce(head.current_revision,0),'finance_copy_eligible',false);end if;
  if p->>'close_action'='close' and coalesce(head.economic_closed,false) then raise exception 'obligation_reconciliation_already_closed' using errcode='22023';end if;
  if p->>'close_action'='reopen' and not coalesce(head.economic_closed,false) then raise exception 'obligation_reconciliation_not_closed' using errcode='22023';end if;
  select b.* into strict baseline from public.operations_project_obligation_heads h join public.operations_project_obligation_baselines b
    on b.organization_id=h.organization_id and b.obligation_id=h.obligation_id and b.revision=h.current_revision
    where h.organization_id=org and h.project_id=project and h.obligation_id=obligation and h.cost_basis='invoice' for share of h;
  if baseline.event_id<>(p->>'expected_baseline_event_id')::uuid then return jsonb_build_object('outcome','stale_baseline','baseline_event_id',baseline.event_id,'finance_copy_eligible',false);end if;

  for sup in select value from jsonb_array_elements(p->'supersessions') loop
    if jsonb_typeof(sup) is distinct from 'object' or (select count(*) from jsonb_object_keys(sup))<>2
      or not(sup ?& array['prior_source_anchor','current_source_anchor'])
      or sup->>'prior_source_anchor' !~ '^[0-9a-f]{64}$' or sup->>'current_source_anchor' !~ '^[0-9a-f]{64}$'
      or sup->>'prior_source_anchor'=sup->>'current_source_anchor'
    then raise exception 'invalid_obligation_reconciliation_supersession' using errcode='22023';end if;
    if (select count(*) from jsonb_array_elements(p->'supersessions') s where s->>'prior_source_anchor'=sup->>'prior_source_anchor')<>1
      or (select count(*) from jsonb_array_elements(p->'supersessions') s where s->>'current_source_anchor'=sup->>'current_source_anchor')<>1
    then raise exception 'duplicate_obligation_reconciliation_supersession' using errcode='23505';end if;
    if not exists (
      select 1 from public.operations_project_obligation_invoice_bindings b
      where b.organization_id=org and b.project_id=project and b.obligation_id=obligation
        and b.source_anchor=sup->>'prior_source_anchor')
      or not exists (
      select 1 from public.operations_project_obligation_invoice_bindings b
      where b.organization_id=org and b.project_id=project and b.obligation_id=obligation
        and b.source_anchor=sup->>'current_source_anchor')
    then raise exception 'unknown_obligation_reconciliation_supersession_anchor' using errcode='22023';end if;
  end loop;

  for binding in select distinct on (source_anchor) * from public.operations_project_obligation_invoice_bindings
    where organization_id=org and project_id=project and obligation_id=obligation order by source_anchor,binding_sequence desc
  loop
    select * into source from public.operations_finance_invoice_economic_current_v2
      where organization_id=org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id;
    select e.* into policy from public.operations_obligation_source_policy_heads h join public.operations_obligation_source_policies e
      on e.organization_id=h.organization_id and e.obligation_id=h.obligation_id and e.source_anchor=h.source_anchor and e.policy_revision=h.current_revision
      where h.organization_id=org and h.project_id=project and h.obligation_id=obligation and h.source_anchor=binding.source_anchor;
    allocation:=null;
    if source.envelope is not null then
      select value into allocation from jsonb_array_elements(source.envelope->'allocations') where value->>'allocation_id'=binding.source_allocation_id::text;
    end if;
    select to_jsonb(s->>'current_source_anchor') into superseded_by from jsonb_array_elements(p->'supersessions') s where s->>'prior_source_anchor'=binding.source_anchor;
    documents:=documents||jsonb_build_array(jsonb_build_object(
      'source_anchor',binding.source_anchor,'document_key',binding.source_organization_id::text||':'||binding.invoice_id::text,
      'allocation_key',binding.source_allocation_id::text,'status',coalesce(allocation->>'status',binding.source_status),
      'amount_minor',case when allocation is not null then allocation->'amount_minor' else null end,
      'recipient_net_minor',source.envelope->'recipient_net_minor',
      'all_allocations_minor',case when source.envelope is null then null else (select to_jsonb(sum((value->>'amount_minor')::numeric)) from jsonb_array_elements(source.envelope->'allocations')) end,
      'replaces_estimate_minor',case when policy.event_id is not null then to_jsonb(policy.replaces_estimate_minor) else null end,
      'consumes_commitment_minor',case when policy.event_id is not null then to_jsonb(policy.consumes_commitment_minor) else null end,
      'current',source.envelope is not null and source.source_currentness='saved_receiver_heads_only'
        and source.source_economic_revision=binding.source_economic_revision and source.source_economic_fingerprint=binding.source_economic_fingerprint
        and allocation is not null,
      'policy_current',policy.event_id is not null and policy.baseline_event_id=baseline.event_id and policy.binding_event_id=binding.event_id
        and policy.source_economic_revision=binding.source_economic_revision and policy.source_economic_fingerprint=binding.source_economic_fingerprint,
      'superseded_by',coalesce(superseded_by,'null'::jsonb)));
  end loop;
  actual_invoice:=jsonb_array_length(documents);

  for capacity in select e.* from public.operations_obligation_credit_capacity_heads h join public.operations_obligation_credit_capacity_events e
    on e.organization_id=h.organization_id and e.source_anchor=h.source_anchor and e.revision=h.current_revision
    where h.organization_id=org and h.project_id=project and h.obligation_id=obligation order by h.source_anchor
  loop
    read_state:=operations_economy_private.read_credit_capacity_v1(org,project,obligation,capacity.source_anchor);
    credits:=credits||jsonb_build_array(jsonb_build_object('source_anchor',capacity.source_anchor,'original_anchor',capacity.original_anchor,
      'amount_minor',capacity.reserved_minor,'current',read_state->>'state'='local_capacity_proven' and (read_state->>'event_id')::uuid=capacity.event_id,
      'capacity_fingerprint',capacity.source_proof_fingerprint));
  end loop;
  actual_credit:=jsonb_array_length(credits);

  for assignment in select e.* from public.operations_hired_assignment_heads h join public.operations_hired_assignment_events e
    on e.organization_id=h.organization_id and e.source_identity=h.source_identity and e.revision=h.current_revision
    where h.organization_id=org and e.project_id=project and e.obligation_id=obligation order by h.source_identity
  loop
    read_state:=operations_hired_private.read_source_v1(org,project,obligation,assignment.source_identity);
    hired:=hired||jsonb_build_array(jsonb_build_object('source_identity',assignment.source_identity,
      'current',read_state->>'state'='current_operational_only' and read_state->>'assignment_event_id'=assignment.event_id::text,
      'coverage',coalesce(read_state#>>'{current_source,coverage}','unavailable'),
      'amount_minor',read_state#>'{current_source,amount_minor}','disposition','operational_only','assignment_fingerprint',assignment.fingerprint));
  end loop;
  actual_hired:=jsonb_array_length(hired);
  if actual_invoice<>(p->>'expected_invoice_source_count')::int or actual_credit<>(p->>'expected_credit_source_count')::int or actual_hired<>(p->>'expected_hired_source_count')::int
  then return jsonb_build_object('outcome','authority_inventory_changed','invoice_source_count',actual_invoice,'credit_source_count',actual_credit,'hired_source_count',actual_hired,'finance_copy_eligible',false);end if;

  input:=jsonb_build_object('schema_version','operations-obligation-reconciliation-input.v1','organization_id',org,'project_id',project,'obligation_id',obligation,
    'currency',baseline.currency,'estimate_minor',to_jsonb(baseline.estimate_minor),'committed_minor',to_jsonb(baseline.committed_minor),
    'documents',documents,'credits',credits,'hired',hired);
  document:=operations_economy_private.obligation_reconciliation_document_v1(input);
  next_revision:=expected+1;closed:=case when p->>'close_action'='close' then true when p->>'close_action'='reopen' then false else coalesce(head.economic_closed,false) end;
  -- The first close is the immutable close reference. Re-close appends current evidence
  -- and changes closed state, but never replaces the first frozen close snapshot.
  frozen:=case when p->>'close_action'='close' and head.frozen_close_snapshot_id is null then snapshot_id else head.frozen_close_snapshot_id end;
  document:=document||jsonb_build_object('revision',next_revision,'baseline_event_id',baseline.event_id,'baseline_fingerprint',baseline.fingerprint,
    'close_action',p->>'close_action','economic_closed',closed,'frozen_close_snapshot_id',frozen,'shadow_only',true);
  fingerprint:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(document),'UTF8')),'hex');
  insert into public.operations_obligation_reconciliation_snapshots(snapshot_id,organization_id,project_id,obligation_id,revision,baseline_event_id,close_action,document,fingerprint,actor_system_user_id,reason,idempotency_key,command)
    values(snapshot_id,org,project,obligation,next_revision,baseline.event_id,p->>'close_action',document,fingerprint,actor,p->>'reason',p->>'idempotency_key',p);
  if head.obligation_id is null then
    insert into public.operations_obligation_reconciliation_heads values(org,project,obligation,next_revision,snapshot_id,closed,frozen);
  else
    update public.operations_obligation_reconciliation_heads set current_revision=next_revision,current_snapshot_id=snapshot_id,economic_closed=closed,frozen_close_snapshot_id=frozen
      where organization_id=org and obligation_id=obligation;
  end if;
  receipt:=jsonb_build_object('schema_version','operations-obligation-reconciliation-receipt.v1','outcome','accepted','organization_id',org,'project_id',project,
    'obligation_id',obligation,'revision',next_revision,'snapshot_id',snapshot_id,'snapshot_fingerprint',fingerprint,
    'current_amount_minor',document->'current_amount_minor','eac_minor',document->'eac_minor','coverage',document->'coverage',
    'finance_copy_eligible',document->'finance_copy_eligible','finance_recalculated',false,'economic_closed',closed,'frozen_close_snapshot_id',frozen,'shadow_only',true);
  insert into public.operations_obligation_reconciliation_receipts values(receipt_id,org,project,obligation,next_revision,snapshot_id,fingerprint,receipt,default);
  return receipt;
end;$$;
revoke all on function operations_economy_private.append_obligation_reconciliation_v1(jsonb) from public,anon,service_role;
grant execute on function operations_economy_private.append_obligation_reconciliation_v1(jsonb) to authenticated;

create function public.append_operations_obligation_reconciliation_v1(p_command jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select operations_economy_private.append_obligation_reconciliation_v1(p_command);
$$;
revoke all on function public.append_operations_obligation_reconciliation_v1(jsonb) from public,anon,service_role;
grant execute on function public.append_operations_obligation_reconciliation_v1(jsonb) to authenticated;

create function operations_economy_private.read_obligation_reconciliation_v1(p_org uuid,p_project uuid,p_obligation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;h public.operations_obligation_reconciliation_heads%rowtype;current_doc jsonb;frozen_doc jsonb;begin
  org:=operations_economy_private.authorize_obligation_admin_v1(p_project);
  if p_org is null or p_org<>org then raise exception 'obligation_reconciliation_tenant_mismatch' using errcode='42501';end if;
  perform 1 from public.operations_obligation_reconciliation_gates where organization_id=org and enabled for share;
  if not found then raise exception 'obligation_reconciliation_gate_disabled' using errcode='42501';end if;
  select * into h from public.operations_obligation_reconciliation_heads where organization_id=org and project_id=p_project and obligation_id=p_obligation for share;
  if not found then return jsonb_build_object('schema_version','operations-obligation-reconciliation-read.v1','state','absent','organization_id',org,'project_id',p_project,'obligation_id',p_obligation,'finance_copy_eligible',false,'finance_recalculated',false);end if;
  select document into strict current_doc from public.operations_obligation_reconciliation_snapshots where snapshot_id=h.current_snapshot_id;
  if h.frozen_close_snapshot_id is not null then select document into strict frozen_doc from public.operations_obligation_reconciliation_snapshots where snapshot_id=h.frozen_close_snapshot_id;end if;
  return jsonb_build_object('schema_version','operations-obligation-reconciliation-read.v1','state','current','organization_id',org,'project_id',p_project,'obligation_id',p_obligation,
    'current_revision',h.current_revision,'economic_closed',h.economic_closed,'frozen_close_snapshot_id',h.frozen_close_snapshot_id,
    'current',current_doc,'frozen_close',frozen_doc,
    'finance_copy_eligible',current_doc->'finance_copy_eligible','finance_recalculated',false);
end;$$;
revoke all on function operations_economy_private.read_obligation_reconciliation_v1(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function operations_economy_private.read_obligation_reconciliation_v1(uuid,uuid,uuid) to authenticated;
create function public.read_operations_obligation_reconciliation_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select operations_economy_private.read_obligation_reconciliation_v1(p_organization_id,p_project_id,p_obligation_id);
$$;
revoke all on function public.read_operations_obligation_reconciliation_v1(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.read_operations_obligation_reconciliation_v1(uuid,uuid,uuid) to authenticated;

comment on function public.append_operations_obligation_reconciliation_v1(jsonb) is
  'Default-off Operations-only immutable reconciliation. Reads saved authorities; never writes or recalculates Finance.';
