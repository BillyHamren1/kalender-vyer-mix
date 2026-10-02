-- Source ownership only: local manual obligation + genuine V1 positive original
-- + actual current V2 negative own credit. No capacity/eligibility/EAC activation.
create table public.operations_obligation_credit_assignment_heads(
 organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,source_anchor text not null check(source_anchor ~ '^[0-9a-f]{64}$'),
 current_revision bigint not null check(current_revision between 1 and 9007199254740991),primary key(organization_id,source_anchor),
 foreign key(organization_id,source_anchor) references public.operations_project_obligation_source_ownership(organization_id,source_anchor)
);
create table public.operations_obligation_credit_assignments(
 event_id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,
 source_anchor text not null check(source_anchor ~ '^[0-9a-f]{64}$'),revision bigint not null check(revision between 1 and 9007199254740991),
 baseline_event_id uuid not null references public.operations_project_obligation_baselines(event_id),
 original_binding_event_id uuid not null references public.operations_project_obligation_invoice_bindings(event_id),
 credit_snapshot_id uuid not null references public.operations_finance_credit_v2_snapshots(id),credit_allocation_id uuid not null,
 proof jsonb not null,proof_fingerprint text not null check(proof_fingerprint ~ '^[0-9a-f]{64}$'),
 authority_scope text not null default 'local_project_only' check(authority_scope='local_project_only'),
 actor_system_user_id uuid not null,reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,source_anchor,revision),unique(organization_id,idempotency_key),
 foreign key(organization_id,source_anchor) references public.operations_obligation_credit_assignment_heads(organization_id,source_anchor)
);
alter table public.operations_obligation_credit_assignment_heads enable row level security;
alter table public.operations_obligation_credit_assignments enable row level security;
revoke all on public.operations_obligation_credit_assignment_heads,public.operations_obligation_credit_assignments from public,anon,authenticated,service_role;
grant select on public.operations_obligation_credit_assignment_heads,public.operations_obligation_credit_assignments to service_role;
create trigger operations_credit_assignments_immutable before update or delete on public.operations_obligation_credit_assignments for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_credit_assignments_no_truncate before truncate on public.operations_obligation_credit_assignments for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.credit_assignment_head_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'credit_assignment_head_immutable' using errcode='55000';end if;
 if (new.organization_id,new.project_id,new.obligation_id,new.source_anchor) is distinct from (old.organization_id,old.project_id,old.obligation_id,old.source_anchor)
 or new.current_revision<>old.current_revision+1 or not exists(select 1 from public.operations_obligation_credit_assignments e where e.organization_id=new.organization_id and e.source_anchor=new.source_anchor and e.revision=new.current_revision)
 then raise exception 'credit_assignment_head_conflict' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_economy_private.credit_assignment_head_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_credit_assignment_head_guard before update or delete on public.operations_obligation_credit_assignment_heads for each row execute function operations_economy_private.credit_assignment_head_guard_v1();
create trigger operations_credit_assignment_head_no_truncate before truncate on public.operations_obligation_credit_assignment_heads for each statement execute function public.operations_personnel_evidence_immutable();

-- Owner-only resolver. It derives invoice selectors from real saved recipient evidence.
-- Always obtains org -> sorted source barriers -> baseline/protocol rows in that order.
create function operations_economy_private.credit_assignment_source_proof_v1(p_org uuid,p_project uuid,p_obligation uuid,p_snapshot uuid,p_allocation uuid,p_binding uuid,p_baseline_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$declare
 s public.operations_finance_credit_v2_snapshots%rowtype;b public.operations_project_obligation_invoice_bindings%rowtype;
 h public.operations_project_obligation_heads%rowtype;credit_current public.operations_finance_invoice_economic_current_v2%rowtype;original_current public.operations_finance_invoice_economic_current_v2%rowtype;
 original jsonb;a jsonb;source_invoice uuid;
 unresolved jsonb:=jsonb_build_object('state','unresolved','credit_eligible',false,'eac_minor',null,'remaining_coverage','unavailable','authority_scope','local_project_only','shadow_only',true);
begin
 if p_org is null or p_project is null or p_obligation is null or p_snapshot is null or p_allocation is null or p_binding is null or p_baseline_revision is null or p_baseline_revision not between 1 and 9007199254740991 then raise exception 'invalid_credit_assignment_selector' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||p_org,0));
 select * into s from public.operations_finance_credit_v2_snapshots where organization_id=p_org and id=p_snapshot;
 if not found then return unresolved||jsonb_build_object('reason','missing_saved_credit');end if;
 select * into b from public.operations_project_obligation_invoice_bindings where event_id=p_binding and organization_id=p_org and project_id=p_project and obligation_id=p_obligation;
 if not found or b.source_organization_id<>s.source_organization_id then return unresolved||jsonb_build_object('reason','missing_same_source_original_binding');end if;
 perform operations_invoice_private.lock_invoice_economic_sources_v1(p_org,jsonb_build_array(jsonb_build_object('source_organization_id',s.source_organization_id,'invoice_id',s.invoice_id),jsonb_build_object('source_organization_id',b.source_organization_id,'invoice_id',b.invoice_id)));
 perform 1 from public.projects where organization_id=p_org and id=p_project and deleted_at is null for share;
 if not found then raise exception 'credit_assignment_project_denied' using errcode='42501';end if;
 select * into h from public.operations_project_obligation_heads where organization_id=p_org and obligation_id=p_obligation and project_id=p_project for share;
 if not found or h.cost_basis<>'invoice' or h.current_revision<>p_baseline_revision then return unresolved||jsonb_build_object('reason','changed_baseline');end if;
 for source_invoice in select distinct invoice from unnest(array[s.invoice_id,b.invoice_id]) invoice order by invoice loop
 perform 1 from public.operations_finance_invoice_streams where organization_id=p_org and source_organization_id=s.source_organization_id and invoice_id=source_invoice for share;
 perform 1 from public.operations_finance_credit_v2_streams where organization_id=p_org and source_organization_id=s.source_organization_id and invoice_id=source_invoice for share;
 end loop;
 select * into credit_current from public.operations_finance_invoice_economic_current_v2 where organization_id=p_org and source_organization_id=s.source_organization_id and invoice_id=s.invoice_id;
 if not found or credit_current.source_protocol<>'v2' or credit_current.source_currentness<>'saved_receiver_heads_only' or credit_current.snapshot_id is distinct from s.id or credit_current.envelope is distinct from s.envelope or credit_current.raw_body_sha256 is distinct from s.body_sha256 then return unresolved||jsonb_build_object('reason','changed_credit_publication');end if;
 select * into original_current from public.operations_finance_invoice_economic_current_v2 where organization_id=p_org and source_organization_id=b.source_organization_id and invoice_id=b.invoice_id;
 if not found or original_current.source_currentness<>'saved_receiver_heads_only' or original_current.envelope is null or original_current.source_economic_revision is distinct from b.source_economic_revision or original_current.source_economic_fingerprint is distinct from b.source_economic_fingerprint then return unresolved||jsonb_build_object('reason','changed_original_economics');end if;
 original:=operations_economy_private.read_obligation_original_v1(p_org,p_project,p_obligation,b.source_anchor);
 if original->>'state'<>'bound_original' or original->>'binding_event_id' is distinct from b.event_id::text or original->>'baseline_revision' is distinct from p_baseline_revision::text then return unresolved||jsonb_build_object('reason','original_binding_not_current');end if;
 perform operations_invoice_private.validate_credit_destination_v2(s.envelope);
 if s.raw_body::jsonb<>s.envelope or s.body_sha256<>encode(sha256(convert_to(s.raw_body,'UTF8')),'hex') or s.snapshot_fingerprint<>s.body_sha256
 or s.envelope->>'invoice_kind'<>'credit' or s.envelope->>'credit_relation_coverage'<>'linked' or s.envelope->>'currency'<>h.currency
 or (s.envelope->>'source_revision')::bigint<>s.source_revision or (s.envelope->>'source_economic_revision')::bigint<>s.source_economic_revision
 or s.envelope->>'source_economic_publication_fingerprint'<>s.source_economic_publication_fingerprint
 or (s.envelope->>'source_organization_id')::uuid<>s.source_organization_id or (s.envelope->>'destination_organization_id')::uuid<>p_org or (s.envelope->>'invoice_id')::uuid<>s.invoice_id then return unresolved||jsonb_build_object('reason','saved_credit_provenance_invalid');end if;
 select value into strict a from jsonb_array_elements(s.envelope->'allocations') where (value->>'allocation_id')::uuid=p_allocation;
 if (a->>'destination_project_id')::uuid<>p_project or (a->>'destination_organization_id')::uuid<>p_org or a->>'status' not in ('preliminary','confirmed') or (a->>'amount_minor')::bigint>=0 or a->>'credited_source_anchor' is distinct from b.source_anchor or a->>'source_anchor'=b.source_anchor
 or exists(select 1 from public.operations_project_obligation_invoice_bindings where organization_id=p_org and source_anchor=a->>'source_anchor') then return unresolved||jsonb_build_object('reason','negative_credit_same_original_required');end if;
 return jsonb_build_object('schema_version','operations-obligation-credit-source-proof.v1','state','source_bound','organization_id',p_org,'project_id',p_project,'obligation_id',p_obligation,
 'baseline_event_id',original->'baseline_event_id','baseline_revision',p_baseline_revision,'baseline_fingerprint',original->'baseline_fingerprint','original_binding_event_id',b.event_id,
 'source_organization_id',s.source_organization_id,'original_invoice_id',b.invoice_id,'original_economic_revision',b.source_economic_revision,'original_economic_fingerprint',b.source_economic_fingerprint,
 'original_source_snapshot_id',b.source_snapshot_id,'original_unified_snapshot_id',original_current.snapshot_id,'original_unified_raw_sha256',original_current.raw_body_sha256,
 'credit_invoice_id',s.invoice_id,'credit_snapshot_id',s.id,'credit_source_revision',s.source_revision,'credit_economic_revision',s.source_economic_revision,'credit_economic_fingerprint',s.source_economic_publication_fingerprint,
 'credit_publication_fingerprint',s.source_publication_fingerprint,'credit_relationship_fingerprint',s.envelope->'credit_relationship_fingerprint','credit_relation_coverage',s.envelope->'credit_relation_coverage',
 'credit_raw_sha256',s.body_sha256,'credit_snapshot_fingerprint',s.snapshot_fingerprint,'credit_allocation_id',p_allocation,'source_anchor',a->'source_anchor','credited_source_anchor',a->'credited_source_anchor',
 'amount_minor',a->'amount_minor','currency',h.currency,'source_status',a->'status','source_currentness','saved_receiver_heads_only','authority_scope','local_project_only','credit_eligible',false,'remaining_coverage','unavailable','eac_minor',null,'shadow_only',true);
 exception when no_data_found or too_many_rows then return unresolved||jsonb_build_object('reason','unambiguous_credit_allocation_required');end;$$;
revoke all on function operations_economy_private.credit_assignment_source_proof_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;

create function operations_economy_private.assign_obligation_own_credit_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare
 org uuid;actor uuid:=auth.uid();key text;proof jsonb;anchor text;head public.operations_obligation_credit_assignment_heads%rowtype;prior public.operations_obligation_credit_assignments%rowtype;event public.operations_obligation_credit_assignments%rowtype;
 owner public.operations_project_obligation_source_ownership%rowtype;expected bigint;next_revision bigint;begin
 perform operations_economy_private.validate_obligation_command_common_v1(p,array['schema_version','project_id','obligation_id','expected_baseline_revision','credit_snapshot_id','credit_allocation_id','expected_credit_economic_revision','expected_credit_economic_fingerprint','expected_original_binding_event_id','expected_assignment_revision','idempotency_key','reason'],'operations-obligation-credit-assign.v1');
 foreach key in array array['credit_snapshot_id','credit_allocation_id','expected_original_binding_event_id'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_credit_assignment_uuid' using errcode='22023';end if;end loop;
 foreach key in array array['expected_baseline_revision','expected_credit_economic_revision','expected_assignment_revision'] loop
 if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric) or (p->>key)::numeric not between (case when key='expected_assignment_revision' then 0 else 1 end) and (case when key='expected_assignment_revision' then 9007199254740990 else 9007199254740991 end) then raise exception 'invalid_credit_assignment_revision' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'expected_credit_economic_fingerprint') is distinct from 'string' or p->>'expected_credit_economic_fingerprint' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_credit_assignment_economic_fingerprint' using errcode='22023';end if;
 org:=operations_economy_private.authorize_obligation_admin_v1((p->>'project_id')::uuid);perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 select * into prior from public.operations_obligation_credit_assignments where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if prior.command<>p or prior.actor_system_user_id<>actor then raise exception 'credit_assignment_idempotency_conflict' using errcode='23505';end if;
 return jsonb_build_object('outcome','replayed','event_id',prior.event_id,'revision',prior.revision,'source_anchor',prior.source_anchor,'receipt_currentness','historical_provenance_only','credit_eligible',false,'eac_minor',null);end if;
 proof:=operations_economy_private.credit_assignment_source_proof_v1(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,(p->>'credit_snapshot_id')::uuid,(p->>'credit_allocation_id')::uuid,(p->>'expected_original_binding_event_id')::uuid,(p->>'expected_baseline_revision')::bigint);
 if proof->>'state'<>'source_bound' then raise exception 'current_bound_original_and_own_credit_required' using errcode='22023';end if;
 if (proof->>'credit_economic_revision')::bigint<>(p->>'expected_credit_economic_revision')::bigint or proof->>'credit_economic_fingerprint'<>p->>'expected_credit_economic_fingerprint' then raise exception 'credit_assignment_economic_cas_conflict' using errcode='22023';end if;
 anchor:=proof->>'source_anchor';expected:=(p->>'expected_assignment_revision')::bigint;
 select * into owner from public.operations_project_obligation_source_ownership where organization_id=org and source_anchor=anchor;
 if found and (owner.project_id<>(p->>'project_id')::uuid or owner.obligation_id<>(p->>'obligation_id')::uuid) then raise exception 'permanent_credit_source_owner_conflict' using errcode='23505';end if;
 select * into head from public.operations_obligation_credit_assignment_heads where organization_id=org and source_anchor=anchor for update;
 if coalesce(head.current_revision,0)<>expected then return jsonb_build_object('outcome','stale','current_revision',coalesce(head.current_revision,0),'credit_eligible',false,'eac_minor',null);end if;
 next_revision:=expected+1;
 if owner.source_anchor is null then insert into public.operations_project_obligation_source_ownership values(org,anchor,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid);end if;
 if head.source_anchor is null then insert into public.operations_obligation_credit_assignment_heads values(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,anchor,next_revision);end if;
 insert into public.operations_obligation_credit_assignments(organization_id,project_id,obligation_id,source_anchor,revision,baseline_event_id,original_binding_event_id,credit_snapshot_id,credit_allocation_id,proof,proof_fingerprint,actor_system_user_id,reason,idempotency_key,command)
 values(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,anchor,next_revision,(proof->>'baseline_event_id')::uuid,(p->>'expected_original_binding_event_id')::uuid,(p->>'credit_snapshot_id')::uuid,(p->>'credit_allocation_id')::uuid,proof,encode(sha256(convert_to(proof::text,'UTF8')),'hex'),actor,p->>'reason',p->>'idempotency_key',p) returning * into event;
 if head.source_anchor is not null then update public.operations_obligation_credit_assignment_heads set current_revision=next_revision where organization_id=org and source_anchor=anchor;end if;
 return jsonb_build_object('outcome','accepted','event_id',event.event_id,'revision',next_revision,'source_anchor',anchor,'receipt_currentness','saved_assignment_only','credit_eligible',false,'remaining_coverage','unavailable','eac_minor',null,'shadow_only',true);
end;$$;
revoke all on function operations_economy_private.assign_obligation_own_credit_v1(jsonb) from public,anon,service_role;
grant execute on function operations_economy_private.assign_obligation_own_credit_v1(jsonb) to authenticated;
create function public.assign_operations_obligation_own_credit_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.assign_obligation_own_credit_v1(p_command);$$;
revoke all on function public.assign_operations_obligation_own_credit_v1(jsonb) from public,anon,service_role;
grant execute on function public.assign_operations_obligation_own_credit_v1(jsonb) to authenticated;

create function operations_economy_private.read_obligation_own_credit_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text)
returns jsonb language plpgsql security definer set search_path='' as $$declare event public.operations_obligation_credit_assignments%rowtype;proof jsonb;
 unresolved jsonb:=jsonb_build_object('schema_version','operations-obligation-own-credit-read.v1','state','unresolved','authority_scope','local_project_only','source_currentness','saved_receiver_heads_only','credit_eligible',false,'remaining_coverage','unavailable','eac_minor',null,'shadow_only',true);
begin
 if p_org is null or p_project is null or p_obligation is null or p_anchor is null or p_anchor !~ '^[0-9a-f]{64}$' then raise exception 'invalid_own_credit_read_selector' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||p_org,0));
 select e.* into event from public.operations_obligation_credit_assignment_heads h join public.operations_obligation_credit_assignments e on e.organization_id=h.organization_id and e.source_anchor=h.source_anchor and e.revision=h.current_revision where h.organization_id=p_org and h.project_id=p_project and h.obligation_id=p_obligation and h.source_anchor=p_anchor;
 if not found then return unresolved||jsonb_build_object('reason','missing_own_credit_assignment');end if;
 if not exists(select 1 from public.operations_project_obligation_source_ownership where organization_id=p_org and project_id=p_project and obligation_id=p_obligation and source_anchor=p_anchor) then return unresolved||jsonb_build_object('reason','missing_permanent_own_credit_owner');end if;
 proof:=operations_economy_private.credit_assignment_source_proof_v1(p_org,p_project,p_obligation,event.credit_snapshot_id,event.credit_allocation_id,event.original_binding_event_id,(event.proof->>'baseline_revision')::bigint);
 if proof->>'state'<>'source_bound' or proof is distinct from event.proof or event.proof_fingerprint<>encode(sha256(convert_to(event.proof::text,'UTF8')),'hex') then return unresolved||jsonb_build_object('reason','changed_assignment_source_proof','event_id',event.event_id);end if;
 return unresolved||jsonb_build_object('state','assigned','event_id',event.event_id,'revision',event.revision,'proof',event.proof,'proof_fingerprint',event.proof_fingerprint);
end;$$;
revoke all on function operations_economy_private.read_obligation_own_credit_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function operations_economy_private.read_obligation_own_credit_v1(uuid,uuid,uuid,text) to service_role;
create function public.read_operations_obligation_own_credit_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid,p_source_anchor text)
returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_obligation_own_credit_v1(p_organization_id,p_project_id,p_obligation_id,p_source_anchor);$$;
revoke all on function public.read_operations_obligation_own_credit_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_operations_obligation_own_credit_v1(uuid,uuid,uuid,text) to service_role;
