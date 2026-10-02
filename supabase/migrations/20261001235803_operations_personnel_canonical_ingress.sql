-- Canonical shadow ingress: source evidence + project-status derivation + publication
-- + durable outbox + review proof links commit as one transaction. Compatibility
-- functions remain unchanged; no migration alone activates an endpoint.
create function public.publish_operations_personnel_cost_ingress_v1(
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
      or v_target.source_booking_id is distinct from (v_line->>'source_booking_id')::uuid
      or v_target.currency is distinct from v_line->>'currency'
      or v_line->'minutes' is distinct from v_block->'durationMinutes'
      then raise exception 'allocation_binding_mismatch' using errcode='22023'; end if;
    if v_line->>'coverage'='complete' then
      select * into v_rate from public.operations_personnel_rate_history where organization_id=v_org and worker_id=v_worker
        and rate_revision=v_line->>'rate_revision' and category=v_block->>'kind' and currency=v_line->>'currency'
        and effective_from <= (p_snapshot->>'work_date')::date
        and (effective_to is null or (p_snapshot->>'work_date')::date<effective_to);
      if not found or v_rate.hourly_rate_minor <> (v_line->>'hourly_rate_minor')::bigint
        or floor(((v_line->>'minutes')::numeric*v_rate.hourly_rate_minor+30)/60) <> (v_line->>'amount_minor')::numeric
        then raise exception 'historical_rate_calculation_mismatch' using errcode='22023'; end if;
    elsif not coalesce(v_same_time,false) and exists(select 1 from public.operations_personnel_rate_history
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
  v_result:=public.publish_operations_personnel_cost_v1(v_snapshot,p_raw_time_snapshot,v_head,p_idempotency_key);
  if v_result->>'status' is distinct from 'accepted' then return v_result;end if;
  insert into public.operations_personnel_cost_outbox(organization_id,source_time_stream_id,source_revision,raw_body,body_sha256,
    source_evidence,destination_organization_id,key_id,endpoint_url)
    values(v_org,v_stream,v_head+1,v_body,encode(sha256(convert_to(v_body,'UTF8')),'hex'),p_source_evidence,
      v_route.destination_organization_id,v_route.key_id,v_route.endpoint_url) returning id into v_id;
  perform operations_economy_private.record_project_publication_proofs_v1(v_snapshot,v_projection->'proofs',v_head,'time_ingress',null,null,null,p_idempotency_key);
  return v_result||jsonb_build_object('outbox_id',v_id,'body_sha256',encode(sha256(convert_to(v_body,'UTF8')),'hex'));
end; $$;
revoke all on function public.publish_operations_personnel_cost_ingress_v1(jsonb,jsonb,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.publish_operations_personnel_cost_ingress_v1(jsonb,jsonb,jsonb,bigint,text) to service_role;
