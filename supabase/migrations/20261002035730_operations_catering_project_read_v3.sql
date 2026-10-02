-- Additive Catering-only parity. All money is copied from immutable Operations
-- publications; old v1/v2 readers and all cost/approval/billing writers are unchanged.
create function operations_economy_private.read_catering_project_v3(p_organization_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; rows jsonb; lines jsonb; withdrawals jsonb; totals jsonb:='[]'::jsonb;
 missing bigint; minutes numeric; c record;
begin
 v_org:=operations_economy_private.authorize_project_v1(p_project_id,false);
 if p_organization_id is null or p_organization_id<>v_org then raise exception 'active_organization_project_mismatch' using errcode='42501';end if;
 with bounded as (
 select p.source_stream_id,p.source_revision,p.snapshot,p.created_at
 from public.operations_catering_cost_streams h
 join public.operations_catering_cost_publications p on p.organization_id=h.organization_id
 and p.source_stream_id=h.source_stream_id and p.source_revision=h.current_revision
 where h.organization_id=v_org and exists(select 1 from public.operations_catering_cost_publications old
 where old.organization_id=h.organization_id and old.source_stream_id=h.source_stream_id
 and old.snapshot->>'project_id'=p_project_id::text)
 order by p.source_stream_id limit 2001
 ) select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) into rows from bounded b;
 if jsonb_array_length(rows)>2000 then raise exception 'catering_project_evidence_requires_pagination' using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'streamKey',encode(sha256(convert_to(p->>'source_stream_id','UTF8')),'hex'),
 'obligationId',p#>>'{snapshot,obligation_id}','revision',(p->>'source_revision')::bigint,
 'sourceEntryVersion',(p#>>'{snapshot,source_time_entry_version}')::bigint,
 'workDate',p#>>'{snapshot,work_date}','minutes',(p#>>'{snapshot,minutes}')::bigint,
 'amountMinor',p#>'{snapshot,amount_minor}','currency',p#>>'{snapshot,currency}',
 'status',p#>>'{snapshot,project_review_status}','coverage',p#>>'{snapshot,coverage}',
 'sourceStatus',p#>>'{snapshot,source_status}','publishedAt',p->>'created_at')
 order by p#>>'{snapshot,work_date}',p->>'source_stream_id'),'[]'::jsonb) into lines
 from jsonb_array_elements(rows) p where p#>>'{snapshot,project_id}'=p_project_id::text;
 select coalesce(jsonb_agg(jsonb_build_object(
 'streamKey',encode(sha256(convert_to(p->>'source_stream_id','UTF8')),'hex'),
 'revision',(p->>'source_revision')::bigint,'publishedAt',p->>'created_at')
 order by p->>'source_stream_id'),'[]'::jsonb) into withdrawals
 from jsonb_array_elements(rows) p where p#>>'{snapshot,project_id}'<>p_project_id::text;
 select count(*),coalesce(sum((l->>'minutes')::numeric),0) into missing,minutes
 from jsonb_array_elements(lines) l where l->>'status'<>'rejected' and l->'amountMinor'='null'::jsonb;
 if minutes>9007199254740991 then raise exception 'catering_minutes_exceed_safe_range' using errcode='22003';end if;
 for c in select l->>'currency' currency,
 sum((l->>'amountMinor')::numeric) filter(where l->>'status'='preliminary') preliminary_known,
 sum((l->>'amountMinor')::numeric) filter(where l->>'status'='confirmed') confirmed_known,
 sum((l->>'amountMinor')::numeric) known,
 count(*) filter(where l->'amountMinor'='null'::jsonb) missing_count,
 coalesce(sum((l->>'minutes')::numeric) filter(where l->'amountMinor'='null'::jsonb),0) missing_minutes
 from jsonb_array_elements(lines) l where l->>'status'<>'rejected'
 group by l->>'currency' order by l->>'currency' loop
 if c.known>9007199254740991 or c.missing_minutes>9007199254740991 then
 raise exception 'catering_subtotal_exceeds_safe_range' using errcode='22003';end if;
 totals:=totals||jsonb_build_array(jsonb_build_object('currency',c.currency,
 'preliminaryKnownMinor',c.preliminary_known::bigint,'confirmedKnownMinor',c.confirmed_known::bigint,
 'knownMinor',c.known::bigint,'receivedTotalMinor',case when c.missing_count>0 then null else c.known::bigint end,
 'missingCostLineCount',c.missing_count,'missingCostMinutes',c.missing_minutes::bigint));
 end loop;
 return jsonb_build_object('schema','operations-catering-project-evidence.v3','organizationId',v_org,'projectId',p_project_id,
 'generatedAt',now(),'upstreamCurrentness','unverified','shadowOnly',true,
 'evidenceState',case when jsonb_array_length(lines)=0 then 'no_evidence' when missing>0 then 'incomplete' else 'complete' end,
 'lines',lines,'withdrawals',withdrawals,'currencyTotals',totals,
 'counts',jsonb_build_object('lineCount',jsonb_array_length(lines),'withdrawalCount',jsonb_array_length(withdrawals),
 'missingCostLineCount',missing,'missingCostMinutes',minutes::bigint));
end;$$;
revoke all on function operations_economy_private.read_catering_project_v3(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_catering_project_v3(uuid,uuid) to authenticated;
create function public.read_operations_catering_project_evidence_v3(p_organization_id uuid,p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select operations_economy_private.read_catering_project_v3(p_organization_id,p_project_id);
$$;
revoke all on function public.read_operations_catering_project_evidence_v3(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_catering_project_evidence_v3(uuid,uuid) to authenticated;
