-- Explicit admin-authored policy only, linked to genuine saved source authority.
-- LOCAL_PROJECT_ONLY / receiver_v1_only / shadow-only; no EAC or credit activation.
create table public.operations_obligation_source_policy_heads (
 organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,source_anchor text not null,
 current_revision bigint not null check(current_revision between 1 and 9007199254740991),
 primary key(organization_id,obligation_id,source_anchor),
 foreign key(organization_id,source_anchor) references public.operations_project_obligation_source_ownership(organization_id,source_anchor)
);
create table public.operations_obligation_source_policies (
 event_id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,source_anchor text not null,
 policy_revision bigint not null check(policy_revision between 1 and 9007199254740991),
 baseline_event_id uuid not null references public.operations_project_obligation_baselines(event_id),binding_event_id uuid not null references public.operations_project_obligation_invoice_bindings(event_id),
 source_economic_revision bigint not null check(source_economic_revision between 1 and 9007199254740991),source_economic_fingerprint text not null check(source_economic_fingerprint ~ '^[0-9a-f]{64}$'),
 authority_scope text not null default 'local_project_only' check(authority_scope='local_project_only'),currency text not null check(currency ~ '^[A-Z]{3}$'),
 replaces_estimate_minor bigint check(replaces_estimate_minor between 0 and 9007199254740991),consumes_commitment_minor bigint check(consumes_commitment_minor between 0 and 9007199254740991),
 actor_system_user_id uuid not null,reason text not null,idempotency_key text not null,command jsonb not null,fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now(),
 unique(organization_id,idempotency_key),unique(organization_id,obligation_id,source_anchor,policy_revision),
 foreign key(organization_id,obligation_id,source_anchor) references public.operations_obligation_source_policy_heads(organization_id,obligation_id,source_anchor)
);
alter table public.operations_obligation_source_policy_heads enable row level security;
alter table public.operations_obligation_source_policies enable row level security;
revoke all on public.operations_obligation_source_policy_heads,public.operations_obligation_source_policies from public,anon,authenticated,service_role;
grant select on public.operations_obligation_source_policy_heads,public.operations_obligation_source_policies to service_role;
create trigger operations_source_policies_immutable before update or delete on public.operations_obligation_source_policies for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_source_policies_no_truncate before truncate on public.operations_obligation_source_policies for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.source_policy_head_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op<>'UPDATE' or (new.organization_id,new.project_id,new.obligation_id,new.source_anchor) is distinct from (old.organization_id,old.project_id,old.obligation_id,old.source_anchor)
 or new.current_revision<>old.current_revision+1 or not exists(select 1 from public.operations_obligation_source_policies p where p.organization_id=new.organization_id and p.obligation_id=new.obligation_id and p.source_anchor=new.source_anchor and p.policy_revision=new.current_revision)
 then raise exception 'source_policy_head_change_denied' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_economy_private.source_policy_head_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_source_policy_heads_guard before update or delete on public.operations_obligation_source_policy_heads for each row execute function operations_economy_private.source_policy_head_guard_v1();
create trigger operations_source_policy_heads_no_truncate before truncate on public.operations_obligation_source_policy_heads for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.append_source_policy_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();key text;binding public.operations_project_obligation_invoice_bindings%rowtype;
 baseline public.operations_project_obligation_baselines%rowtype;prior public.operations_obligation_source_policies%rowtype;saved public.operations_obligation_source_policies%rowtype;
 head bigint;expected bigint;next_revision bigint;evidence jsonb;replacement numeric;consumption numeric;document jsonb;begin
 perform operations_economy_private.validate_obligation_command_common_v1(p,array['schema_version','project_id','obligation_id','baseline_event_id','binding_event_id','expected_policy_revision','replaces_estimate_minor','consumes_commitment_minor','idempotency_key','reason'],'operations-obligation-source-policy.v1');
 foreach key in array array['baseline_event_id','binding_event_id'] loop if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_source_policy_identity' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'expected_policy_revision') is distinct from 'number' or (p->>'expected_policy_revision')::numeric<>trunc((p->>'expected_policy_revision')::numeric) or (p->>'expected_policy_revision')::numeric not between 0 and 9007199254740990 then raise exception 'invalid_source_policy_revision' using errcode='22023';end if;
 foreach key in array array['replaces_estimate_minor','consumes_commitment_minor'] loop if jsonb_typeof(p->key) is distinct from 'null' and (jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric) or (p->>key)::numeric not between 0 and 9007199254740991) then raise exception 'invalid_source_policy_money' using errcode='22023';end if;end loop;
 org:=operations_economy_private.authorize_obligation_admin_v1((p->>'project_id')::uuid);perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 select * into prior from public.operations_obligation_source_policies where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if prior.command<>p or prior.actor_system_user_id<>actor then raise exception 'source_policy_idempotency_conflict' using errcode='23505';end if;
 return jsonb_build_object('outcome','replayed','event_id',prior.event_id,'policy_revision',prior.policy_revision,'fingerprint',prior.fingerprint,'authority_scope','local_project_only','source_currentness','receiver_v1_only','credit_eligible',false,'eac_minor',null);end if;
 select * into binding from public.operations_project_obligation_invoice_bindings where event_id=(p->>'binding_event_id')::uuid and organization_id=org and project_id=(p->>'project_id')::uuid and obligation_id=(p->>'obligation_id')::uuid;
 if not found then raise exception 'actual_source_policy_binding_required' using errcode='42501';end if;
 -- The resolver retains baseline and source-current-head locks until this txn ends.
 evidence:=operations_economy_private.read_obligation_original_v1(org,binding.project_id,binding.obligation_id,binding.source_anchor);
 if evidence->>'state' is distinct from 'bound_original' or (evidence->>'binding_event_id')::uuid is distinct from binding.event_id or (evidence->>'baseline_event_id')::uuid is distinct from (p->>'baseline_event_id')::uuid then raise exception 'current_source_policy_evidence_required' using errcode='22023';end if;
 select * into baseline from public.operations_project_obligation_baselines where event_id=binding.baseline_event_id;
 if baseline.estimate_minor is null and jsonb_typeof(p->'replaces_estimate_minor') is distinct from 'null' then raise exception 'unknown_estimate_policy_must_remain_null' using errcode='22023';end if;
 if baseline.committed_minor is null and jsonb_typeof(p->'consumes_commitment_minor') is distinct from 'null' then raise exception 'unknown_commitment_policy_must_remain_null' using errcode='22023';end if;
 select current_revision into head from public.operations_obligation_source_policy_heads where organization_id=org and obligation_id=binding.obligation_id and source_anchor=binding.source_anchor for update;
 head:=coalesce(head,0);expected:=(p->>'expected_policy_revision')::bigint;
 if head<>expected then return jsonb_build_object('outcome','stale','current_policy_revision',head,'authority_scope','local_project_only','credit_eligible',false,'eac_minor',null);end if;
 -- Do not release stale source reservations. Same-baseline latest policies for
 -- all other anchors remain in the bound; only this explicit decision replaces
 -- this anchor's prior values. There is no observed-amount pricing/cap invention.
 select coalesce(sum(latest.replaces_estimate_minor),0),coalesce(sum(latest.consumes_commitment_minor),0) into replacement,consumption from
 (select distinct on(source_anchor) source_anchor,replaces_estimate_minor,consumes_commitment_minor from public.operations_obligation_source_policies
 where organization_id=org and obligation_id=binding.obligation_id and baseline_event_id=baseline.event_id and source_anchor<>binding.source_anchor order by source_anchor,policy_revision desc) latest;
 replacement:=replacement+coalesce((p->>'replaces_estimate_minor')::numeric,0);consumption:=consumption+coalesce((p->>'consumes_commitment_minor')::numeric,0);
 if (baseline.estimate_minor is not null and replacement>baseline.estimate_minor) or (baseline.committed_minor is not null and consumption>baseline.committed_minor) then raise exception 'source_policy_baseline_aggregate_exceeded' using errcode='22023';end if;
 next_revision:=head+1;
 if head=0 then insert into public.operations_obligation_source_policy_heads values(org,binding.project_id,binding.obligation_id,binding.source_anchor,next_revision);end if;
 document:=jsonb_build_object('schema_version','operations-obligation-source-policy-evidence.v1','organization_id',org,'project_id',binding.project_id,'obligation_id',binding.obligation_id,'source_anchor',binding.source_anchor,'policy_revision',next_revision,'baseline_event_id',baseline.event_id,'binding_event_id',binding.event_id,'source_economic_revision',binding.source_economic_revision,'source_economic_fingerprint',binding.source_economic_fingerprint,'currency',baseline.currency,'authority_scope','local_project_only','replaces_estimate_minor',p->'replaces_estimate_minor','consumes_commitment_minor',p->'consumes_commitment_minor');
 insert into public.operations_obligation_source_policies(organization_id,project_id,obligation_id,source_anchor,policy_revision,baseline_event_id,binding_event_id,source_economic_revision,source_economic_fingerprint,currency,replaces_estimate_minor,consumes_commitment_minor,actor_system_user_id,reason,idempotency_key,command,fingerprint)
 values(org,binding.project_id,binding.obligation_id,binding.source_anchor,next_revision,baseline.event_id,binding.event_id,binding.source_economic_revision,binding.source_economic_fingerprint,baseline.currency,(p->>'replaces_estimate_minor')::bigint,(p->>'consumes_commitment_minor')::bigint,actor,p->>'reason',p->>'idempotency_key',p,encode(sha256(convert_to(operations_economy_private.canonical_json_v1(document),'UTF8')),'hex')) returning * into saved;
 if head<>0 then update public.operations_obligation_source_policy_heads set current_revision=next_revision where organization_id=org and obligation_id=binding.obligation_id and source_anchor=binding.source_anchor;end if;
 return jsonb_build_object('outcome','accepted','event_id',saved.event_id,'policy_revision',saved.policy_revision,'fingerprint',saved.fingerprint,'authority_scope','local_project_only','source_currentness','receiver_v1_only','credit_eligible',false,'eac_minor',null);end;$$;
revoke all on function operations_economy_private.append_source_policy_v1(jsonb) from public,anon,service_role;
grant execute on function operations_economy_private.append_source_policy_v1(jsonb) to authenticated;
create function public.append_operations_obligation_source_policy_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.append_source_policy_v1(p_command);$$;
revoke all on function public.append_operations_obligation_source_policy_v1(jsonb) from public,anon,service_role;
grant execute on function public.append_operations_obligation_source_policy_v1(jsonb) to authenticated;

create function operations_economy_private.read_source_policy_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text) returns jsonb language plpgsql security definer set search_path='' as $$
declare original jsonb;policy public.operations_obligation_source_policies%rowtype;head bigint;begin
 original:=operations_economy_private.read_obligation_original_v1(p_org,p_project,p_obligation,p_anchor);
 if original->>'state' is distinct from 'bound_original' then return original||jsonb_build_object('schema_version','operations-obligation-source-policy-projection.v1','policy_state','unresolved','credit_eligible',false);end if;
 select current_revision into head from public.operations_obligation_source_policy_heads where organization_id=p_org and project_id=p_project and obligation_id=p_obligation and source_anchor=p_anchor for share;
 if not found then return original||jsonb_build_object('schema_version','operations-obligation-source-policy-projection.v1','policy_state','unresolved','reason','missing_source_policy','credit_eligible',false);end if;
 select * into policy from public.operations_obligation_source_policies where organization_id=p_org and project_id=p_project and obligation_id=p_obligation and source_anchor=p_anchor and policy_revision=head;
 if not found then raise exception 'saved_source_policy_head_unavailable' using errcode='22023';end if;
 if policy.baseline_event_id is distinct from (original->>'baseline_event_id')::uuid or policy.binding_event_id is distinct from (original->>'binding_event_id')::uuid or policy.source_economic_revision is distinct from (original->>'source_economic_revision')::bigint or policy.source_economic_fingerprint is distinct from original->>'source_economic_fingerprint' then
 return original||jsonb_build_object('schema_version','operations-obligation-source-policy-projection.v1','policy_state','unresolved','reason','changed_source_policy_evidence','credit_eligible',false);end if;
 return original||jsonb_build_object('schema_version','operations-obligation-source-policy-projection.v1','policy_state','current','policy_event_id',policy.event_id,'policy_revision',policy.policy_revision,'policy_fingerprint',policy.fingerprint,'replaces_estimate_minor',policy.replaces_estimate_minor,'consumes_commitment_minor',policy.consumes_commitment_minor,'credit_eligible',false);
end;$$;
revoke all on function operations_economy_private.read_source_policy_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function operations_economy_private.read_source_policy_v1(uuid,uuid,uuid,text) to service_role;
create function public.read_operations_obligation_source_policy_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid,p_source_anchor text) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_source_policy_v1(p_organization_id,p_project_id,p_obligation_id,p_source_anchor);$$;
revoke all on function public.read_operations_obligation_source_policy_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_operations_obligation_source_policy_v1(uuid,uuid,uuid,text) to service_role;
