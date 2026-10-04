-- Read-only, rate-redacted project evidence. No money or approval is written here.
create function operations_economy_private.read_project_cost_v1(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_personnel jsonb; v_invoices jsonb; v_missing bigint;
begin
  v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
  if p_organization_id is null or p_organization_id<>v_org then
    raise exception 'active_organization_project_mismatch' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'streamKey',encode(sha256(convert_to(p.source_time_stream_id,'UTF8')),'hex'),'reportId',p.cost_snapshot->>'source_time_report_id',
    'lineId',l.value->>'source_time_line_id','revision',p.source_revision,
    'timeVersion',(p.cost_snapshot->>'time_snapshot_version')::bigint,
    'workDate',p.cost_snapshot->>'work_date','minutes',(l.value->>'minutes')::bigint,
    'amountMinor',l.value->'amount_minor','currency',l.value->>'currency',
    'status',l.value->>'status','coverage',l.value->>'coverage','publishedAt',p.created_at,
    'financeDeliveryState',o.state,'financeCurrentRevision',(o.receipt->>'current_source_revision')::bigint
  ) order by p.cost_snapshot->>'work_date',p.source_time_stream_id,l.value->>'source_time_line_id'),'[]'::jsonb)
  into v_personnel
  from public.operations_personnel_cost_streams h
  join public.operations_personnel_cost_publications p on p.organization_id=h.organization_id
    and p.source_time_stream_id=h.source_time_stream_id and p.source_revision=h.current_revision
  left join public.operations_personnel_cost_outbox o on o.organization_id=h.organization_id
    and o.source_time_stream_id=h.source_time_stream_id and o.source_revision=h.current_revision
  cross join lateral jsonb_array_elements(p.cost_snapshot->'lines') l(value)
  where h.organization_id=v_org and (l.value->>'source_project_id')::uuid=p_project_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceOrganizationId',p.source_organization_id,'invoiceId',p.invoice_id,
    'allocationId',l.value->>'allocation_id','revision',p.source_revision,
    'documentNumber',p.envelope->>'provider_document_number','kind',p.envelope->>'invoice_kind',
    'amountMinor',l.value->'amount_minor','currency',p.envelope->>'currency',
    'status',l.value->>'status','accountingState',p.envelope->>'accounting_state',
    'settlementState',p.envelope->>'settlement_state','providerApprovalState',p.envelope->>'provider_approval_state',
    'providerSourceChanged',p.envelope->'provider_source_changed',
    'creditRelationCoverage',p.envelope->>'credit_relation_coverage','receivedAt',p.created_at
  ) order by p.invoice_id,l.value->>'allocation_id'),'[]'::jsonb)
  into v_invoices
  from public.operations_finance_invoice_streams h
  join public.operations_finance_invoice_snapshots p on p.organization_id=h.organization_id
    and p.source_organization_id=h.source_organization_id and p.invoice_id=h.invoice_id and p.source_revision=h.current_revision
  cross join lateral jsonb_array_elements(p.envelope->'allocations') l(value)
  where h.organization_id=v_org and (l.value->>'destination_project_id')::uuid=p_project_id;
  if jsonb_array_length(v_personnel)>2000 or jsonb_array_length(v_invoices)>2000 then
    raise exception 'project_evidence_requires_pagination' using errcode='54000'; end if;
  select count(*) into v_missing from jsonb_array_elements(v_personnel)
    where value->>'coverage'='missing_rate' and value->>'status'<>'rejected';
  return jsonb_build_object('schema','operations-project-cost-evidence.v1','organizationId',v_org,
    'projectId',p_project_id,'generatedAt',now(),'personnel',v_personnel,'invoices',v_invoices,
    'missingPersonnelCostCount',v_missing);
end; $$;
revoke all on function operations_economy_private.read_project_cost_v1(uuid,uuid) from public,anon,service_role;
grant execute on function operations_economy_private.read_project_cost_v1(uuid,uuid) to authenticated;
create function public.read_operations_project_cost_evidence_v1(p_organization_id uuid,p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select operations_economy_private.read_project_cost_v1(p_organization_id,p_project_id);
$$;
revoke all on function public.read_operations_project_cost_evidence_v1(uuid,uuid) from public,anon,service_role;
grant execute on function public.read_operations_project_cost_evidence_v1(uuid,uuid) to authenticated;
