-- Default-off local capacity evidence only. Credit eligibility/EAC remain unavailable.
create table public.operations_obligation_credit_capacity_gates(organization_id uuid primary key,enabled boolean not null default false);
alter table public.operations_obligation_credit_capacity_gates enable row level security;
revoke all on public.operations_obligation_credit_capacity_gates from public,anon,authenticated,service_role;
grant select,insert,update on public.operations_obligation_credit_capacity_gates to service_role;
create function operations_economy_private.credit_capacity_gate_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.organization_id is distinct from old.organization_id then raise exception 'credit_capacity_gate_identity_immutable' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_economy_private.credit_capacity_gate_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_credit_capacity_gate_identity before update on public.operations_obligation_credit_capacity_gates for each row execute function operations_economy_private.credit_capacity_gate_guard_v1();
create trigger operations_credit_capacity_gate_no_delete before delete on public.operations_obligation_credit_capacity_gates for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_credit_capacity_gate_no_truncate before truncate on public.operations_obligation_credit_capacity_gates for each statement execute function public.operations_personnel_evidence_immutable();
create table public.operations_obligation_credit_capacity_heads(
 organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,source_anchor text not null check(source_anchor ~ '^[0-9a-f]{64}$'),original_anchor text not null check(original_anchor ~ '^[0-9a-f]{64}$'),
 currency text not null check(currency ~ '^[A-Z]{3}$'),current_revision bigint not null check(current_revision between 1 and 9007199254740991),primary key(organization_id,source_anchor),
 foreign key(organization_id,source_anchor) references public.operations_project_obligation_source_ownership(organization_id,source_anchor),
 foreign key(organization_id,original_anchor) references public.operations_project_obligation_source_ownership(organization_id,source_anchor)
);
create table public.operations_obligation_credit_capacity_events(
 event_id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,source_anchor text not null,original_anchor text not null,
 revision bigint not null check(revision between 1 and 9007199254740991),assignment_event_id uuid not null references public.operations_obligation_credit_assignments(event_id),
 currency text not null check(currency ~ '^[A-Z]{3}$'),reserved_minor bigint not null check(reserved_minor between 1 and 9007199254740991),original_amount_minor bigint not null check(original_amount_minor between 1 and 9007199254740991),
 retained_aggregate_minor bigint not null check(retained_aggregate_minor between 1 and 9007199254740991 and retained_aggregate_minor<=original_amount_minor),
 source_proof jsonb not null,source_proof_fingerprint text not null check(source_proof_fingerprint ~ '^[0-9a-f]{64}$'),actor_system_user_id uuid not null,reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,source_anchor,revision),unique(organization_id,idempotency_key),foreign key(organization_id,source_anchor) references public.operations_obligation_credit_capacity_heads(organization_id,source_anchor)
);
alter table public.operations_obligation_credit_capacity_heads enable row level security;
alter table public.operations_obligation_credit_capacity_events enable row level security;
revoke all on public.operations_obligation_credit_capacity_heads,public.operations_obligation_credit_capacity_events from public,anon,authenticated,service_role;
grant select on public.operations_obligation_credit_capacity_heads,public.operations_obligation_credit_capacity_events to service_role;
create trigger operations_credit_capacity_events_immutable before update or delete on public.operations_obligation_credit_capacity_events for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_credit_capacity_events_no_truncate before truncate on public.operations_obligation_credit_capacity_events for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.credit_capacity_head_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'credit_capacity_head_immutable' using errcode='55000';end if;
 if (new.organization_id,new.project_id,new.obligation_id,new.source_anchor,new.original_anchor,new.currency) is distinct from (old.organization_id,old.project_id,old.obligation_id,old.source_anchor,old.original_anchor,old.currency)
 or new.current_revision<>old.current_revision+1 or not exists(select 1 from public.operations_obligation_credit_capacity_events e where e.organization_id=new.organization_id and e.source_anchor=new.source_anchor and e.revision=new.current_revision) then raise exception 'credit_capacity_head_conflict' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_economy_private.credit_capacity_head_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_credit_capacity_head_guard before update or delete on public.operations_obligation_credit_capacity_heads for each row execute function operations_economy_private.credit_capacity_head_guard_v1();
create trigger operations_credit_capacity_head_no_truncate before truncate on public.operations_obligation_credit_capacity_heads for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.credit_capacity_source_v1(p_org uuid,p_project uuid,p_obligation uuid,p_assignment uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare
 event public.operations_obligation_credit_assignments%rowtype;current_assignment jsonb;original jsonb;begin
 if p_org is null or p_project is null or p_obligation is null or p_assignment is null then raise exception 'invalid_capacity_source_selector' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||p_org,0));
 select * into event from public.operations_obligation_credit_assignments where event_id=p_assignment and organization_id=p_org and project_id=p_project and obligation_id=p_obligation;
 if not found then return jsonb_build_object('state','unresolved','reason','missing_actual_assignment');end if;
 current_assignment:=operations_economy_private.read_obligation_own_credit_v1(p_org,p_project,p_obligation,event.source_anchor);
 if current_assignment->>'state'<>'assigned' or current_assignment->>'event_id' is distinct from event.event_id::text then return jsonb_build_object('state','unresolved','reason','assignment_not_current');end if;
 original:=operations_economy_private.read_obligation_original_v1(p_org,p_project,p_obligation,event.proof->>'credited_source_anchor');
 if original->>'state'<>'bound_original' or original->>'binding_event_id' is distinct from event.original_binding_event_id::text or original->>'currency' is distinct from event.proof->>'currency' or (original->>'amount_minor')::bigint<=0 or (event.proof->>'amount_minor')::bigint>=0 then return jsonb_build_object('state','unresolved','reason','positive_original_not_current');end if;
 return jsonb_build_object('schema_version','operations-obligation-credit-capacity-source.v1','state','current_source_bound','assignment_event_id',event.event_id,'assignment_revision',event.revision,
 'assignment_proof',event.proof,'assignment_proof_fingerprint',event.proof_fingerprint,'original_evidence',original,'source_anchor',event.source_anchor,'original_anchor',event.proof->'credited_source_anchor',
 'currency',original->'currency','reserved_minor',-(event.proof->>'amount_minor')::bigint,'original_amount_minor',(original->>'amount_minor')::bigint);
end;$$;
revoke all on function operations_economy_private.credit_capacity_source_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function operations_economy_private.append_credit_capacity_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare
 org uuid;actor uuid:=auth.uid();source jsonb;head public.operations_obligation_credit_capacity_heads%rowtype;prior public.operations_obligation_credit_capacity_events%rowtype;event public.operations_obligation_credit_capacity_events%rowtype;
 anchor text;target_original_anchor text;expected bigint;next_revision bigint;aggregate numeric;begin
 perform operations_economy_private.validate_obligation_command_common_v1(p,array['schema_version','project_id','obligation_id','assignment_event_id','expected_capacity_revision','idempotency_key','reason'],'operations-obligation-credit-capacity.v1');
 if jsonb_typeof(p->'assignment_event_id') is distinct from 'string' or p->>'assignment_event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(p->'expected_capacity_revision') is distinct from 'number' or (p->>'expected_capacity_revision')::numeric<>trunc((p->>'expected_capacity_revision')::numeric) or (p->>'expected_capacity_revision')::numeric not between 0 and 9007199254740990 then raise exception 'invalid_credit_capacity_command' using errcode='22023';end if;
 org:=operations_economy_private.authorize_obligation_admin_v1((p->>'project_id')::uuid);perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 perform 1 from public.operations_obligation_credit_capacity_gates where organization_id=org and enabled for share;
 if not found then raise exception 'credit_capacity_gate_disabled' using errcode='42501';end if;
 select * into prior from public.operations_obligation_credit_capacity_events where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if prior.command<>p or prior.actor_system_user_id<>actor then raise exception 'credit_capacity_idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('outcome','replayed','event_id',prior.event_id,'revision',prior.revision,'receipt_currentness','historical_provenance_only','credit_eligible',false,'eac_minor',null);end if;
 source:=operations_economy_private.credit_capacity_source_v1(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,(p->>'assignment_event_id')::uuid);
 if source->>'state'<>'current_source_bound' then raise exception 'current_credit_capacity_source_required' using errcode='22023';end if;
 anchor:=source->>'source_anchor';target_original_anchor:=source->>'original_anchor';expected:=(p->>'expected_capacity_revision')::bigint;
 select * into head from public.operations_obligation_credit_capacity_heads where organization_id=org and source_anchor=anchor for update;
 if found and (head.original_anchor<>target_original_anchor or head.project_id<>(p->>'project_id')::uuid or head.obligation_id<>(p->>'obligation_id')::uuid or head.currency<>source->>'currency') then raise exception 'credit_capacity_permanent_original_conflict' using errcode='23505';end if;
 if coalesce(head.current_revision,0)<>expected then return jsonb_build_object('outcome','stale','current_revision',coalesce(head.current_revision,0),'credit_eligible',false,'eac_minor',null);end if;
 -- Retain every other latest reservation, regardless of source status/currentness.
 select coalesce(sum(e.reserved_minor::numeric),0)+(source->>'reserved_minor')::numeric into aggregate from public.operations_obligation_credit_capacity_heads h join public.operations_obligation_credit_capacity_events e on e.organization_id=h.organization_id and e.source_anchor=h.source_anchor and e.revision=h.current_revision where h.organization_id=org and h.original_anchor=target_original_anchor and h.source_anchor<>anchor;
 if aggregate>(source->>'original_amount_minor')::numeric then raise exception 'actual_original_credit_capacity_exceeded' using errcode='22023';end if;
 next_revision:=expected+1;
 if head.source_anchor is null then insert into public.operations_obligation_credit_capacity_heads values(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,anchor,target_original_anchor,source->>'currency',next_revision);end if;
 insert into public.operations_obligation_credit_capacity_events(organization_id,project_id,obligation_id,source_anchor,original_anchor,revision,assignment_event_id,currency,reserved_minor,original_amount_minor,retained_aggregate_minor,source_proof,source_proof_fingerprint,actor_system_user_id,reason,idempotency_key,command)
 values(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,anchor,target_original_anchor,next_revision,(p->>'assignment_event_id')::uuid,source->>'currency',(source->>'reserved_minor')::bigint,(source->>'original_amount_minor')::bigint,aggregate::bigint,source,encode(sha256(convert_to(source::text,'UTF8')),'hex'),actor,p->>'reason',p->>'idempotency_key',p) returning * into event;
 if head.source_anchor is not null then update public.operations_obligation_credit_capacity_heads set current_revision=next_revision where organization_id=org and source_anchor=anchor;end if;
 return jsonb_build_object('outcome','accepted','event_id',event.event_id,'revision',event.revision,'capacity_state','local_capacity_proven','receipt_currentness','saved_capacity_event_only','reserved_minor',event.reserved_minor,'retained_aggregate_minor',event.retained_aggregate_minor,'credit_eligible',false,'eac_minor',null,'shadow_only',true);
end;$$;
revoke all on function operations_economy_private.append_credit_capacity_v1(jsonb) from public,anon,service_role;grant execute on function operations_economy_private.append_credit_capacity_v1(jsonb) to authenticated;
create function public.append_operations_obligation_credit_capacity_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.append_credit_capacity_v1(p_command);$$;
revoke all on function public.append_operations_obligation_credit_capacity_v1(jsonb) from public,anon,service_role;grant execute on function public.append_operations_obligation_credit_capacity_v1(jsonb) to authenticated;
create function operations_economy_private.read_credit_capacity_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text) returns jsonb language plpgsql security definer set search_path='' as $$declare
 event public.operations_obligation_credit_capacity_events%rowtype;source jsonb;aggregate numeric;
 unresolved jsonb:=jsonb_build_object('schema_version','operations-obligation-credit-capacity-read.v1','state','unresolved','authority_scope','local_project_only','credit_eligible',false,'remaining_coverage','unavailable','eac_minor',null,'shadow_only',true);
begin
 if p_org is null or p_project is null or p_obligation is null or p_anchor is null or p_anchor !~ '^[0-9a-f]{64}$' then raise exception 'invalid_credit_capacity_read_selector' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||p_org,0));
 perform 1 from public.operations_obligation_credit_capacity_gates where organization_id=p_org and enabled for share;if not found then return unresolved||jsonb_build_object('reason','gate_disabled');end if;
 select e.* into event from public.operations_obligation_credit_capacity_heads h join public.operations_obligation_credit_capacity_events e on e.organization_id=h.organization_id and e.source_anchor=h.source_anchor and e.revision=h.current_revision where h.organization_id=p_org and h.project_id=p_project and h.obligation_id=p_obligation and h.source_anchor=p_anchor;
 if not found then return unresolved||jsonb_build_object('reason','missing_actual_reservation');end if;
 source:=operations_economy_private.credit_capacity_source_v1(p_org,p_project,p_obligation,event.assignment_event_id);
 if source->>'state'<>'current_source_bound' or source is distinct from event.source_proof or event.source_proof_fingerprint<>encode(sha256(convert_to(event.source_proof::text,'UTF8')),'hex') then return unresolved||jsonb_build_object('reason','changed_capacity_source_proof');end if;
 select coalesce(sum(e.reserved_minor::numeric),0) into aggregate from public.operations_obligation_credit_capacity_heads h join public.operations_obligation_credit_capacity_events e on e.organization_id=h.organization_id and e.source_anchor=h.source_anchor and e.revision=h.current_revision where h.organization_id=p_org and h.original_anchor=event.original_anchor;
 if aggregate>(source->>'original_amount_minor')::numeric then return unresolved||jsonb_build_object('reason','retained_reservations_exceed_actual_original');end if;
 return unresolved||jsonb_build_object('state','local_capacity_proven','event_id',event.event_id,'revision',event.revision,'reserved_minor',event.reserved_minor,'retained_aggregate_minor',aggregate,'original_amount_minor',event.original_amount_minor,'source_proof',event.source_proof,'source_proof_fingerprint',event.source_proof_fingerprint);
end;$$;
revoke all on function operations_economy_private.read_credit_capacity_v1(uuid,uuid,uuid,text) from public,anon,authenticated;grant execute on function operations_economy_private.read_credit_capacity_v1(uuid,uuid,uuid,text) to service_role;
create function public.read_operations_obligation_credit_capacity_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid,p_source_anchor text) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_credit_capacity_v1(p_organization_id,p_project_id,p_obligation_id,p_source_anchor);$$;
revoke all on function public.read_operations_obligation_credit_capacity_v1(uuid,uuid,uuid,text) from public,anon,authenticated;grant execute on function public.read_operations_obligation_credit_capacity_v1(uuid,uuid,uuid,text) to service_role;
