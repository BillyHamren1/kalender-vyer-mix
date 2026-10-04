-- Step 8 internal payload projector. The projector preserves the existing shadow
-- payload byte semantics while keeping actor authorization in the existing wrapper.
create function operations_economy_private.project_economy_step8_shadow_payload_v1(
  p_organization_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_personnel jsonb;
  v_invoices jsonb;
  v_exceptions jsonb;
  v_personnel_coverage text;
  v_invoice_coverage text;
  v_result jsonb;
begin
  if p_organization_id is null or p_project_id is null then
    raise exception 'step8_shadow_payload_binding_required' using errcode='22023';
  end if;
  if not exists(
    select 1
    from public.projects
    where id=p_project_id
      and organization_id=p_organization_id
      and deleted_at is null
  ) then
    raise exception 'step8_shadow_payload_project_organization_mismatch' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(b.row_value order by b.work_date,b.stream_key,b.line_id),'[]'::jsonb)
  into v_personnel
  from (
    select
      p.cost_snapshot->>'work_date' as work_date,
      encode(sha256(convert_to(p.source_time_stream_id,'UTF8')),'hex') as stream_key,
      l.value->>'source_time_line_id' as line_id,
      jsonb_build_object(
        'organizationId',p.organization_id,
        'projectId',p_project_id,
        'sourceBookingId',l.value->'source_booking_id',
        'sourceTimeStreamKey',encode(sha256(convert_to(p.source_time_stream_id,'UTF8')),'hex'),
        'reportId',p.source_time_report_id,
        'lineId',l.value->>'source_time_line_id',
        'revision',p.source_revision,
        'timeSnapshotVersion',p.time_snapshot_version,
        'workDate',p.cost_snapshot->>'work_date',
        'minutes',(l.value->>'minutes')::bigint,
        'amountMinor',l.value->'amount_minor',
        'currency',l.value->>'currency',
        'status',l.value->>'status',
        'coverage',l.value->>'coverage'
      ) as row_value
    from public.operations_personnel_cost_streams h
    join public.operations_personnel_cost_publications p
      on p.organization_id=h.organization_id
      and p.source_time_stream_id=h.source_time_stream_id
      and p.source_revision=h.current_revision
    cross join lateral jsonb_array_elements(p.cost_snapshot->'lines') l(value)
    where h.organization_id=p_organization_id
      and (l.value->>'source_project_id')::uuid=p_project_id
    order by p.cost_snapshot->>'work_date',p.source_time_stream_id,l.value->>'source_time_line_id'
    limit 501
  ) b;
  if jsonb_array_length(v_personnel)>500 then
    raise exception 'step8_shadow_personnel_requires_pagination' using errcode='54000';
  end if;

  -- The canonical compatibility view selects the current v1/v2 economic envelope.
  -- A source conflict has no project-safe envelope to inspect, so the shadow read
  -- fails closed rather than silently presenting a stale or guessed relationship.
  if exists(
    select 1 from public.operations_finance_invoice_economic_current_v2 current_invoice
    where current_invoice.organization_id=p_organization_id
      and (current_invoice.source_protocol='conflict' or current_invoice.envelope is null)
  ) then
    raise exception 'step8_shadow_invoice_source_conflict' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(b.row_value order by b.invoice_id,b.allocation_id),'[]'::jsonb)
  into v_invoices
  from (
    select
      p.envelope->>'invoice_id' as invoice_id,
      l.value->>'allocation_id' as allocation_id,
      jsonb_build_object(
        'organizationId',p.organization_id,
        'projectId',p_project_id,
        'sourceOrganizationId',p.envelope->>'source_organization_id',
        'invoiceId',p.envelope->>'invoice_id',
        'allocationId',l.value->>'allocation_id',
        'revision',(p.envelope->>'source_revision')::bigint,
        'sourceProtocol',p.source_protocol,
        'sourceEconomicRevision',p.source_economic_revision,
        'sourceEconomicFingerprint',p.source_economic_fingerprint,
        'sourceObservationId',p.envelope->>'source_observation_id',
        'publicationFingerprint',p.envelope->>'source_publication_fingerprint',
        'documentFingerprint',p.envelope->>'document_fingerprint',
        'kind',p.envelope->>'invoice_kind',
        'amountMinor',l.value->'amount_minor',
        'currency',p.envelope->>'currency',
        'status',l.value->>'status',
        'approvalState',p.envelope->>'provider_approval_state',
        'accountingState',p.envelope->>'accounting_state',
        'settlementState',p.envelope->>'settlement_state',
        'sourceChanged',p.envelope->'provider_source_changed',
        'creditRelationCoverage',p.envelope->>'credit_relation_coverage',
        'creditRelationshipFingerprint',p.envelope->'credit_relationship_fingerprint',
        'sourceAnchor',l.value->'source_anchor',
        'creditedSourceAnchor',l.value->'credited_source_anchor',
        'unallocatedMinor',
          (p.envelope->>'recipient_net_minor')::bigint-
          coalesce((select sum((a.value->>'amount_minor')::bigint) from jsonb_array_elements(p.envelope->'allocations') a(value)),0),
        'exceptions',
          (case when (p.envelope->>'provider_source_changed')::boolean then '["source_changed_after_import"]'::jsonb else '[]'::jsonb end)
          || (case when p.envelope->>'invoice_kind'='credit' and p.envelope->>'credit_relation_coverage'<>'linked'
              then '["credit_relation_unresolved"]'::jsonb else '[]'::jsonb end)
          || (case when (p.envelope->>'recipient_net_minor')::bigint<>
              coalesce((select sum((a.value->>'amount_minor')::bigint) from jsonb_array_elements(p.envelope->'allocations') a(value)),0)
              then '["unallocated_amount"]'::jsonb else '[]'::jsonb end)
          || (case when l.value->>'status'='rejected' then '["rejected_document"]'::jsonb else '[]'::jsonb end)
      ) as row_value
    from public.operations_finance_invoice_economic_current_v2 p
    cross join lateral jsonb_array_elements(p.envelope->'allocations') l(value)
    where p.organization_id=p_organization_id
      and (l.value->>'destination_project_id')::uuid=p_project_id
    order by p.envelope->>'invoice_id',l.value->>'allocation_id'
    limit 501
  ) b;
  if jsonb_array_length(v_invoices)>500 then
    raise exception 'step8_shadow_invoices_require_pagination' using errcode='54000';
  end if;
  if exists(
    select 1 from jsonb_array_elements(v_invoices) row_value
    where row_value->>'sourceProtocol' not in ('v1','v2')
      or row_value->>'sourceEconomicFingerprint' !~ '^[0-9a-f]{64}$'
      or (row_value->>'sourceProtocol'='v2' and row_value->'sourceAnchor'='null'::jsonb)
      or (row_value->>'kind'='invoice' and (
        row_value->>'creditRelationCoverage'<>'not_applicable'
        or row_value->'creditRelationshipFingerprint'<>'null'::jsonb
        or row_value->'creditedSourceAnchor'<>'null'::jsonb
      ))
      or (row_value->>'kind'='credit' and row_value->>'creditRelationCoverage' not in ('unresolved','linked'))
      or (row_value->>'creditRelationCoverage'='linked' and (
        row_value->>'creditRelationshipFingerprint' !~ '^[0-9a-f]{64}$'
        or row_value->>'sourceAnchor' !~ '^[0-9a-f]{64}$'
        or row_value->>'creditedSourceAnchor' !~ '^[0-9a-f]{64}$'
        or row_value->>'sourceAnchor'=row_value->>'creditedSourceAnchor'
      ))
  ) then
    raise exception 'step8_shadow_credit_relationship_incomplete' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(e order by e->>'category',e->>'identity'),'[]'::jsonb)
  into v_exceptions
  from (
    select jsonb_build_object(
      'category','personnel','identity',(value->>'sourceTimeStreamKey')||':'||(value->>'lineId'),
      'code','missing_rate','amountMinor',null
    ) e
    from jsonb_array_elements(v_personnel)
    where value->>'coverage'='missing_rate' and value->>'status'<>'rejected'
    union all
    select jsonb_build_object(
      'category','invoice','identity',(value->>'invoiceId')||':'||(value->>'allocationId'),
      'code',code,'amountMinor',case when code='unallocated_amount' then value->'unallocatedMinor' else null end
    ) e
    from jsonb_array_elements(v_invoices)
    cross join lateral jsonb_array_elements_text(value->'exceptions') x(code)
  ) exceptions;

  v_personnel_coverage:=case
    when jsonb_array_length(v_personnel)=0 then 'unavailable'
    when exists(select 1 from jsonb_array_elements(v_personnel) where value->>'coverage'<>'complete') then 'incomplete'
    else 'complete'
  end;
  v_invoice_coverage:=case
    when jsonb_array_length(v_invoices)=0 then 'unavailable'
    when exists(select 1 from jsonb_array_elements(v_invoices) where jsonb_array_length(value->'exceptions')>0) then 'incomplete'
    else 'complete'
  end;
  v_result:=jsonb_build_object(
    'schema','operations-project-economy-step8-shadow.v1',
    'organizationId',p_organization_id,
    'projectId',p_project_id,
    'generatedAt',now(),
    'authority','operations_received_evidence',
    'personnel',v_personnel,
    'invoices',v_invoices,
    'exceptions',v_exceptions,
    'coverage',jsonb_build_object('personnel',v_personnel_coverage,'invoices',v_invoice_coverage),
    'financeRecalculated',false,
    'authoritativeTotals',false,
    'replacesLegacyTotals',false,
    'shadowOnly',true
  );
  if octet_length(v_result::text)>262144 then
    raise exception 'step8_shadow_response_size_limit' using errcode='54000';
  end if;
  return v_result;
end;
$$;

revoke all on function operations_economy_private.project_economy_step8_shadow_payload_v1(uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function operations_economy_private.read_project_economy_step8_shadow_v1(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_project uuid;
  v_authorized_org uuid;
begin
  if jsonb_typeof(p_request) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_request)) <> 3
    or not (p_request ?& array['schemaVersion','organizationId','projectId'])
    or p_request->>'schemaVersion' is distinct from 'operations-project-economy-step8-shadow-read.v1'
    or jsonb_typeof(p_request->'organizationId') is distinct from 'string'
    or jsonb_typeof(p_request->'projectId') is distinct from 'string'
    or p_request->>'organizationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_request->>'projectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception 'exact_step8_shadow_read_request_required' using errcode = '22023';
  end if;

  v_org := (p_request->>'organizationId')::uuid;
  v_project := (p_request->>'projectId')::uuid;
  v_authorized_org := operations_economy_private.authorize_project_v1(v_project,false);
  if v_org is distinct from v_authorized_org then
    raise exception 'step8_shadow_organization_project_mismatch' using errcode = '42501';
  end if;

  return operations_economy_private.project_economy_step8_shadow_payload_v1(
    v_authorized_org,
    v_project
  );
end;
$$;

revoke all on function operations_economy_private.read_project_economy_step8_shadow_v1(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_project_economy_step8_shadow_v1(jsonb)
  to authenticated;
