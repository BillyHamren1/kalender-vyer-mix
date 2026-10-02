-- Authenticated validating copy only; existing kernel/service readers and gates unchanged.
create function operations_economy_private.read_scope_obligation_drilldown_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; kind text; root uuid; key text; scope public.operations_project_scope_heads%rowtype;
 saved public.operations_scope_obligation_compositions%rowtype; captured jsonb; membership jsonb; proof jsonb;
 baseline public.operations_project_obligation_baselines%rowtype; current_baseline public.operations_project_obligation_baselines%rowtype;
 current_revision bigint; selectors jsonb; source jsonb; evidence jsonb; sources jsonb:='[]'; reply jsonb; state text;
 diagnostics jsonb:='["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable"]';
begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>6
 or not(p ?& array['schema_version','root_kind','root_id','obligation_id','expected_composition_snapshot_id','expected_baseline_event_id'])
 or p->>'schema_version' is distinct from 'operations-scope-obligation-drilldown-read.v1'
 or jsonb_typeof(p->'root_kind') is distinct from 'string' or p->>'root_kind' not in ('project','large_project','packing_project')
 then raise exception 'exact_scope_obligation_drilldown_request_required' using errcode='22023';end if;
 foreach key in array array['root_id','obligation_id','expected_composition_snapshot_id','expected_baseline_event_id'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'invalid_scope_obligation_drilldown_identity' using errcode='22023';end if;end loop;
 org:=operations_economy_private.authorize_scope_admin_v1();kind:=p->>'root_kind';root:=(p->>'root_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share;
 if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;
 -- This actual root/catalog authorizer does not acquire invoice protocol-head locks.
 membership:=operations_economy_private.scope_membership_v1(org,kind,root);
 select * into scope from public.operations_project_scope_heads where organization_id=org and root_kind=kind and root_id=root for share;
 if not found then raise exception 'displayed_scope_capture_changed' using errcode='PT409';end if;
 select c.* into saved from public.operations_scope_obligation_composition_heads h
 join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision
 where h.organization_id=org and h.economic_scope_id=scope.economic_scope_id for share of h;
 if not found or saved.snapshot_id is distinct from (p->>'expected_composition_snapshot_id')::uuid
 or saved.scope_revision is distinct from scope.current_revision
 or saved.membership_fingerprint is distinct from encode(sha256(convert_to(operations_economy_private.canonical_json_v1(membership),'UTF8')),'hex')
 then raise exception 'displayed_scope_capture_changed' using errcode='PT409';end if;
 if jsonb_typeof(saved.document->'baseline_events') is distinct from 'array' or jsonb_array_length(saved.document->'baseline_events')>1000
 or jsonb_typeof(saved.document->'source_inventory') is distinct from 'array' or jsonb_array_length(saved.document->'source_inventory')>200
 then raise exception 'scope_drilldown_requires_pagination' using errcode='54000';end if;
 if (select count(*) from jsonb_array_elements(saved.document->'baseline_events') b where b->>'obligation_id'=(p->>'obligation_id')::uuid::text
 and b->>'baseline_event_id'=(p->>'expected_baseline_event_id')::uuid::text)<>1 then
 raise exception 'displayed_obligation_capture_changed' using errcode='PT409';end if;
 select b into captured from jsonb_array_elements(saved.document->'baseline_events') b
 where b->>'obligation_id'=(p->>'obligation_id')::uuid::text and b->>'baseline_event_id'=(p->>'expected_baseline_event_id')::uuid::text;
 if operations_economy_private.authorize_obligation_admin_v1((captured->>'project_id')::uuid) is distinct from org then
 raise exception 'obligation_project_access_denied' using errcode='42501';end if;
 select * into baseline from public.operations_project_obligation_baselines
 where organization_id=org and project_id=(captured->>'project_id')::uuid and obligation_id=(p->>'obligation_id')::uuid
 and event_id=(p->>'expected_baseline_event_id')::uuid;
 if not found or baseline.fingerprint is distinct from captured->>'baseline_fingerprint' or baseline.revision::text is distinct from captured->>'baseline_revision'
 then raise exception 'saved_obligation_capture_invalid' using errcode='22023';end if;
 if (select count(*) from (select distinct source_anchor from public.operations_project_obligation_invoice_bindings
 where organization_id=org and project_id=baseline.project_id and obligation_id=baseline.obligation_id limit 201) bounded)>200
 then raise exception 'scope_drilldown_requires_pagination' using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('source_organization_id',x.source_organization_id,'invoice_id',x.invoice_id)),'[]') into selectors
 from (select distinct latest.source_organization_id,latest.invoice_id from
 (select distinct on(source_anchor) source_organization_id,invoice_id from public.operations_project_obligation_invoice_bindings
 where organization_id=org and ((project_id=baseline.project_id and obligation_id=baseline.obligation_id)
 or source_anchor in (select s->>'source_anchor' from jsonb_array_elements(saved.document->'source_inventory') s))
 order by source_anchor,binding_sequence desc) latest) x;
 if jsonb_array_length(selectors)>100 then raise exception 'scope_drilldown_requires_pagination' using errcode='54000';end if;
 -- Include ALL captured scope source anchors because its unchanged reader also
 -- checks other obligations; no invoice head may precede its own barrier.
 -- All invoice barriers precede unchanged scope/original readers' head row locks.
 if jsonb_array_length(selectors)>0 then perform operations_invoice_private.lock_invoice_economic_sources_v1(org,selectors);end if;
 proof:=operations_economy_private.read_scope_obligation_evidence_v1(org,kind,root);
 if proof->>'snapshotId' is distinct from saved.snapshot_id::text or proof#>'{referenceCurrentness,membership}' is distinct from 'true'::jsonb then
 raise exception 'displayed_scope_capture_changed' using errcode='PT409';end if;
 select h.current_revision into current_revision from public.operations_project_obligation_heads h
 where h.organization_id=org and h.project_id=baseline.project_id and h.obligation_id=baseline.obligation_id for share;
 select * into current_baseline from public.operations_project_obligation_baselines
 where organization_id=org and project_id=baseline.project_id and obligation_id=baseline.obligation_id and revision=current_revision;
 if not found then raise exception 'actual_obligation_head_required' using errcode='PT409';end if;
 if current_baseline.event_id is distinct from baseline.event_id then state:='baseline_changed';diagnostics:=diagnostics||'"changed_baseline"'::jsonb;
 else
 evidence:=operations_economy_private.read_invoice_obligation_kernel_v1(jsonb_build_object('schema_version','operations-invoice-obligation-kernel-read.v1','organization_id',org,'project_id',baseline.project_id,'obligation_id',baseline.obligation_id));
 if evidence#>>'{baseline,event_id}' is distinct from baseline.event_id::text or evidence#>>'{baseline,fingerprint}' is distinct from baseline.fingerprint then
 raise exception 'actual_obligation_head_changed' using errcode='PT409';end if;
 state:=case when evidence->>'state'='unsupported_basis' then 'unsupported_basis' else 'received_evidence' end;
 diagnostics:=evidence->'diagnostics';
 for source in select value from jsonb_array_elements(evidence->'sources') loop
 if source->>'reason' is not null and source->>'reason' not in ('changed_baseline','changed_invoice_economics','saved_source_provenance_unavailable','positive_original_unavailable','missing_source_binding','missing_invoice_obligation','unified_current_economics_unavailable')
 then raise exception 'unknown_saved_source_diagnostic' using errcode='22023';end if;
 sources:=sources||jsonb_build_array(jsonb_build_object(
 'sourceKey',encode(sha256(convert_to(source->>'source_anchor','UTF8')),'hex'),'bindingEventId',source->'binding_event_id',
 'sourceSnapshotId',source->'source_snapshot_id','sourceEconomicRevision',source->'source_economic_revision',
 'status',case when source->'resolved'='true'::jsonb then source->'status' else 'null'::jsonb end,
 'amountMinor',case when source->'resolved'='true'::jsonb then source->'amount_minor' else 'null'::jsonb end,
 'bindingState',case when source->'resolved'='true'::jsonb then 'resolved' else 'unresolved' end,
 'policyState',source->'policy_state','policyEventId',source->'policy_event_id','policyRevision',source->'policy_revision',
 'replacesEstimateMinor',case when source->>'policy_state'='current' then source->'replaces_estimate_minor' else 'null'::jsonb end,
 'consumesCommitmentMinor',case when source->>'policy_state'='current' then source->'consumes_commitment_minor' else 'null'::jsonb end,
 'reason',source->'reason'));
 end loop;
 end if;
 reply:=jsonb_build_object('schema','operations-scope-obligation-drilldown.v1','organizationId',org,'rootKind',kind,'rootId',root,
 'economicScopeId',scope.economic_scope_id,'scopeRevision',saved.scope_revision,'compositionRevision',saved.composition_revision,
 'compositionSnapshotId',saved.snapshot_id,'compositionFingerprint',saved.fingerprint,'obligationProjectId',baseline.project_id,'obligationId',baseline.obligation_id,
 'asOf',clock_timestamp(),'state',state,'referenceCurrentness',jsonb_build_object('composition',true,'membership',true,'baseline',current_baseline.event_id=baseline.event_id),
 'baseline',jsonb_build_object('eventId',baseline.event_id,'revision',baseline.revision,'fingerprint',baseline.fingerprint,'evidenceBasis',baseline.evidence_basis,
 'currency',baseline.currency,'category',baseline.category,'costBasis',baseline.cost_basis,'estimateMinor',baseline.estimate_minor,'committedMinor',baseline.committed_minor),
 'sourceCurrentness','saved_receiver_heads_only','upstreamCurrentness','unverified',
 'coverage',jsonb_build_object('total','unavailable','source','unavailable','personnel','unavailable','supplier','unavailable','catering','unavailable','other','unavailable','credit','unavailable'),
 'prognosis',jsonb_build_object('remainingMinor',null,'eacMinor',null,'budgetMinor',null,'marginMinor',null),
 'sources',sources,'diagnostics',diagnostics,'shadowOnly',true);
 if octet_length(reply::text)>262144 then raise exception 'scope_drilldown_requires_pagination' using errcode='54000';end if;
 return reply;
end;$$;
revoke all on function operations_economy_private.read_scope_obligation_drilldown_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_scope_obligation_drilldown_v1(jsonb) to authenticated;
create function public.read_operations_scope_obligation_drilldown_v1(p_request jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_scope_obligation_drilldown_v1(p_request);$$;
revoke all on function public.read_operations_scope_obligation_drilldown_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_scope_obligation_drilldown_v1(jsonb) to authenticated;
