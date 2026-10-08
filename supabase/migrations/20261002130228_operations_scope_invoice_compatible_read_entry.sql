-- Restricted read-only compatibility. No pricing, writes, source admission or gate activation.
-- The other six audited public reader families retain separate compatibility gates.
-- Existing frozen cores are called only after their mutable dependency rows/keys are held.
do $$begin
 -- Installed static caller/owner closure, not a claim about dynamic SQL dispatch.
 -- Test-only pg_temp publisher functions must be removed before this preflight.
 if exists(select 1 from pg_proc p where p.oid=any(array[
 'operations_economy_private.read_scope_invoice_kernel_v1(jsonb)'::regprocedure::oid,
 'operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)'::regprocedure::oid,
 'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure::oid,
 'public.read_operations_scope_invoice_capture_admin_v1(jsonb)'::regprocedure::oid])
 and (p.proowner<>(select oid from pg_roles where rolname=current_user)
 or p.proconfig is distinct from array['search_path=""']::text[]
 or p.prosecdef is distinct from (p.oid=any(array[
 'operations_economy_private.read_scope_invoice_kernel_v1(jsonb)'::regprocedure::oid,
 'operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)'::regprocedure::oid]))))
 then raise exception 'installed_scope_reader_owner_security_required' using errcode='55000';end if;
 if exists(select 1 from pg_proc p where
 (p.prosrc~'read_scope_invoice_kernel_v1[[:space:]]*\(' or p.prosrc~'read_scope_invoice_capture_admin_v1[[:space:]]*\(')
 and p.oid<>all(array[
 'operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)'::regprocedure::oid,
 'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure::oid,
 'public.read_operations_scope_invoice_capture_admin_v1(jsonb)'::regprocedure::oid]))
 then raise exception 'installed_scope_reader_static_caller_closure_required' using errcode='55000';end if;
 if not exists(select 1 from pg_index i where i.indrelid='public.profiles'::regclass and i.indisunique and i.indisvalid and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and i.indkey[0]=(select attnum from pg_attribute where attrelid=i.indrelid and attname='user_id'))
 or not exists(select 1 from pg_index i where i.indexrelid='public.user_roles_user_role_org_key'::regclass and i.indrelid='public.user_roles'::regclass and i.indisunique and i.indisvalid and i.indpred is null and i.indexprs is null and i.indnkeyatts=3 and (select array_agg(a.attname::text order by x.ordinality) from unnest(i.indkey) with ordinality x(attnum,ordinality) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=x.attnum)=array['user_id','role','organization_id'])
 or not exists(select 1 from pg_constraint c where c.conrelid='public.user_roles'::regclass and c.confrelid='auth.users'::regclass and c.contype='f' and c.confdeltype='c' and c.convalidated and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='user_id')]::smallint[] and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')]::smallint[])
 then raise exception 'installed_scope_reader_authorization_constraints_required' using errcode='55000';end if;
 if not has_function_privilege('authenticated','public.read_operations_scope_invoice_capture_admin_v1(jsonb)','EXECUTE')
 or has_function_privilege('service_role','public.read_operations_scope_invoice_capture_admin_v1(jsonb)','EXECUTE')
 or not has_function_privilege('service_role','public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)','EXECUTE')
 then raise exception 'existing_scope_reader_public_roles_required' using errcode='55000';end if;
end;$$;
create function operations_economy_private.authorize_scope_read_nowait_v1() returns uuid
language plpgsql security definer set search_path='' as $$declare actor uuid:=auth.uid();org uuid;begin
 if actor is null then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 begin
 perform 1 from auth.users where id=actor for share nowait;
 if not found then raise exception 'authenticated_scope_admin_required' using errcode='42501';end if;
 begin select organization_id into strict org from public.profiles where user_id=actor for share nowait;
 exception when no_data_found or too_many_rows then raise exception 'unambiguous_scope_admin_profile_required' using errcode='42501';end;
 if org is null then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 perform 1 from public.user_roles where user_id=actor and organization_id=org and role='admin' for share nowait;
 if not found then raise exception 'organization_scope_admin_required' using errcode='42501';end if;
 exception when lock_not_available then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end;
 return org;
end;$$;
revoke all on function operations_economy_private.authorize_scope_read_nowait_v1() from public,anon,authenticated,service_role;
create function operations_economy_private.lock_scope_read_root_nowait_v1(p_org uuid,p_kind text,p_root uuid) returns void
language plpgsql security definer set search_path='' as $$declare v_status text;begin
 if p_org is null or p_root is null or p_kind is null or p_kind not in ('project','large_project','packing_project') then raise exception 'invalid_scope_root' using errcode='22023';end if;
 begin
 if p_kind='project' then perform 1 from public.projects where id=p_root and organization_id=p_org and deleted_at is null for share nowait;
 elsif p_kind='large_project' then perform 1 from public.large_projects where id=p_root and organization_id=p_org and deleted_at is null for share nowait;
 else select p.status into v_status from public.packing_projects p where id=p_root and organization_id=p_org for share nowait;end if;
 if not found then raise exception 'scope_root_missing_or_foreign' using errcode='42501';end if;
 if p_kind='packing_project' then
 perform 1 from public.operations_project_scope_packing_policies where organization_id=p_org and status=v_status and enabled for share nowait;
 if not found then raise exception 'scope_packing_missing_or_unenrolled' using errcode='42501';end if;
 end if;
 exception when lock_not_available then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end;
end;$$;
revoke all on function operations_economy_private.lock_scope_read_root_nowait_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
create function operations_economy_private.prepare_scope_invoice_read_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare
 org uuid;scope_id uuid;k text;scope public.operations_project_scope_heads%rowtype;membership public.operations_project_scope_snapshots%rowtype;
 composition public.operations_scope_obligation_compositions%rowtype;ids uuid[];obligations uuid[];projects uuid[];project uuid;b public.operations_project_obligation_baselines%rowtype;
 selectors jsonb;bindings_before jsonb;bindings_after jsonb;graph jsonb;source jsonb;identity text;head bigint;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>7 or not(p ?& array['schema_version','organization_id','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','expected_composition_fingerprint']) or p->>'schema_version' is distinct from 'operations-scope-invoice-kernel-read.v1' then raise exception 'exact_scope_invoice_request_required' using errcode='22023';end if;
 foreach k in array array['organization_id','economic_scope_id'] loop if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_scope_invoice_identity' using errcode='22023';end if;end loop;
 foreach k in array array['expected_scope_revision','expected_composition_revision'] loop if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric<>trunc((p->>k)::numeric) or (p->>k)::numeric not between 1 and 9007199254740991 then raise exception 'invalid_scope_invoice_revision' using errcode='22023';end if;end loop;
 foreach k in array array['expected_membership_fingerprint','expected_composition_fingerprint'] loop if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^[0-9a-f]{64}$' then raise exception 'invalid_scope_invoice_fingerprint' using errcode='22023';end if;end loop;
 org:=(p->>'organization_id')::uuid;scope_id:=(p->>'economic_scope_id')::uuid;
 begin
 perform 1 from public.operations_scope_invoice_kernel_read_gates where organization_id=org and enabled for share nowait;
 if not found then raise exception 'scope_invoice_read_gate_disabled' using errcode='42501';end if;
 exception when lock_not_available then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end;
 if not pg_try_advisory_xact_lock(hashtextextended('obligation-org:'||org,0)) or not pg_try_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org,0)) then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end if;
 -- Service preserves composition-first validation. These immutable hints are not authorization.
 select c.* into composition from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision where h.organization_id=org and h.economic_scope_id=scope_id;
 if not found or composition.composition_revision<>(p->>'expected_composition_revision')::bigint or composition.fingerprint<>p->>'expected_composition_fingerprint' then raise exception 'current_scope_invoice_composition_required' using errcode='22023';end if;
 if jsonb_typeof(composition.document->'baseline_events') is distinct from 'array' or jsonb_array_length(composition.document->'baseline_events')>1000 then raise exception 'scope_invoice_member_limit' using errcode='22023';end if;
 select coalesce(array_agg(c.baseline_event_id order by c.baseline_event_id),'{}'::uuid[]) into ids from public.operations_scope_obligation_baseline_captures c where c.composition_snapshot_id=composition.snapshot_id;
 if cardinality(ids)<>jsonb_array_length(composition.document->'baseline_events') or cardinality(ids)>1000 then raise exception 'scope_invoice_baseline_capture_mismatch' using errcode='22023';end if;
 select coalesce(array_agg(ba.obligation_id order by ba.obligation_id),'{}'::uuid[]) into obligations from public.operations_project_obligation_baselines ba where ba.event_id=any(ids) and ba.organization_id=org;
 if cardinality(obligations)<>cardinality(ids) or cardinality(obligations)<>(select count(distinct x) from unnest(obligations)x) then raise exception 'scope_invoice_duplicate_or_foreign_obligation' using errcode='22023';end if;
 if (select count(distinct source_anchor) from public.operations_project_obligation_invoice_bindings where organization_id=org and obligation_id=any(obligations))>10000 then raise exception 'scope_invoice_global_anchor_limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.source_anchor collate "C"),'[]') into bindings_before from (select distinct on(source_anchor) * from public.operations_project_obligation_invoice_bindings where organization_id=org and obligation_id=any(obligations) order by source_anchor,binding_sequence desc)x;
 select coalesce(jsonb_agg(jsonb_build_object('source_organization_id',x.source_organization_id,'invoice_id',x.invoice_id)),'[]') into selectors from (select distinct (value->>'source_organization_id')::uuid source_organization_id,(value->>'invoice_id')::uuid invoice_id from jsonb_array_elements(bindings_before))x;
 if jsonb_array_length(selectors)>100 then raise exception 'scope_invoice_global_selector_limit' using errcode='22023';end if;
 for identity in select key_label from (select distinct 'invoice-economic-source-v1:'||org::text||':'||(value->>'source_organization_id')::uuid::text||':'||(value->>'invoice_id')::uuid::text as key_label from jsonb_array_elements(selectors)) keys order by key_label collate "C" loop
 if not pg_try_advisory_xact_lock(hashtextextended(identity,0)) then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end if;end loop;
 begin
 select * into scope from public.operations_project_scope_heads where organization_id=org and economic_scope_id=scope_id for share nowait;
 if not found then raise exception 'enrolled_scope_invoice_root_required' using errcode='42501';end if;
 select * into strict membership from public.operations_project_scope_snapshots where organization_id=org and economic_scope_id=scope_id and scope_revision=scope.current_revision;
 perform operations_economy_private.lock_scope_read_root_nowait_v1(org,scope.root_kind,scope.root_id);
 graph:=operations_economy_private.scope_membership_v1(org,scope.root_kind,scope.root_id);
 if scope.current_revision<>(p->>'expected_scope_revision')::bigint or membership.membership_fingerprint<>p->>'expected_membership_fingerprint' or graph<>membership.membership or composition.scope_revision<>scope.current_revision or composition.scope_snapshot_id<>membership.snapshot_id or composition.membership_fingerprint<>membership.membership_fingerprint then raise exception 'current_scope_invoice_graph_required' using errcode='22023';end if;
 select current_revision into head from public.operations_scope_obligation_composition_heads where organization_id=org and economic_scope_id=scope_id for share nowait;
 if head is distinct from composition.composition_revision then raise exception 'current_scope_invoice_composition_required' using errcode='22023';end if;
 for b in select * from public.operations_project_obligation_baselines where event_id=any(ids) order by obligation_id loop
 perform 1 from public.operations_project_obligation_heads h where h.organization_id=org and h.project_id=b.project_id and h.obligation_id=b.obligation_id and h.current_revision=b.revision for share nowait;
 if not found then raise exception 'current_scope_invoice_baseline_required' using errcode='22023';end if;end loop;
 -- Every actual child first checks this existing gate, including unsupported basis.
 if cardinality(ids)>0 then perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share nowait;
 if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;end if;
 select coalesce(array_agg(distinct project_id order by project_id),'{}'::uuid[]) into projects from public.operations_project_obligation_baselines where event_id=any(ids) and organization_id=org;
 foreach project in array projects loop perform 1 from public.projects where id=project and organization_id=org and deleted_at is null for share nowait;
 if not found then raise exception 'invoice_kernel_project_denied' using errcode='42501';end if;end loop;
 -- Both missing counterparts are protected by the complete TRY key set.
 for source in select value from jsonb_array_elements(selectors) order by (value->>'source_organization_id')::uuid,(value->>'invoice_id')::uuid loop
 perform 1 from public.operations_finance_invoice_streams where organization_id=org and source_organization_id=(source->>'source_organization_id')::uuid and invoice_id=(source->>'invoice_id')::uuid for share nowait;
 perform 1 from public.operations_finance_credit_v2_streams where organization_id=org and source_organization_id=(source->>'source_organization_id')::uuid and invoice_id=(source->>'invoice_id')::uuid for share nowait;end loop;
 -- Policy reader is conditional, but the exact installed scoped heads cannot change
 -- while org is held; NOWAIT avoids any external queued update waiting path.
 perform 1 from public.operations_obligation_source_policy_heads h where h.organization_id=org and h.obligation_id=any(obligations) order by h.obligation_id,h.source_anchor collate "C" for share nowait;
 exception when lock_not_available then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.source_anchor collate "C"),'[]') into bindings_after from (select distinct on(source_anchor) * from public.operations_project_obligation_invoice_bindings where organization_id=org and obligation_id=any(obligations) order by source_anchor,binding_sequence desc)x;
 if bindings_after is distinct from bindings_before then raise exception 'scope_invoice_kernel_anchor_missing' using errcode='22023';end if;
 return jsonb_build_object('organization_id',org,'economic_scope_id',scope_id,'scope_snapshot_id',membership.snapshot_id,'scope_revision',scope.current_revision,'membership_fingerprint',membership.membership_fingerprint,'composition_snapshot_id',composition.snapshot_id,'composition_revision',composition.composition_revision,'composition_fingerprint',composition.fingerprint,'root_kind',scope.root_kind,'root_id',scope.root_id);
end;$$;
revoke all on function operations_economy_private.prepare_scope_invoice_read_v1(jsonb) from public,anon,authenticated,service_role;
create function operations_economy_private.read_scope_invoice_kernel_compatible_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare admitted jsonb;reply jsonb;k text;begin
 admitted:=operations_economy_private.prepare_scope_invoice_read_v1(p);
 reply:=operations_economy_private.read_scope_invoice_kernel_v1(p);
 foreach k in array array['organization_id','economic_scope_id','scope_snapshot_id','scope_revision','membership_fingerprint','composition_snapshot_id','composition_revision','composition_fingerprint','root_kind','root_id'] loop
 if reply->k is distinct from admitted->k then raise exception 'scope_invoice_kernel_baseline_mismatch' using errcode='22023';end if;end loop;
 return reply;
end;$$;
revoke all on function operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb) to service_role;
create function operations_economy_private.read_scope_invoice_capture_admin_compatible_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare org uuid;kind text;root uuid;expected uuid;k text;scope public.operations_project_scope_heads%rowtype;saved public.operations_scope_obligation_compositions%rowtype;request jsonb;admitted jsonb;reply jsonb;message text;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>4 or not(p ?& array['schema_version','root_kind','root_id','expected_composition_snapshot_id']) or p->>'schema_version' is distinct from 'operations-scope-invoice-capture-admin-read.v1' or jsonb_typeof(p->'root_kind') is distinct from 'string' or p->>'root_kind' not in ('project','large_project','packing_project') then raise exception 'exact_scope_invoice_admin_request_required' using errcode='22023';end if;
 foreach k in array array['root_id','expected_composition_snapshot_id'] loop if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_scope_invoice_admin_identity' using errcode='22023';end if;end loop;
 org:=operations_economy_private.authorize_scope_read_nowait_v1();kind:=p->>'root_kind';root:=(p->>'root_id')::uuid;expected:=(p->>'expected_composition_snapshot_id')::uuid;
 begin
 perform 1 from public.operations_scope_invoice_kernel_read_gates where organization_id=org and enabled for share nowait;if not found then raise exception 'scope_invoice_read_gate_disabled' using errcode='42501';end if;
 perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share nowait;if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;
 exception when lock_not_available then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end;
 if not pg_try_advisory_xact_lock(hashtextextended('obligation-org:'||org,0)) or not pg_try_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org,0)) then raise exception 'scope_invoice_reader_lock_busy' using errcode='55P03';end if;
 -- Admin actual root/current policy authority BEFORE immutable monetary hints.
 perform operations_economy_private.lock_scope_read_root_nowait_v1(org,kind,root);
 perform operations_economy_private.scope_membership_v1(org,kind,root);
 select * into scope from public.operations_project_scope_heads where organization_id=org and root_kind=kind and root_id=root;
 if not found then raise exception 'displayed_scope_invoice_capture_changed' using errcode='PT409';end if;
 select c.* into saved from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision where h.organization_id=org and h.economic_scope_id=scope.economic_scope_id;
 if not found or saved.snapshot_id is distinct from expected or saved.scope_revision is distinct from scope.current_revision then raise exception 'displayed_scope_invoice_capture_changed' using errcode='PT409';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id',org,'economic_scope_id',scope.economic_scope_id,'expected_scope_revision',saved.scope_revision,'expected_membership_fingerprint',saved.membership_fingerprint,'expected_composition_revision',saved.composition_revision,'expected_composition_fingerprint',saved.fingerprint);
 begin admitted:=operations_economy_private.prepare_scope_invoice_read_v1(request);
 exception when sqlstate '22023' then get stacked diagnostics message=message_text;
 if message in ('current_scope_invoice_graph_required','current_scope_invoice_composition_required','current_scope_invoice_baseline_required') then raise exception 'displayed_scope_invoice_capture_changed' using errcode='PT409';end if;raise;end;
 reply:=operations_economy_private.read_scope_invoice_capture_admin_v1(p);
 foreach k in array array['organization_id','economic_scope_id','scope_snapshot_id','scope_revision','membership_fingerprint','composition_snapshot_id','composition_revision','composition_fingerprint','root_kind','root_id'] loop
 if reply->'evidence'->k is distinct from admitted->k then raise exception 'scope_invoice_admin_source_proof_mismatch' using errcode='22023';end if;end loop;
 return reply;
end;$$;
revoke all on function operations_economy_private.read_scope_invoice_capture_admin_compatible_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_scope_invoice_capture_admin_compatible_v1(jsonb) to authenticated;
-- Same public names, parameters, roles, output shape and immutable old owner chains.
create or replace function public.read_operations_scope_invoice_kernel_evidence_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_scope_invoice_kernel_compatible_v1(p_request);$$;
create or replace function public.read_operations_scope_invoice_capture_admin_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_scope_invoice_capture_admin_compatible_v1(p_request);$$;
revoke execute on function operations_economy_private.read_scope_invoice_kernel_v1(jsonb) from service_role;
revoke execute on function operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb) from authenticated;
