-- Step 7, default-off: a bounded Operations-owned projection for one invoice-basis
-- obligation. This does not claim whole-project/category/credit/hired coverage and
-- never writes Finance or source evidence.
create table public.operations_positive_invoice_projection_read_gates (
  organization_id uuid primary key,
  enabled boolean not null default false
);
alter table public.operations_positive_invoice_projection_read_gates enable row level security;
revoke all on public.operations_positive_invoice_projection_read_gates from public,anon,authenticated,service_role;
grant select,insert,update on public.operations_positive_invoice_projection_read_gates to service_role;
create trigger operations_positive_invoice_projection_gate_identity
before update on public.operations_positive_invoice_projection_read_gates
for each row execute function operations_economy_private.invoice_kernel_read_gate_guard_v1();
create trigger operations_positive_invoice_projection_gate_no_delete
before delete on public.operations_positive_invoice_projection_read_gates
for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_positive_invoice_projection_gate_no_truncate
before truncate on public.operations_positive_invoice_projection_read_gates
for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.positive_invoice_obligation_projection_v1(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  k text;s jsonb;source_keys jsonb:='[]'::jsonb;issues jsonb:='[]'::jsonb;
  prior_key text:=null;estimate numeric;committed numeric;amount numeric;replacement numeric;consumption numeric;
  preliminary numeric:=0;confirmed numeric:=0;replaced numeric:=0;consumed numeric:=0;
  remaining_estimate numeric;remaining_commitment numeric;remaining numeric;eac numeric;
  source_count int:=0;active_count int:=0;rejected_count int:=0;complete boolean:=true;
begin
  if jsonb_typeof(p) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p))<>8
    or not(p ?& array['schema_version','organization_id','project_id','obligation_id','currency','estimate_minor','committed_minor','sources'])
    or p->>'schema_version' is distinct from 'operations-positive-invoice-obligation-input.v1'
  then raise exception 'exact_positive_invoice_projection_input_required' using errcode='22023';end if;
  foreach k in array array['organization_id','project_id','obligation_id'] loop
    if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'invalid_positive_invoice_projection_identity' using errcode='22023';end if;
  end loop;
  if jsonb_typeof(p->'currency') is distinct from 'string' or p->>'currency' !~ '^[A-Z]{3}$'
    or jsonb_typeof(p->'sources') is distinct from 'array' or jsonb_array_length(p->'sources')>200
  then raise exception 'invalid_positive_invoice_projection_envelope' using errcode='22023';end if;
  foreach k in array array['estimate_minor','committed_minor'] loop
    if jsonb_typeof(p->k) is distinct from 'null' and
      (jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric<>trunc((p->>k)::numeric)
       or (p->>k)::numeric not between 0 and 9007199254740991)
    then raise exception 'invalid_positive_invoice_projection_money' using errcode='22023';end if;
  end loop;
  estimate:=case when jsonb_typeof(p->'estimate_minor')='number' then (p->>'estimate_minor')::numeric end;
  committed:=case when jsonb_typeof(p->'committed_minor')='number' then (p->>'committed_minor')::numeric end;
  if estimate is null then complete:=false;issues:=issues||'"missing_estimate"'::jsonb;end if;
  if committed is null then complete:=false;issues:=issues||'"missing_commitment"'::jsonb;end if;
  for s in select value from jsonb_array_elements(p->'sources') order by value->>'source_key' collate "C" loop
    if jsonb_typeof(s) is distinct from 'object' or (select count(*) from jsonb_object_keys(s))<>7
      or not(s ?& array['source_key','status','amount_minor','replaces_estimate_minor','consumes_commitment_minor','binding_state','policy_state'])
      or jsonb_typeof(s->'source_key') is distinct from 'string' or s->>'source_key' !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(s->'binding_state') is distinct from 'string' or s->>'binding_state' not in ('resolved','unresolved')
      or jsonb_typeof(s->'policy_state') is distinct from 'string' or s->>'policy_state' not in ('current','missing','stale')
      or (s->>'binding_state'='resolved' and
          (jsonb_typeof(s->'status') is distinct from 'string' or s->>'status' not in ('preliminary','confirmed','rejected')))
      or (s->>'binding_state'='unresolved' and jsonb_typeof(s->'status') is distinct from 'null')
    then raise exception 'invalid_positive_invoice_projection_source' using errcode='22023';end if;
    if prior_key is not null and prior_key>=s->>'source_key' then raise exception 'duplicate_positive_invoice_projection_source' using errcode='23505';end if;
    prior_key:=s->>'source_key';source_keys:=source_keys||to_jsonb(s->>'source_key');source_count:=source_count+1;
    foreach k in array array['amount_minor','replaces_estimate_minor','consumes_commitment_minor'] loop
      if jsonb_typeof(s->k) is distinct from 'null' and
        (jsonb_typeof(s->k) is distinct from 'number' or (s->>k)::numeric<>trunc((s->>k)::numeric)
         or (s->>k)::numeric not between 0 and 9007199254740991)
      then raise exception 'invalid_positive_invoice_projection_source_money' using errcode='22023';end if;
    end loop;
    if s->>'binding_state'<>'resolved' then complete:=false;issues:=issues||to_jsonb('unresolved_source:'||(s->>'source_key'));continue;end if;
    if s->>'status'='rejected' then rejected_count:=rejected_count+1;continue;end if;
    if s->>'policy_state'<>'current' or jsonb_typeof(s->'amount_minor')<>'number'
      or jsonb_typeof(s->'replaces_estimate_minor')<>'number' or jsonb_typeof(s->'consumes_commitment_minor')<>'number'
    then complete:=false;issues:=issues||to_jsonb('unavailable_source_policy:'||(s->>'source_key'));continue;end if;
    amount:=(s->>'amount_minor')::numeric;replacement:=(s->>'replaces_estimate_minor')::numeric;consumption:=(s->>'consumes_commitment_minor')::numeric;
    if amount<=0 then raise exception 'positive_invoice_projection_requires_positive_amount' using errcode='22023';end if;
    active_count:=active_count+1;replaced:=replaced+replacement;consumed:=consumed+consumption;
    if s->>'status'='confirmed' then confirmed:=confirmed+amount;else preliminary:=preliminary+amount;end if;
  end loop;
  if estimate is not null and replaced>estimate then raise exception 'positive_invoice_replacement_exceeds_estimate' using errcode='22003';end if;
  if committed is not null and consumed>committed then raise exception 'positive_invoice_consumption_exceeds_commitment' using errcode='22003';end if;
  if greatest(preliminary,confirmed,replaced,consumed,preliminary+confirmed)>9007199254740991 then raise exception 'unsafe_positive_invoice_projection_sum' using errcode='22003';end if;
  if complete then
    remaining_estimate:=estimate-replaced;remaining_commitment:=committed-consumed;
    remaining:=greatest(remaining_estimate,remaining_commitment);eac:=preliminary+confirmed+remaining;
    if eac>9007199254740991 then raise exception 'unsafe_positive_invoice_projection_sum' using errcode='22003';end if;
  end if;
  return jsonb_build_object(
    'schema','operations-positive-invoice-obligation-projection.v1','authorityScope','operations_single_obligation_positive_invoice_only',
    'organizationId',p->'organization_id','projectId',p->'project_id','obligationId',p->'obligation_id','currency',p->'currency',
    'sourceKeys',source_keys,'sourceCount',source_count,'activeSourceCount',active_count,'rejectedSourceCount',rejected_count,
    'preliminaryMinor',case when complete then preliminary else null end,
    'confirmedMinor',case when complete then confirmed else null end,
    'knownInvoiceMinor',case when complete then preliminary+confirmed else null end,
    'estimateRemainingMinor',case when complete then remaining_estimate else null end,
    'commitmentRemainingMinor',case when complete then remaining_commitment else null end,
    'remainingMinor',case when complete then remaining else null end,'eacMinor',case when complete then eac else null end,
    'coverage',case when complete then 'complete_for_bound_positive_invoice_sources' else 'unavailable' end,'issues',issues,
    'totalProjectCoverage','unavailable','creditCoverage','unavailable','hiredCoverage','unavailable','financeRecalculated',false,'shadowOnly',true);
end;$$;
revoke all on function operations_economy_private.positive_invoice_obligation_projection_v1(jsonb) from public,anon,authenticated,service_role;

create function operations_economy_private.read_positive_invoice_obligation_projection_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;d jsonb;s jsonb;sources jsonb:='[]'::jsonb;projection jsonb;request jsonb;key text;
begin
  if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>6
    or not(p ?& array['schema_version','root_kind','root_id','obligation_id','expected_composition_snapshot_id','expected_baseline_event_id'])
    or p->>'schema_version' is distinct from 'operations-positive-invoice-obligation-read.v1'
  then raise exception 'exact_positive_invoice_projection_request_required' using errcode='22023';end if;
  foreach key in array array['root_id','obligation_id','expected_composition_snapshot_id','expected_baseline_event_id'] loop
    if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'invalid_positive_invoice_projection_request_identity' using errcode='22023';end if;
  end loop;
  if jsonb_typeof(p->'root_kind') is distinct from 'string' or p->>'root_kind' not in ('project','large_project','packing_project')
  then raise exception 'invalid_positive_invoice_projection_root' using errcode='22023';end if;
  org:=operations_economy_private.authorize_scope_admin_v1();
  perform 1 from public.operations_positive_invoice_projection_read_gates where organization_id=org and enabled for share;
  if not found then raise exception 'positive_invoice_projection_read_gate_disabled' using errcode='42501';end if;
  request:=p||jsonb_build_object('schema_version','operations-scope-obligation-drilldown-read.v1');
  d:=operations_economy_private.read_scope_obligation_drilldown_v1(request);
  if d->>'organizationId' is distinct from org::text or d->>'obligationId' is distinct from p->>'obligation_id'
    or (d->>'rootKind'='project' and d->>'obligationProjectId' is distinct from d->>'rootId')
    or d->>'state'<>'received_evidence' or d#>>'{baseline,costBasis}'<>'invoice'
  then raise exception 'current_positive_invoice_obligation_required' using errcode='PT409';end if;
  for s in select value from jsonb_array_elements(d->'sources') order by value->>'sourceKey' collate "C" loop
    sources:=sources||jsonb_build_array(jsonb_build_object(
      'source_key',s->'sourceKey','status',s->'status','amount_minor',s->'amountMinor',
      'replaces_estimate_minor',s->'replacesEstimateMinor','consumes_commitment_minor',s->'consumesCommitmentMinor',
      'binding_state',s->'bindingState','policy_state',s->'policyState'));
  end loop;
  projection:=operations_economy_private.positive_invoice_obligation_projection_v1(jsonb_build_object(
    'schema_version','operations-positive-invoice-obligation-input.v1','organization_id',org,
    'project_id',d->'obligationProjectId','obligation_id',d->'obligationId','currency',d#>'{baseline,currency}',
    'estimate_minor',d#>'{baseline,estimateMinor}','committed_minor',d#>'{baseline,committedMinor}','sources',sources));
  return jsonb_build_object('schema','operations-positive-invoice-obligation-read.v1','rootKind',d->'rootKind','rootId',d->'rootId',
    'compositionSnapshotId',d->'compositionSnapshotId','baselineEventId',d#>'{baseline,eventId}',
    'asOf',d->'asOf','projection',projection,'budgetMinor',null,'marginMinor',null);
end;$$;
revoke all on function operations_economy_private.read_positive_invoice_obligation_projection_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_positive_invoice_obligation_projection_v1(jsonb) to authenticated;
create function public.read_operations_positive_invoice_obligation_projection_v1(p_request jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select operations_economy_private.read_positive_invoice_obligation_projection_v1(p_request);
$$;
revoke all on function public.read_operations_positive_invoice_obligation_projection_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_positive_invoice_obligation_projection_v1(jsonb) to authenticated;

comment on function public.read_operations_positive_invoice_obligation_projection_v1(jsonb) is
  'Default-off Operations-only bounded projection for one invoice-basis obligation. Never a Finance or whole-project recalculation.';
