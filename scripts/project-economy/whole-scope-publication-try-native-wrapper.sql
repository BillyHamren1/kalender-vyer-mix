-- TEST ONLY additive entry; load unchanged calculator + frozen native publisher
-- first in this SAME guarded disposable session. No public product RPC.
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres'
 or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('operations_scope_publication_try_native.controls') is null
 or to_regprocedure('pg_temp.publish_scope_native(jsonb)') is null
 then raise exception 'trusted_try_publication_session_required' using errcode='22023';end if;
end;$$;
create function pg_temp.publish_scope_native_try_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare
 actor uuid:=auth.uid();org uuid;scope_id uuid;key text;v_root_kind text;v_root_id uuid;pause text;packing_status text;
 hint public.operations_scope_obligation_compositions%rowtype;
 membership public.operations_project_scope_snapshots%rowtype;
 baseline_ids uuid[];projects uuid[];obligations uuid[];selectors jsonb;inventory_before jsonb;inventory_after jsonb;
 project uuid;source record;head record;identity text;current_comp uuid;receipt jsonb;
begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' then raise exception 'trusted_try_publication_session_required' using errcode='42501';end if;
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>9
 or not(p ?& array['schema_version','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','expected_composition_fingerprint','expected_publication_revision','idempotency_key','reason'])
 or jsonb_typeof(p->'schema_version') is distinct from 'string' or p->>'schema_version' is distinct from 'operations-scope-publication-native.v1'
 then raise exception 'exact_native_publication_command_required' using errcode='22023';end if;
 if jsonb_typeof(p->'economic_scope_id') is distinct from 'string' or p->>'economic_scope_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'invalid_native_publication_identity' using errcode='22023';end if;
 foreach key in array array['expected_scope_revision','expected_composition_revision','expected_publication_revision'] loop
 if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric)
 or (p->>key)::numeric not between (case when key='expected_publication_revision' then 0 else 1 end) and (case when key='expected_publication_revision' then 9007199254740990 else 9007199254740991 end)
 then raise exception 'invalid_native_publication_revision' using errcode='22023';end if;end loop;
 foreach key in array array['expected_membership_fingerprint','expected_composition_fingerprint'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~ '^[0-9a-f]{64}$' then raise exception 'invalid_native_publication_fingerprint' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'idempotency_key',200) or length(p->>'idempotency_key')<12
 or jsonb_typeof(p->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'reason',1000) or length(p->>'reason')<3
 then raise exception 'invalid_native_publication_audit' using errcode='22023';end if;
 -- Actual live actor/org authorization BEFORE private immutable hints.
 begin
 if actor is null then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 perform 1 from auth.users where id=actor for share nowait;
 if not found then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 begin select organization_id into strict org from public.profiles where user_id=actor for share nowait;
 exception when no_data_found or too_many_rows then raise exception 'unambiguous_scope_admin_profile_required' using errcode='42501';end;
 if org is null then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 perform 1 from public.user_roles where user_id=actor and organization_id=org and role='admin' for share nowait;
 if not found then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 exception when lock_not_available then raise exception 'native_try_publication_lock_busy' using errcode='55P03';end;
 scope_id:=(p->>'economic_scope_id')::uuid;
 begin
 perform 1 from operations_scope_publication_native.gates where organization_id=org and economic_scope_id=scope_id and enabled and not fault_after_publication and not pause_after_barriers for share nowait;
 if not found then raise exception 'native_publication_gate_disabled' using errcode='42501';end if;
 exception when lock_not_available then raise exception 'native_try_publication_lock_busy' using errcode='55P03';end;
 -- Disabled native authority denies before any private discovery hint.
 select * into hint from public.operations_scope_obligation_compositions
 where organization_id=org and economic_scope_id=scope_id and composition_revision=(p->>'expected_composition_revision')::bigint
 and fingerprint=p->>'expected_composition_fingerprint';
 if not found then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 select * into membership from public.operations_project_scope_snapshots
 where snapshot_id=hint.scope_snapshot_id and organization_id=org and economic_scope_id=scope_id
 and scope_revision=(p->>'expected_scope_revision')::bigint and membership_fingerprint=p->>'expected_membership_fingerprint';
 if not found then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 if jsonb_typeof(membership.membership->'root_kind') is distinct from 'string' or jsonb_typeof(membership.membership->'root_id') is distinct from 'string' or membership.membership->>'root_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'native_publication_source_proof_mismatch' using errcode='22023';end if;
 v_root_kind:=membership.membership->>'root_kind';v_root_id:=(membership.membership->>'root_id')::uuid;
 if v_root_kind not in ('project','large_project','packing_project') or v_root_kind is null or v_root_id is null
 then raise exception 'native_publication_source_proof_mismatch' using errcode='22023';end if;
 if jsonb_typeof(hint.document->'baseline_events') is distinct from 'array' or jsonb_array_length(hint.document->'baseline_events')>1000
 then raise exception 'scope_invoice_member_limit' using errcode='22023';end if;
 select coalesce(array_agg(baseline_event_id order by baseline_event_id),array[]::uuid[]) into baseline_ids
 from public.operations_scope_obligation_baseline_captures where composition_snapshot_id=hint.snapshot_id;
 if cardinality(baseline_ids)<>jsonb_array_length(hint.document->'baseline_events') then raise exception 'scope_invoice_baseline_capture_mismatch' using errcode='22023';end if;
 select coalesce(array_agg(obligation_id order by obligation_id),array[]::uuid[]) into obligations
 from public.operations_project_obligation_baselines where event_id=any(baseline_ids) and organization_id=org;
 if cardinality(obligations)<>cardinality(baseline_ids) or cardinality(obligations)<>(select count(distinct x) from unnest(obligations)x)
 then raise exception 'scope_invoice_duplicate_or_foreign_obligation' using errcode='22023';end if;
 select coalesce(array_agg(project_id order by project_id),array[]::uuid[]) into projects from
 (select distinct project_id from public.operations_project_obligation_baselines where event_id=any(baseline_ids) and organization_id=org
 union select v_root_id where v_root_kind='project') x;
 -- NEVER block acquiring advisory keys while retaining earlier row/key locks.
 if not pg_try_advisory_xact_lock(hashtextextended('obligation-org:'||org,0))
 then raise exception 'native_try_publication_lock_busy' using errcode='55P03';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org,0))
 then raise exception 'native_try_publication_lock_busy' using errcode='55P03';end if;
 select pause_stage into strict pause from operations_scope_publication_try_native.controls where slot='only';
 if pause='after_barriers' then perform pg_sleep(4);end if;
 begin
 -- Exact existing live row identities, SAME SHARE mode as frozen readers.
 -- An acquired incompatible row lock refuses immediately. Compatible SHARE
 -- may join existing SHARE even when an UPDATE is queued; the held barriers
 -- still protect the exact saved as-of evidence until this transaction ends.
 perform 1 from operations_scope_publication_native.gates where organization_id=org and economic_scope_id=scope_id
 and enabled and not fault_after_publication and not pause_after_barriers for share nowait;
 if not found then raise exception 'native_publication_gate_disabled' using errcode='42501';end if;
 foreach project in array projects loop
 perform 1 from public.projects where organization_id=org and id=project and deleted_at is null for share nowait;
 if not found then raise exception 'obligation_project_access_denied' using errcode='42501';end if;end loop;
 if v_root_kind='large_project' then
 perform 1 from public.large_projects where organization_id=org and id=v_root_id and deleted_at is null for share nowait;
 if not found then raise exception 'scope_root_missing_or_foreign' using errcode='42501';end if;
 elsif v_root_kind='packing_project' then
 select status into packing_status from public.packing_projects where organization_id=org and id=v_root_id for share nowait;
 if not found then raise exception 'scope_root_missing_or_foreign' using errcode='42501';end if;
 if jsonb_typeof(membership.membership#>'{root_evidence,status}') is distinct from 'string' or packing_status is distinct from membership.membership#>>'{root_evidence,status}'
 then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 -- Never discover/lock a new status-policy identity after the hint is held.
 perform 1 from public.operations_project_scope_packing_policies where organization_id=org and status=packing_status and enabled for share nowait;
 if not found then raise exception 'scope_packing_missing_or_unenrolled' using errcode='42501';end if;end if;
 perform 1 from public.operations_scope_invoice_kernel_read_gates where organization_id=org and enabled for share nowait;
 if not found then raise exception 'scope_invoice_read_gate_disabled' using errcode='42501';end if;
 perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share nowait;
 if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;
 -- Old cores may lock these only AFTER global invoice keys. Delay all heads.
 exception when lock_not_available then raise exception 'native_try_publication_lock_busy' using errcode='55P03';end;
 if (select count(distinct source_anchor) from public.operations_project_obligation_invoice_bindings where organization_id=org and obligation_id=any(obligations))>10000
 then raise exception 'scope_invoice_global_anchor_limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.source_anchor collate "C"),'[]'::jsonb) into inventory_before from
 (select distinct on(source_anchor collate "C") * from public.operations_project_obligation_invoice_bindings
 where organization_id=org and obligation_id=any(obligations) order by source_anchor collate "C",binding_sequence desc) x;
 select coalesce(jsonb_agg(jsonb_build_object('source_organization_id',x.source_org,'invoice_id',x.invoice_id) order by x.source_org,x.invoice_id),'[]'::jsonb) into selectors from
 (select distinct (value->>'source_organization_id')::uuid source_org,(value->>'invoice_id')::uuid invoice_id from jsonb_array_elements(inventory_before)) x;
 if jsonb_array_length(selectors)>100 then raise exception 'scope_invoice_global_selector_limit' using errcode='22023';end if;
 for identity in select k from (select distinct 'invoice-economic-source-v1:'||org::text||':'||(value->>'source_organization_id')::uuid::text||':'||(value->>'invoice_id')::uuid::text k from jsonb_array_elements(selectors)) x order by k collate "C" loop
 if not pg_try_advisory_xact_lock(hashtextextended(identity,0)) then raise exception 'native_try_publication_lock_busy' using errcode='55P03';end if;end loop;
 begin
 perform 1 from public.operations_project_scope_heads h where h.organization_id=org and h.economic_scope_id=scope_id
 and h.root_kind=v_root_kind and h.root_id=v_root_id and current_revision=membership.scope_revision for share nowait;
 if not found then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 select c.snapshot_id into current_comp from public.operations_scope_obligation_composition_heads h
 join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision
 where h.organization_id=org and h.economic_scope_id=scope_id for share of h nowait;
 if not found or current_comp is distinct from hint.snapshot_id then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 for head in select b.* from public.operations_project_obligation_baselines b where b.organization_id=org and b.event_id=any(baseline_ids) order by b.obligation_id loop
 perform 1 from public.operations_project_obligation_heads where organization_id=org and obligation_id=head.obligation_id
 and project_id=head.project_id and current_revision=head.revision for share nowait;
 if not found then raise exception 'native_publication_source_changed' using errcode='PT409';end if;end loop;
 for source in select * from jsonb_array_elements(selectors) loop
 perform 1 from public.operations_finance_invoice_streams where organization_id=org and source_organization_id=(source.value->>'source_organization_id')::uuid
 and invoice_id=(source.value->>'invoice_id')::uuid for share nowait;
 perform 1 from public.operations_finance_credit_v2_streams where organization_id=org and source_organization_id=(source.value->>'source_organization_id')::uuid
 and invoice_id=(source.value->>'invoice_id')::uuid for share nowait;
 end loop;
 for head in select * from public.operations_obligation_source_policy_heads where organization_id=org and obligation_id=any(obligations) order by obligation_id,source_anchor collate "C" loop
 perform 1 from public.operations_obligation_source_policy_heads where organization_id=org and obligation_id=head.obligation_id and source_anchor=head.source_anchor
 and current_revision=head.current_revision for share nowait;
 if not found then raise exception 'native_publication_source_changed' using errcode='PT409';end if;end loop;
 perform 1 from operations_scope_publication_native.heads where organization_id=org and economic_scope_id=scope_id for update nowait;
 exception when lock_not_available then raise exception 'native_try_publication_lock_busy' using errcode='55P03';end;
 -- Complete source selectors are stable under org; all current protocol heads
 -- are protected by the exact TRY keys, including an absent counterpart.
 select coalesce(jsonb_agg(to_jsonb(x) order by x.source_anchor collate "C"),'[]'::jsonb) into inventory_after from
 (select distinct on(source_anchor collate "C") * from public.operations_project_obligation_invoice_bindings
 where organization_id=org and obligation_id=any(obligations) order by source_anchor collate "C",binding_sequence desc) x;
 if inventory_after is distinct from inventory_before then raise exception 'native_publication_source_changed' using errcode='PT409';end if;
 -- ONLY frozen trusted reader/calculator/publisher. Every lock it requests is
 -- reentrant and already owned in the same/stronger mode on a known identity.
 receipt:=pg_temp.publish_scope_native(p);
 return receipt;
end;$$;
revoke all on function pg_temp.publish_scope_native_try_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function pg_temp.publish_scope_native_try_v1(jsonb) to authenticated;
