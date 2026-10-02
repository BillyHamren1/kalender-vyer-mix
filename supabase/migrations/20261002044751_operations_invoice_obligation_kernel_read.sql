-- Default-off read only: genuine LOCAL_PROJECT_ONLY invoice authority to kernel evidence.
-- Never changes baseline/policy/source prices; category/complete/EAC gates unavailable.
create table public.operations_invoice_obligation_kernel_read_gates(organization_id uuid primary key,enabled boolean not null default false);
alter table public.operations_invoice_obligation_kernel_read_gates enable row level security;
revoke all on public.operations_invoice_obligation_kernel_read_gates from public,anon,authenticated,service_role;
grant select,insert,update on public.operations_invoice_obligation_kernel_read_gates to service_role;
create function operations_economy_private.invoice_kernel_read_gate_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.organization_id is distinct from old.organization_id then raise exception 'invoice_kernel_read_gate_identity_immutable' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_economy_private.invoice_kernel_read_gate_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_invoice_kernel_gate_identity before update on public.operations_invoice_obligation_kernel_read_gates for each row execute function operations_economy_private.invoice_kernel_read_gate_guard_v1();
create trigger operations_invoice_kernel_gate_no_delete before delete on public.operations_invoice_obligation_kernel_read_gates for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_invoice_kernel_gate_no_truncate before truncate on public.operations_invoice_obligation_kernel_read_gates for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.read_invoice_obligation_kernel_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare
 org uuid;project uuid;obligation uuid;key text;selectors jsonb;h public.operations_project_obligation_heads%rowtype;baseline public.operations_project_obligation_baselines%rowtype;
 binding public.operations_project_obligation_invoice_bindings%rowtype;policy public.operations_obligation_source_policies%rowtype;
 current_source public.operations_finance_invoice_economic_current_v2%rowtype;original jsonb;policy_projection jsonb;resolved boolean;policy_state text;reason text;
 sources jsonb:='[]';diagnostics jsonb:='["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable"]';reply jsonb;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>4 or not(p ?& array['schema_version','organization_id','project_id','obligation_id']) or p->>'schema_version' is distinct from 'operations-invoice-obligation-kernel-read.v1' then raise exception 'exact_invoice_kernel_read_scope_required' using errcode='22023';end if;
 foreach key in array array['organization_id','project_id','obligation_id'] loop if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_invoice_kernel_read_identity' using errcode='22023';end if;end loop;
 org:=(p->>'organization_id')::uuid;project:=(p->>'project_id')::uuid;obligation:=(p->>'obligation_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 perform 1 from public.operations_invoice_obligation_kernel_read_gates where organization_id=org and enabled for share;if not found then raise exception 'invoice_kernel_read_gate_disabled' using errcode='42501';end if;
 if (select count(distinct source_anchor) from public.operations_project_obligation_invoice_bindings where organization_id=org and project_id=project and obligation_id=obligation)>10000 then raise exception 'invoice_kernel_binding_limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('source_organization_id',x.source_organization_id,'invoice_id',x.invoice_id)),'[]') into selectors from
 (select distinct latest.source_organization_id,latest.invoice_id from (select distinct on(source_anchor) source_organization_id,invoice_id from public.operations_project_obligation_invoice_bindings where organization_id=org and project_id=project and obligation_id=obligation order by source_anchor,binding_sequence desc) latest) x;
 if jsonb_array_length(selectors)>100 then raise exception 'invoice_kernel_source_selector_limit' using errcode='22023';end if;
 if jsonb_array_length(selectors)>0 then perform operations_invoice_private.lock_invoice_economic_sources_v1(org,selectors);end if;
 perform 1 from public.projects where organization_id=org and id=project and deleted_at is null for share;if not found then raise exception 'invoice_kernel_project_denied' using errcode='42501';end if;
 select * into h from public.operations_project_obligation_heads where organization_id=org and project_id=project and obligation_id=obligation for share;
 if not found then raise exception 'actual_invoice_kernel_obligation_required' using errcode='22023';end if;
 select * into strict baseline from public.operations_project_obligation_baselines where organization_id=org and obligation_id=obligation and revision=h.current_revision;
 if h.cost_basis<>'invoice' then diagnostics:=diagnostics||'"unsupported_cost_basis"'::jsonb;
 else
 for binding in select distinct on(source_anchor) * from public.operations_project_obligation_invoice_bindings where organization_id=org and project_id=project and obligation_id=obligation order by source_anchor,binding_sequence desc loop
 perform 1 from public.operations_finance_invoice_streams where organization_id=org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id for share;
 perform 1 from public.operations_finance_credit_v2_streams where organization_id=org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id for share;
 original:=operations_economy_private.read_obligation_original_v1(org,project,obligation,binding.source_anchor);
 select * into current_source from public.operations_finance_invoice_economic_current_v2 where organization_id=org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id;
 resolved:=found and original->>'state'='bound_original' and original->>'binding_event_id'=binding.event_id::text and original->>'baseline_event_id'=baseline.event_id::text
 and current_source.source_currentness='saved_receiver_heads_only' and current_source.envelope is not null and current_source.source_economic_revision=binding.source_economic_revision and current_source.source_economic_fingerprint=binding.source_economic_fingerprint;
 reason:=case when resolved then null else coalesce(original->>'reason','unified_current_economics_unavailable') end;
 select e.* into policy from public.operations_obligation_source_policy_heads ph join public.operations_obligation_source_policies e on e.organization_id=ph.organization_id and e.obligation_id=ph.obligation_id and e.source_anchor=ph.source_anchor and e.policy_revision=ph.current_revision where ph.organization_id=org and ph.project_id=project and ph.obligation_id=obligation and ph.source_anchor=binding.source_anchor;
 policy_state:=case when found then 'stale' else 'missing' end;
 if resolved then policy_projection:=operations_economy_private.read_source_policy_v1(org,project,obligation,binding.source_anchor);if policy_projection->>'policy_state'='current' then policy_state:='current';end if;end if;
 sources:=sources||jsonb_build_array(jsonb_build_object('source_anchor',binding.source_anchor,'binding_event_id',binding.event_id,'source_organization_id',binding.source_organization_id,'invoice_id',binding.invoice_id,'source_snapshot_id',binding.source_snapshot_id,'source_economic_revision',binding.source_economic_revision,'source_economic_fingerprint',binding.source_economic_fingerprint,'source_raw_sha256',binding.source_raw_body_sha256,
 'resolved',coalesce(resolved,false),'reason',reason,'current_snapshot_id',case when resolved then current_source.snapshot_id else null end,'current_raw_sha256',case when resolved then current_source.raw_body_sha256 else null end,
 'status',case when resolved then original->>'source_status' else null end,'amount_minor',case when resolved then (original->>'amount_minor')::bigint else null end,
 'policy_state',policy_state,'policy_event_id',policy.event_id,'policy_revision',policy.policy_revision,'policy_fingerprint',policy.fingerprint,'replaces_estimate_minor',case when policy_state='current' then policy.replaces_estimate_minor else null end,'consumes_commitment_minor',case when policy_state='current' then policy.consumes_commitment_minor else null end));
 end loop;end if;
 reply:=jsonb_build_object('schema_version','operations-invoice-obligation-kernel-evidence.v1','state',case when h.cost_basis='invoice' then 'captured' else 'unsupported_basis' end,'authority_scope','local_project_only','source_currentness','saved_receiver_heads_only','organization_id',org,'project_id',project,'obligation_id',obligation,'category_coverage','unavailable','source_coverage','unavailable','as_of',clock_timestamp(),
 'baseline',jsonb_build_object('event_id',baseline.event_id,'revision',baseline.revision,'fingerprint',baseline.fingerprint,'evidence_basis',baseline.evidence_basis,'currency',baseline.currency,'category',baseline.category,'cost_basis',baseline.cost_basis,'estimate_minor',baseline.estimate_minor,'committed_minor',baseline.committed_minor),
 'sources',sources,'diagnostics',diagnostics,'credit_eligible',false,'shadow_only',true,'eac_minor',null,'remaining_minor',null);
 if octet_length(reply::text)>262144 then raise exception 'invoice_kernel_evidence_size_limit' using errcode='22023';end if;return reply;
end;$$;
revoke all on function operations_economy_private.read_invoice_obligation_kernel_v1(jsonb) from public,anon,authenticated;
grant execute on function operations_economy_private.read_invoice_obligation_kernel_v1(jsonb) to service_role;
create function public.read_operations_invoice_obligation_kernel_evidence_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_invoice_obligation_kernel_v1(p_request);$$;
revoke all on function public.read_operations_invoice_obligation_kernel_evidence_v1(jsonb) from public,anon,authenticated;
grant execute on function public.read_operations_invoice_obligation_kernel_evidence_v1(jsonb) to service_role;
