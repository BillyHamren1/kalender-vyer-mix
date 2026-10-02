-- Additive, rate-redacted native evidence. Existing v1 and all money writers stay unchanged.
create function operations_economy_private.read_project_cost_v2(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb; native_rows jsonb; missing bigint;
begin
 -- Existing authenticated live-project authorization is mandatory even with no native evidence.
 base:=operations_economy_private.read_project_cost_v1(p_organization_id,p_project_id);
 select coalesce(jsonb_agg(row_value order by work_date,stream),'[]'::jsonb) into native_rows
 from (
  select p.snapshot->>'work_date' as work_date,p.source_stream_id as stream,
   jsonb_build_object(
    'streamKey',encode(sha256(convert_to(p.source_stream_id,'UTF8')),'hex'),
    'obligationId',p.snapshot->>'obligation_id','revision',p.source_revision,
    'sourceEntryVersion',(p.snapshot->>'source_time_entry_version')::bigint,
    'workDate',p.snapshot->>'work_date','minutes',(p.snapshot->>'minutes')::bigint,
    'amountMinor',p.snapshot->'amount_minor','currency',p.snapshot->>'currency',
    'status',p.snapshot->>'project_review_status','coverage',p.snapshot->>'coverage',
    'sourceStatus',p.snapshot->>'source_status','publishedAt',p.created_at
   ) as row_value
  from public.operations_catering_cost_streams h
  join public.operations_catering_cost_publications p on p.organization_id=h.organization_id
   and p.source_stream_id=h.source_stream_id and p.source_revision=h.current_revision
  where h.organization_id=p_organization_id and (p.snapshot->>'project_id')::uuid=p_project_id
  order by p.snapshot->>'work_date',p.source_stream_id limit 2001
 ) bounded;
 if jsonb_array_length(native_rows)>2000 then
  raise exception 'native_project_evidence_requires_pagination' using errcode='54000';end if;
 select count(*) into missing from jsonb_array_elements(native_rows)
  where value->>'coverage'='missing_rate' and value->>'status'<>'rejected';
 return base||jsonb_build_object('schema','operations-project-cost-evidence.v2',
  'catering',native_rows,'missingCateringCostCount',missing);
end $$;
revoke all on function operations_economy_private.read_project_cost_v2(uuid,uuid) from public,anon,service_role;
grant execute on function operations_economy_private.read_project_cost_v2(uuid,uuid) to authenticated;
create function public.read_operations_project_cost_evidence_v2(p_organization_id uuid,p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select operations_economy_private.read_project_cost_v2(p_organization_id,p_project_id);
$$;
revoke all on function public.read_operations_project_cost_evidence_v2(uuid,uuid) from public,anon,service_role;
grant execute on function public.read_operations_project_cost_evidence_v2(uuid,uuid) to authenticated;
