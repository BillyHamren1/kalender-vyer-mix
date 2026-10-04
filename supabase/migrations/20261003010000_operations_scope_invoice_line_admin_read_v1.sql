-- Additive, default-off UI read. Existing scope/kernel gates and current receiver heads remain authoritative.
create function operations_economy_private.read_scope_invoice_lines_admin_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 key text;capture_request jsonb;capture jsonb;evidence jsonb;inventory jsonb;member jsonb;source jsonb;
 binding public.operations_project_obligation_invoice_bindings%rowtype;
 lines jsonb:='[]'::jsonb;sorted_lines jsonb;unavailable bigint:=0;availability text;reply jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>4
 or not(p ?& array['schema_version','root_kind','root_id','expected_composition_snapshot_id'])
 or p->>'schema_version' is distinct from 'operations-scope-invoice-line-admin-read.v1'
 or jsonb_typeof(p->'root_kind') is distinct from 'string'
 or p->>'root_kind' not in ('project','large_project','packing_project')
 then raise exception 'exact_scope_invoice_line_admin_request_required' using errcode='22023';end if;
 foreach key in array array['root_id','expected_composition_snapshot_id'] loop
  if jsonb_typeof(p->key) is distinct from 'string'
  or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'invalid_scope_invoice_line_admin_identity' using errcode='22023';end if;
 end loop;

 capture_request:=jsonb_build_object(
  'schema_version','operations-scope-invoice-capture-admin-read.v1',
  'root_kind',p->>'root_kind','root_id',p->>'root_id',
  'expected_composition_snapshot_id',p->>'expected_composition_snapshot_id');
 -- This existing authenticated path performs the actual admin authorization, both gate checks,
 -- scope/composition/project locks and current receiver-head/source checks in this transaction.
 capture:=operations_economy_private.read_scope_invoice_capture_admin_compatible_v1(capture_request);
 evidence:=capture->'evidence';
 if capture->>'schema_version' is distinct from 'operations-scope-invoice-capture-admin-evidence.v1'
 or capture->>'authority_scope' is distinct from 'canonical_scope_invoice_capture'
 or evidence->>'root_kind' is distinct from p->>'root_kind'
 or evidence->>'root_id' is distinct from (p->>'root_id')::uuid::text
 or evidence->>'composition_snapshot_id' is distinct from (p->>'expected_composition_snapshot_id')::uuid::text
 or evidence->>'source_currentness' is distinct from 'saved_receiver_heads_only'
 then raise exception 'scope_invoice_line_source_proof_mismatch' using errcode='22023';end if;

 if jsonb_typeof(evidence->'source_inventory') is distinct from 'array'
 or jsonb_array_length(evidence->'source_inventory')>10000
 or jsonb_typeof(evidence->'members') is distinct from 'array'
 then raise exception 'scope_invoice_line_source_limit' using errcode='22023';end if;
 for inventory in select value from jsonb_array_elements(evidence->'source_inventory') order by value->>'source_anchor' collate "C" loop
  if inventory->>'mapping_state' is distinct from 'charging' then unavailable:=unavailable+1;continue;end if;
  begin
   select value into strict member from jsonb_array_elements(evidence->'members')
    where value->>'project_id'=inventory->>'project_id' and value->>'obligation_id'=inventory->>'obligation_id';
   select value into strict source from jsonb_array_elements(member#>'{kernel_evidence,sources}')
    where value->>'source_anchor'=inventory->>'source_anchor';
  exception when no_data_found or too_many_rows then
   raise exception 'scope_invoice_line_member_source_mismatch' using errcode='22023';
  end;
  if source->'resolved' is distinct from 'true'::jsonb or source->'reason' is distinct from 'null'::jsonb
  or source->>'binding_event_id' is distinct from inventory->>'binding_event_id'
  or source->>'source_organization_id' is distinct from inventory->>'source_organization_id'
  or source->>'invoice_id' is distinct from inventory->>'invoice_id'
  or source->>'source_economic_revision' is distinct from inventory->>'source_economic_revision'
  or source->>'source_economic_fingerprint' is distinct from inventory->>'source_economic_fingerprint'
  or source->>'status' not in ('preliminary','confirmed')
  or jsonb_typeof(source->'amount_minor') is distinct from 'number'
  or (source->>'amount_minor')::numeric<>trunc((source->>'amount_minor')::numeric)
  or (source->>'amount_minor')::numeric not between 1 and 9007199254740991
  then raise exception 'scope_invoice_line_resolved_source_mismatch' using errcode='22023';end if;

  select * into strict binding from public.operations_project_obligation_invoice_bindings
   where event_id=(inventory->>'binding_event_id')::uuid
   and organization_id=(evidence->>'organization_id')::uuid
   and project_id=(inventory->>'project_id')::uuid
   and obligation_id=(inventory->>'obligation_id')::uuid;
  if binding.source_anchor is distinct from inventory->>'source_anchor'
  or binding.source_organization_id is distinct from (inventory->>'source_organization_id')::uuid
  or binding.invoice_id is distinct from (inventory->>'invoice_id')::uuid
  or binding.source_snapshot_id is distinct from (inventory->>'source_snapshot_id')::uuid
  or binding.source_economic_revision is distinct from (inventory->>'source_economic_revision')::bigint
  or binding.source_economic_fingerprint is distinct from inventory->>'source_economic_fingerprint'
  or binding.amount_minor is distinct from (source->>'amount_minor')::bigint
  or binding.source_status is distinct from source->>'status'
  or binding.currency is distinct from evidence->>'currency'
  or binding.amount_minor<=0 or binding.source_status not in ('preliminary','confirmed')
  then raise exception 'scope_invoice_line_binding_mismatch' using errcode='22023';end if;

  lines:=lines||jsonb_build_array(jsonb_build_object(
   'source_organization_id',binding.source_organization_id,'project_id',binding.project_id,
   'invoice_id',binding.invoice_id,'source_allocation_id',binding.source_allocation_id,
   'amount_minor',binding.amount_minor,'currency',binding.currency,
   'source_economic_revision',binding.source_economic_revision,'source_status',binding.source_status,
   'source_economic_fingerprint',binding.source_economic_fingerprint));
 end loop;

 select coalesce(jsonb_agg(value order by value->>'source_organization_id' collate "C",value->>'invoice_id' collate "C",value->>'source_allocation_id' collate "C",value->>'project_id' collate "C"),'[]'::jsonb)
 into sorted_lines from jsonb_array_elements(lines);
 if jsonb_array_length(sorted_lines)<>(select count(distinct concat_ws(':',value->>'source_organization_id',value->>'invoice_id',value->>'source_allocation_id',value->>'project_id')) from jsonb_array_elements(sorted_lines))
 then raise exception 'duplicate_scope_invoice_line_identity' using errcode='22023';end if;
 availability:=case when jsonb_array_length(sorted_lines)=0 then 'unavailable'
  when unavailable=0 and (evidence->>'captured_inventory_matches_current')::boolean then 'available' else 'partial' end;
 reply:=jsonb_build_object(
  'schema_version','operations-scope-invoice-line-admin-evidence.v1',
  'authority_scope','canonical_scope_invoice_line_capture',
  'organization_id',evidence->'organization_id','root_kind',evidence->'root_kind','root_id',evidence->'root_id',
  'composition_snapshot_id',evidence->'composition_snapshot_id','scope_revision',evidence->'scope_revision',
  'source_currentness','saved_receiver_heads_only',
  'captured_inventory_matches_current',evidence->'captured_inventory_matches_current','as_of',evidence->'as_of',
  'availability',availability,'lines',sorted_lines,'unavailable_source_count',unavailable,
  'source_coverage','unavailable','credit_eligible',false);
 if octet_length(reply::text)>262144 then raise exception 'scope_invoice_line_admin_size_limit' using errcode='54000';end if;
 return reply;
end;$$;
revoke all on function operations_economy_private.read_scope_invoice_lines_admin_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_scope_invoice_lines_admin_v1(jsonb) to authenticated;

create function public.read_operations_scope_invoice_lines_admin_v1(p_request jsonb)
returns jsonb language sql security invoker set search_path=''
as $$select operations_economy_private.read_scope_invoice_lines_admin_v1(p_request);$$;
revoke all on function public.read_operations_scope_invoice_lines_admin_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_scope_invoice_lines_admin_v1(jsonb) to authenticated;
