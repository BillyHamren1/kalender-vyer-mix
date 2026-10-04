-- Canonical scope composition of genuine local authority. Always unavailable
-- cost coverage, receiver-v1-only, no EAC/budget/delivery activation.
create table public.operations_scope_obligation_composition_heads (
 organization_id uuid not null,economic_scope_id uuid not null,currency text not null check(currency ~ '^[A-Z]{3}$'),current_revision bigint not null check(current_revision between 1 and 9007199254740991),
 primary key(organization_id,economic_scope_id),foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id)
);
create table public.operations_scope_obligation_compositions (
 snapshot_id uuid primary key default gen_random_uuid(),organization_id uuid not null,economic_scope_id uuid not null,composition_revision bigint not null check(composition_revision between 1 and 9007199254740991),
 scope_snapshot_id uuid not null references public.operations_project_scope_snapshots(snapshot_id),scope_revision bigint not null,membership_fingerprint text not null,currency text not null,
 document jsonb not null,fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),actor_system_user_id uuid not null,reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,economic_scope_id,composition_revision),unique(organization_id,idempotency_key),
 foreign key(organization_id,economic_scope_id) references public.operations_scope_obligation_composition_heads(organization_id,economic_scope_id)
);
create table public.operations_scope_obligation_ownership (
 organization_id uuid not null,obligation_id uuid not null,economic_scope_id uuid not null,first_composition_snapshot_id uuid not null references public.operations_scope_obligation_compositions(snapshot_id),
 primary key(organization_id,obligation_id),foreign key(organization_id,obligation_id) references public.operations_project_obligation_heads(organization_id,obligation_id)
);
create table public.operations_scope_obligation_baseline_captures (
 composition_snapshot_id uuid not null references public.operations_scope_obligation_compositions(snapshot_id),baseline_event_id uuid not null references public.operations_project_obligation_baselines(event_id),primary key(composition_snapshot_id,baseline_event_id)
);
alter table public.operations_scope_obligation_composition_heads enable row level security;
alter table public.operations_scope_obligation_compositions enable row level security;
alter table public.operations_scope_obligation_ownership enable row level security;
alter table public.operations_scope_obligation_baseline_captures enable row level security;
revoke all on public.operations_scope_obligation_composition_heads,public.operations_scope_obligation_compositions,public.operations_scope_obligation_ownership,public.operations_scope_obligation_baseline_captures from public,anon,authenticated,service_role;
grant select on public.operations_scope_obligation_composition_heads,public.operations_scope_obligation_compositions,public.operations_scope_obligation_ownership,public.operations_scope_obligation_baseline_captures to service_role;
create trigger operations_scope_compositions_immutable before update or delete on public.operations_scope_obligation_compositions for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_compositions_no_truncate before truncate on public.operations_scope_obligation_compositions for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_obligation_owner_immutable before update or delete on public.operations_scope_obligation_ownership for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_obligation_owner_no_truncate before truncate on public.operations_scope_obligation_ownership for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_baseline_captures_immutable before update or delete on public.operations_scope_obligation_baseline_captures for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_scope_baseline_captures_no_truncate before truncate on public.operations_scope_obligation_baseline_captures for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.scope_composition_head_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op<>'UPDATE' or (new.organization_id,new.economic_scope_id,new.currency) is distinct from (old.organization_id,old.economic_scope_id,old.currency) or new.current_revision<>old.current_revision+1
 or not exists(select 1 from public.operations_scope_obligation_compositions s where s.organization_id=new.organization_id and s.economic_scope_id=new.economic_scope_id and s.composition_revision=new.current_revision) then raise exception 'scope_composition_head_change_denied' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_economy_private.scope_composition_head_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_scope_composition_heads_guard before update or delete on public.operations_scope_obligation_composition_heads for each row execute function operations_economy_private.scope_composition_head_guard_v1();
create trigger operations_scope_composition_heads_no_truncate before truncate on public.operations_scope_obligation_composition_heads for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.compose_scope_obligations_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();key text;scope public.operations_project_scope_heads%rowtype;membership public.operations_project_scope_snapshots%rowtype;graph jsonb;
 prior public.operations_scope_obligation_compositions%rowtype;saved public.operations_scope_obligation_compositions%rowtype;head public.operations_scope_obligation_composition_heads%rowtype;
 b public.operations_project_obligation_baselines%rowtype;owner public.operations_scope_obligation_ownership%rowtype;baseline_ids uuid[];obligations uuid[]:='{}';
 baselines jsonb:='[]';sources jsonb:='[]';binding public.operations_project_obligation_invoice_bindings%rowtype;proof jsonb;policy jsonb;entry jsonb;
 estimate numeric:=0;commitment numeric:=0;estimate_count int:=0;commitment_count int:=0;selected_count int:=0;expected bigint;next_revision bigint;document jsonb;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>9 or not(p ?& array['schema_version','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','currency','baseline_event_ids','idempotency_key','reason']) or p->>'schema_version' is distinct from 'operations-scope-obligation-compose.v1' then raise exception 'invalid_scope_composition_command' using errcode='22023';end if;
 if jsonb_typeof(p->'economic_scope_id') is distinct from 'string' or p->>'economic_scope_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'currency') is distinct from 'string' or p->>'currency' !~ '^[A-Z]{3}$' or jsonb_typeof(p->'expected_membership_fingerprint') is distinct from 'string' or p->>'expected_membership_fingerprint' !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p->'baseline_event_ids') is distinct from 'array' or jsonb_array_length(p->'baseline_event_ids')>1000 then raise exception 'invalid_scope_composition_identity' using errcode='22023';end if;
 foreach key in array array['expected_scope_revision','expected_composition_revision'] loop if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric) or (p->>key)::numeric not between (case when key='expected_scope_revision' then 1 else 0 end) and (case when key='expected_composition_revision' then 9007199254740990 else 9007199254740991 end) then raise exception 'invalid_scope_composition_revision' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'idempotency_key',200) or length(p->>'idempotency_key')<12 or jsonb_typeof(p->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'reason',1000) or length(p->>'reason')<3 then raise exception 'invalid_scope_composition_audit' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p->'baseline_event_ids') e where jsonb_typeof(e) is distinct from 'string' or e#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'invalid_scope_baseline_ids' using errcode='22023';end if;
 select coalesce(array_agg((value#>>'{}')::uuid order by value#>>'{}'),'{}'::uuid[]) into baseline_ids from jsonb_array_elements(p->'baseline_event_ids');
 if cardinality(baseline_ids)<>(select count(distinct x) from unnest(baseline_ids) x) then raise exception 'duplicate_scope_baseline_ids' using errcode='22023';end if;
 org:=operations_economy_private.authorize_scope_admin_v1();perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 select * into scope from public.operations_project_scope_heads where organization_id=org and economic_scope_id=(p->>'economic_scope_id')::uuid for share;
 if not found then raise exception 'enrolled_canonical_scope_required' using errcode='42501';end if;
 -- Live root/packing policy remains checked even for a historical exact retry.
 graph:=operations_economy_private.scope_membership_v1(org,scope.root_kind,scope.root_id);
 select * into prior from public.operations_scope_obligation_compositions where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if prior.command<>p or prior.actor_system_user_id<>actor then raise exception 'scope_composition_idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('outcome','replayed','snapshot_id',prior.snapshot_id,'composition_revision',prior.composition_revision,'fingerprint',prior.fingerprint,'coverage','unavailable','eac_minor',null,'shadow_only',true);end if;
 select * into membership from public.operations_project_scope_snapshots where organization_id=org and economic_scope_id=scope.economic_scope_id and scope_revision=scope.current_revision;
 if not found or scope.current_revision<>(p->>'expected_scope_revision')::bigint or membership.membership_fingerprint<>p->>'expected_membership_fingerprint' or graph<>membership.membership then raise exception 'current_scope_membership_required' using errcode='22023';end if;
 expected:=(p->>'expected_composition_revision')::bigint;
 select * into head from public.operations_scope_obligation_composition_heads where organization_id=org and economic_scope_id=scope.economic_scope_id for update;
 if found then if head.currency<>p->>'currency' then raise exception 'immutable_scope_composition_currency' using errcode='22023';end if;if head.current_revision<>expected then return jsonb_build_object('outcome','stale','current_composition_revision',head.current_revision);end if;
 elsif expected<>0 then return jsonb_build_object('outcome','stale','current_composition_revision',0);end if;
 -- Shared organization lock serializes all local baseline/binding/policy writers.
 -- Actual invoice source stream heads are separately locked below.
 for b in select * from public.operations_project_obligation_baselines where event_id=any(baseline_ids) order by event_id loop
 perform 1 from public.operations_project_obligation_heads h where h.organization_id=org and h.obligation_id=b.obligation_id and h.project_id=b.project_id and h.current_revision=b.revision for share;
 if not found or b.organization_id<>org or b.currency<>p->>'currency' or not exists(select 1 from jsonb_array_elements_text(graph->'source_project_ids') id where id::uuid=b.project_id) then raise exception 'current_member_local_baseline_required' using errcode='22023';end if;
 perform 1 from public.projects where id=b.project_id and organization_id=org and deleted_at is null for share;if not found then raise exception 'live_member_project_required' using errcode='42501';end if;
 if b.obligation_id=any(obligations) then raise exception 'duplicate_scope_obligation' using errcode='22023';end if;obligations:=array_append(obligations,b.obligation_id);selected_count:=selected_count+1;
 select * into owner from public.operations_scope_obligation_ownership where organization_id=org and obligation_id=b.obligation_id;
 if found and owner.economic_scope_id<>scope.economic_scope_id then raise exception 'scope_obligation_owner_conflict' using errcode='23505';end if;
 if b.estimate_minor is not null then estimate:=estimate+b.estimate_minor;estimate_count:=estimate_count+1;end if;
 if b.committed_minor is not null then commitment:=commitment+b.committed_minor;commitment_count:=commitment_count+1;end if;
 baselines:=baselines||jsonb_build_array(jsonb_build_object('baseline_event_id',b.event_id,'project_id',b.project_id,'obligation_id',b.obligation_id,'baseline_revision',b.revision,'baseline_fingerprint',b.fingerprint,'evidence_basis',b.evidence_basis,'category',b.category,'currency',b.currency,'cost_basis',b.cost_basis,'estimate_minor',b.estimate_minor,'committed_minor',b.committed_minor));end loop;
 if selected_count<>cardinality(baseline_ids) then raise exception 'actual_scope_baseline_events_required' using errcode='42501';end if;
 if estimate>9007199254740991 or commitment>9007199254740991 then raise exception 'unsafe_scope_baseline_sum' using errcode='22023';end if;
 for binding in select distinct on(source_anchor) * from public.operations_project_obligation_invoice_bindings where organization_id=org and obligation_id=any(obligations) order by source_anchor,binding_sequence desc loop
 proof:=operations_economy_private.read_obligation_original_v1(org,binding.project_id,binding.obligation_id,binding.source_anchor);
 policy:=operations_economy_private.read_source_policy_v1(org,binding.project_id,binding.obligation_id,binding.source_anchor);
 entry:=jsonb_build_object('source_anchor',binding.source_anchor,'project_id',binding.project_id,'obligation_id',binding.obligation_id,'baseline_event_id',binding.baseline_event_id,'binding_event_id',binding.event_id,'source_snapshot_id',binding.source_snapshot_id,'source_economic_revision',binding.source_economic_revision,'source_economic_fingerprint',binding.source_economic_fingerprint,'source_raw_body_sha256',binding.source_raw_body_sha256,'observed_amount_minor',binding.amount_minor,'observed_status',binding.source_status,'source_binding_state',proof->>'state','source_policy_state',policy->>'policy_state','policy_event_id',policy->'policy_event_id','policy_revision',policy->'policy_revision','policy_fingerprint',policy->'policy_fingerprint');
 sources:=sources||jsonb_build_array(entry);if jsonb_array_length(sources)>10000 then raise exception 'too_many_scope_source_anchors' using errcode='22023';end if;end loop;
 next_revision:=expected+1;
 document:=jsonb_build_object('schema_version','operations-scope-obligation-composition.v1','organization_id',org,'economic_scope_id',scope.economic_scope_id,'scope_revision',scope.current_revision,'membership_fingerprint',membership.membership_fingerprint,'composition_revision',next_revision,'currency',p->>'currency','authority_scope','canonical_scope_composition','pricing_basis','operations_manual_composition','baseline_events',baselines,'source_inventory',sources,
 'category_coverage',jsonb_build_object('personnel','unavailable','supplier','unavailable','catering','unavailable','other','unavailable'),'selected_count',selected_count,'known_estimate_minor',case when estimate_count>0 then estimate else null end,'known_commitment_minor',case when commitment_count>0 then commitment else null end,'all_selected_estimates_known',selected_count>0 and estimate_count=selected_count,'all_selected_commitments_known',selected_count>0 and commitment_count=selected_count,'coverage','unavailable','membership_currentness','as_of_graph','source_currentness','receiver_v1_only','eac_minor',null,'budget_minor',null,'shadow_only',true);
 if head.economic_scope_id is null then insert into public.operations_scope_obligation_composition_heads values(org,scope.economic_scope_id,p->>'currency',next_revision);end if;
 insert into public.operations_scope_obligation_compositions(organization_id,economic_scope_id,composition_revision,scope_snapshot_id,scope_revision,membership_fingerprint,currency,document,fingerprint,actor_system_user_id,reason,idempotency_key,command)
 values(org,scope.economic_scope_id,next_revision,membership.snapshot_id,scope.current_revision,membership.membership_fingerprint,p->>'currency',document,encode(sha256(convert_to(operations_economy_private.canonical_json_v1(document),'UTF8')),'hex'),actor,p->>'reason',p->>'idempotency_key',p) returning * into saved;
 insert into public.operations_scope_obligation_ownership select org,child_baseline.obligation_id,scope.economic_scope_id,saved.snapshot_id from public.operations_project_obligation_baselines child_baseline where child_baseline.event_id=any(baseline_ids) on conflict(organization_id,obligation_id) do nothing;
 insert into public.operations_scope_obligation_baseline_captures select saved.snapshot_id,x from unnest(baseline_ids) x;
 if head.economic_scope_id is not null then update public.operations_scope_obligation_composition_heads set current_revision=next_revision where organization_id=org and economic_scope_id=scope.economic_scope_id;end if;
 return jsonb_build_object('outcome','accepted','snapshot_id',saved.snapshot_id,'composition_revision',saved.composition_revision,'fingerprint',saved.fingerprint,'coverage','unavailable','eac_minor',null,'shadow_only',true);end;$$;
revoke all on function operations_economy_private.compose_scope_obligations_v1(jsonb) from public,anon,service_role;
grant execute on function operations_economy_private.compose_scope_obligations_v1(jsonb) to authenticated;
create function public.compose_operations_scope_obligations_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.compose_scope_obligations_v1(p_command);$$;
revoke all on function public.compose_operations_scope_obligations_v1(jsonb) from public,anon,service_role;
grant execute on function public.compose_operations_scope_obligations_v1(jsonb) to authenticated;

-- Currentness is limited to captured references, never all costs/upstream.
create function operations_economy_private.read_scope_composition_v1(p_org uuid,p_scope uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare scope public.operations_project_scope_heads%rowtype;head bigint;saved public.operations_scope_obligation_compositions%rowtype;graph jsonb;b jsonb;s jsonb;proof jsonb;policy jsonb;
 membership_current boolean;baselines_current boolean:=true;sources_current boolean:=true;begin
 if p_org is null or p_scope is null then raise exception 'scope_composition_selector_required' using errcode='22023';end if;
 -- Match every local baseline/binding/policy writer BEFORE taking scope/head
 -- row locks, so multiple captured references cannot span two ledger states.
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||p_org,0));
 select * into scope from public.operations_project_scope_heads where organization_id=p_org and economic_scope_id=p_scope for share;
 if not found then raise exception 'scope_composition_tenant_denied' using errcode='42501';end if;
 graph:=operations_economy_private.scope_membership_v1(p_org,scope.root_kind,scope.root_id);
 select current_revision into head from public.operations_scope_obligation_composition_heads where organization_id=p_org and economic_scope_id=p_scope for share;
 if not found then return jsonb_build_object('schema_version','operations-scope-obligation-composition-read.v1','state','no_evidence','document',null,'coverage','unavailable','eac_minor',null,'budget_minor',null,'shadow_only',true);end if;
 select * into saved from public.operations_scope_obligation_compositions where organization_id=p_org and economic_scope_id=p_scope and composition_revision=head;
 if not found then raise exception 'saved_scope_composition_unavailable' using errcode='22023';end if;
 membership_current:=scope.current_revision=saved.scope_revision and graph=(select membership from public.operations_project_scope_snapshots where snapshot_id=saved.scope_snapshot_id);
 baselines_current:=jsonb_array_length(saved.document->'baseline_events')>0;sources_current:=jsonb_array_length(saved.document->'source_inventory')>0;
 for b in select value from jsonb_array_elements(saved.document->'baseline_events') loop
 perform 1 from public.operations_project_obligation_heads h where h.organization_id=p_org and h.obligation_id=(b->>'obligation_id')::uuid and h.project_id=(b->>'project_id')::uuid and h.current_revision=(b->>'baseline_revision')::bigint for share;
 if not found then baselines_current:=false;end if;end loop;
 for s in select value from jsonb_array_elements(saved.document->'source_inventory') loop
 proof:=operations_economy_private.read_obligation_original_v1(p_org,(s->>'project_id')::uuid,(s->>'obligation_id')::uuid,s->>'source_anchor');
 policy:=operations_economy_private.read_source_policy_v1(p_org,(s->>'project_id')::uuid,(s->>'obligation_id')::uuid,s->>'source_anchor');
 if proof->>'state' is distinct from 'bound_original' or proof->>'binding_event_id' is distinct from s->>'binding_event_id' or proof->>'source_economic_fingerprint' is distinct from s->>'source_economic_fingerprint'
 or policy->>'policy_state' is distinct from s->>'source_policy_state' or policy->>'policy_event_id' is distinct from s->>'policy_event_id' then sources_current:=false;end if;end loop;
 return jsonb_build_object('schema_version','operations-scope-obligation-composition-read.v1','state','evidence','snapshot_id',saved.snapshot_id,'fingerprint',saved.fingerprint,'document',saved.document,'scope_membership_current',membership_current,'baseline_references_current',baselines_current,'source_references_current',sources_current,'source_currentness','receiver_v1_only','coverage','unavailable','eac_minor',null,'budget_minor',null,'shadow_only',true);
end;$$;
revoke all on function operations_economy_private.read_scope_composition_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function operations_economy_private.read_scope_composition_v1(uuid,uuid) to service_role;
create function public.read_operations_scope_obligation_composition_v1(p_organization_id uuid,p_economic_scope_id uuid) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_scope_composition_v1(p_organization_id,p_economic_scope_id);$$;
revoke all on function public.read_operations_scope_obligation_composition_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_operations_scope_obligation_composition_v1(uuid,uuid) to service_role;
