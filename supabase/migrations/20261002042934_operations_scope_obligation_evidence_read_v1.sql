-- Read-only, partial manual authority evidence. No EAC or budget activation.
create function operations_economy_private.read_scope_obligation_evidence_v1(p_org uuid,p_kind text,p_root uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;scope public.operations_project_scope_heads%rowtype;saved public.operations_scope_obligation_compositions%rowtype;
 proof jsonb;doc jsonb;baselines jsonb:='[]';sources jsonb:='[]';result jsonb;row jsonb;head bigint;begin
 org:=operations_economy_private.authorize_scope_admin_v1();
 if p_org is distinct from org or p_root is null or p_kind is null or p_kind not in ('project','large_project','packing_project') then raise exception 'scope_evidence_selector_denied' using errcode='42501';end if;
 -- Same order as actual baseline/binding/policy/composition writers.
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 if p_kind='project' then perform 1 from public.projects where id=p_root and organization_id=org and deleted_at is null for share;
 elsif p_kind='large_project' then perform 1 from public.large_projects where id=p_root and organization_id=org and deleted_at is null for share;
 else perform 1 from public.packing_projects where id=p_root and organization_id=org for share;end if;
 if not found then raise exception 'scope_evidence_root_denied' using errcode='42501';end if;
 if p_kind='packing_project' then
  perform 1 from public.operations_project_scope_packing_policies policy join public.packing_projects packing on packing.id=p_root and packing.organization_id=org and packing.status=policy.status where policy.organization_id=org and policy.enabled for share of policy;
  if not found then raise exception 'scope_evidence_packing_denied' using errcode='42501';end if;
 end if;
 select * into scope from public.operations_project_scope_heads where organization_id=org and root_kind=p_kind and root_id=p_root for share;
 result:=jsonb_build_object('schema','operations-scope-obligation-evidence.v1','organizationId',org,'rootKind',p_kind,'rootId',p_root,'generatedAt',clock_timestamp(),
 'state',case when scope.economic_scope_id is null then 'no_scope' else 'no_evidence' end,'economicScopeId',scope.economic_scope_id,'scopeRevision',null,'currentScopeRevision',scope.current_revision,
 'membershipFingerprint',null,'compositionRevision',null,'snapshotId',null,'snapshotFingerprint',null,'publishedAt',null,'currency',null,
 'referenceCurrentness',jsonb_build_object('membership',null,'baselines',null,'sources',null),'authorityScope','canonical_scope_composition','pricingBasis','operations_manual_composition',
 'sourceCurrentness','receiver_v1_only','upstreamCurrentness','unverified','coverage','unavailable','categoryCoverage',jsonb_build_object('personnel','unavailable','supplier','unavailable','catering','unavailable','other','unavailable'),
 'knownEstimateMinor',null,'knownCommitmentMinor',null,'allSelectedEstimatesKnown',false,'allSelectedCommitmentsKnown',false,'eacMinor',null,'budgetMinor',null,'marginMinor',null,'shadowOnly',true,'baselines','[]'::jsonb,'sources','[]'::jsonb);
 if scope.economic_scope_id is null then return result;end if;
 select current_revision into head from public.operations_scope_obligation_composition_heads where organization_id=org and economic_scope_id=scope.economic_scope_id for share;
 if not found then
  -- Actual graph/root authorization still applies without a saved composition.
  perform operations_economy_private.scope_membership_v1(org,p_kind,p_root);return result;
 end if;
 select * into saved from public.operations_scope_obligation_compositions where organization_id=org and economic_scope_id=scope.economic_scope_id and composition_revision=head;
 if not found then raise exception 'scope_evidence_saved_capture_missing' using errcode='22023';end if;
 doc:=saved.document;
 if jsonb_typeof(doc->'baseline_events') is distinct from 'array' or jsonb_typeof(doc->'source_inventory') is distinct from 'array' then raise exception 'scope_evidence_saved_catalog_invalid' using errcode='22023';end if;
 if jsonb_array_length(doc->'baseline_events')>1000 or jsonb_array_length(doc->'source_inventory')>200 then raise exception 'scope_evidence_requires_pagination' using errcode='54000';end if;
 if doc->>'schema_version' is distinct from 'operations-scope-obligation-composition.v1' or doc->>'organization_id' is distinct from org::text
 or doc->>'economic_scope_id' is distinct from scope.economic_scope_id::text or doc->>'scope_revision' is distinct from saved.scope_revision::text
 or doc->>'composition_revision' is distinct from saved.composition_revision::text or doc->>'membership_fingerprint' is distinct from saved.membership_fingerprint
 or doc->>'currency' is distinct from saved.currency or doc->>'coverage' is distinct from 'unavailable' or doc->'eac_minor' is distinct from 'null'::jsonb or doc->'budget_minor' is distinct from 'null'::jsonb
 or encode(sha256(convert_to(operations_economy_private.canonical_json_v1(doc),'UTF8')),'hex') is distinct from saved.fingerprint then raise exception 'scope_evidence_saved_provenance_invalid' using errcode='22023';end if;
 proof:=operations_economy_private.read_scope_composition_v1(org,scope.economic_scope_id);
 if proof->>'snapshot_id' is distinct from saved.snapshot_id::text or proof->>'fingerprint' is distinct from saved.fingerprint or proof->'document' is distinct from doc then raise exception 'scope_evidence_capture_changed' using errcode='40001';end if;
 for row in select value from jsonb_array_elements(doc->'baseline_events') loop
  baselines:=baselines||jsonb_build_array(jsonb_build_object('baselineEventId',row->'baseline_event_id','projectId',row->'project_id','obligationId',row->'obligation_id','baselineRevision',row->'baseline_revision','baselineFingerprint',row->'baseline_fingerprint','evidenceBasis',row->'evidence_basis','authorityScope','local_project_only','category',row->'category','currency',row->'currency','costBasis',row->'cost_basis','estimateMinor',row->'estimate_minor','committedMinor',row->'committed_minor'));
 end loop;
 for row in select value from jsonb_array_elements(doc->'source_inventory') loop
  sources:=sources||jsonb_build_array(jsonb_build_object('sourceAnchor',row->'source_anchor','projectId',row->'project_id','obligationId',row->'obligation_id','baselineEventId',row->'baseline_event_id','bindingEventId',row->'binding_event_id','sourceSnapshotId',row->'source_snapshot_id','sourceEconomicRevision',row->'source_economic_revision','sourceEconomicFingerprint',row->'source_economic_fingerprint','observedAmountMinor',row->'observed_amount_minor','observedStatus',row->'observed_status','sourceBindingState',row->'source_binding_state','sourcePolicyState',row->'source_policy_state','policyEventId',coalesce(row->'policy_event_id','null'::jsonb),'policyRevision',coalesce(row->'policy_revision','null'::jsonb)));
 end loop;
 return result||jsonb_build_object('state','evidence','scopeRevision',saved.scope_revision,'membershipFingerprint',saved.membership_fingerprint,'compositionRevision',saved.composition_revision,'snapshotId',saved.snapshot_id,'snapshotFingerprint',saved.fingerprint,'publishedAt',saved.created_at,'currency',saved.currency,
 'referenceCurrentness',jsonb_build_object('membership',proof->'scope_membership_current','baselines',proof->'baseline_references_current','sources',proof->'source_references_current'),
 'knownEstimateMinor',doc->'known_estimate_minor','knownCommitmentMinor',doc->'known_commitment_minor','allSelectedEstimatesKnown',doc->'all_selected_estimates_known','allSelectedCommitmentsKnown',doc->'all_selected_commitments_known','baselines',baselines,'sources',sources);
end;$$;
revoke all on function operations_economy_private.read_scope_obligation_evidence_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_scope_obligation_evidence_v1(uuid,text,uuid) to authenticated;
create function public.read_operations_scope_obligation_evidence_v1(p_organization_id uuid,p_root_kind text,p_root_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_scope_obligation_evidence_v1(p_organization_id,p_root_kind,p_root_id);$$;
revoke all on function public.read_operations_scope_obligation_evidence_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_scope_obligation_evidence_v1(uuid,text,uuid) to authenticated;
