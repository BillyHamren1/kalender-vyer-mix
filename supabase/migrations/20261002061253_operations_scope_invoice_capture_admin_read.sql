-- Read-only authenticated boundary. Existing source gates and pricing remain unchanged.
create function operations_economy_private.read_scope_invoice_capture_admin_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; kind text; root uuid; expected uuid; key text;
 scope public.operations_project_scope_heads%rowtype;
 saved public.operations_scope_obligation_compositions%rowtype;
 request jsonb; evidence jsonb; member jsonb; reply jsonb; message text;
begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>4
 or not(p ?& array['schema_version','root_kind','root_id','expected_composition_snapshot_id'])
 or p->>'schema_version' is distinct from 'operations-scope-invoice-capture-admin-read.v1'
 or jsonb_typeof(p->'root_kind') is distinct from 'string'
 or p->>'root_kind' not in ('project','large_project','packing_project')
 then raise exception 'exact_scope_invoice_admin_request_required' using errcode='22023';end if;
 foreach key in array array['root_id','expected_composition_snapshot_id'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'invalid_scope_invoice_admin_identity' using errcode='22023';end if;end loop;
 org:=operations_economy_private.authorize_scope_admin_v1();kind:=p->>'root_kind';root:=(p->>'root_id')::uuid;expected:=(p->>'expected_composition_snapshot_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 perform 1 from public.operations_scope_invoice_kernel_read_gates where organization_id=org and enabled for share;
 if not found then raise exception 'scope_invoice_read_gate_disabled' using errcode='42501';end if;
 perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share;
 if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;
 -- Actual root/policy/live-parent authority, with no invoice or leaf-head locks.
 perform operations_economy_private.scope_membership_v1(org,kind,root);
 -- Selection is protected against composition writers by the org barrier.
 -- Scope graph writers have a separate barrier: the unchanged reader rechecks
 -- this selected immutable proof after ALL global source barriers are held.
 select * into scope from public.operations_project_scope_heads
 where organization_id=org and root_kind=kind and root_id=root;
 if not found then raise exception 'displayed_scope_invoice_capture_changed' using errcode='PT409';end if;
 select c.* into saved from public.operations_scope_obligation_composition_heads h
 join public.operations_scope_obligation_compositions c on c.organization_id=h.organization_id and c.economic_scope_id=h.economic_scope_id and c.composition_revision=h.current_revision
 where h.organization_id=org and h.economic_scope_id=scope.economic_scope_id;
 if not found or saved.snapshot_id is distinct from expected or saved.scope_revision is distinct from scope.current_revision
 then raise exception 'displayed_scope_invoice_capture_changed' using errcode='PT409';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1',
 'organization_id',org,'economic_scope_id',scope.economic_scope_id,'expected_scope_revision',saved.scope_revision,
 'expected_membership_fingerprint',saved.membership_fingerprint,'expected_composition_revision',saved.composition_revision,'expected_composition_fingerprint',saved.fingerprint);
 begin
 evidence:=operations_economy_private.read_scope_invoice_kernel_v1(request);
 exception when sqlstate '22023' then
 get stacked diagnostics message=message_text;
 if message in ('current_scope_invoice_graph_required','current_scope_invoice_composition_required','current_scope_invoice_baseline_required') then
 raise exception 'displayed_scope_invoice_capture_changed' using errcode='PT409';
 end if;raise;
 end;
 if evidence->>'organization_id' is distinct from org::text or evidence->>'root_kind' is distinct from kind
 or evidence->>'root_id' is distinct from root::text or evidence->>'economic_scope_id' is distinct from scope.economic_scope_id::text
 or evidence->>'composition_snapshot_id' is distinct from expected::text
 or evidence->>'composition_revision' is distinct from saved.composition_revision::text
 or evidence->>'composition_fingerprint' is distinct from saved.fingerprint
 or evidence->>'scope_revision' is distinct from saved.scope_revision::text
 or evidence->>'membership_fingerprint' is distinct from saved.membership_fingerprint
 then raise exception 'scope_invoice_admin_source_proof_mismatch' using errcode='22023';end if;
 for member in select value from jsonb_array_elements(evidence->'members') loop
 if operations_economy_private.authorize_obligation_admin_v1((member->>'project_id')::uuid) is distinct from org then
 raise exception 'scope_invoice_admin_member_denied' using errcode='42501';end if;
 end loop;
 reply:=jsonb_build_object('schema_version','operations-scope-invoice-capture-admin-evidence.v1',
 'authority_scope','canonical_scope_invoice_capture','evidence',evidence);
 if octet_length(reply::text)>262144 then raise exception 'scope_invoice_admin_size_limit' using errcode='54000';end if;
 return reply;
end;$$;
revoke all on function operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb) to authenticated;
create function public.read_operations_scope_invoice_capture_admin_v1(p_request jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_scope_invoice_capture_admin_v1(p_request);$$;
revoke all on function public.read_operations_scope_invoice_capture_admin_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_operations_scope_invoice_capture_admin_v1(jsonb) to authenticated;
