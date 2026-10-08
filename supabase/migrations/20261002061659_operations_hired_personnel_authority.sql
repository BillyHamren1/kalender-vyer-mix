-- Default-off metadata authority. No existing cost writer, receiver or total changes.
create schema operations_hired_private;
revoke all on schema operations_hired_private from public,anon,authenticated,service_role;
grant usage on schema operations_hired_private to authenticated,service_role;
create table public.operations_hired_authority_gates(organization_id uuid primary key,enabled boolean not null default false);
create table public.operations_hired_basis_events(
 event_id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),baseline_event_id uuid not null references public.operations_project_obligation_baselines(event_id),
 baseline_revision bigint not null,baseline_fingerprint text not null,cost_basis text not null check(cost_basis in ('invoice','time')),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 actor_system_user_id uuid not null,reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,obligation_id,revision),unique(organization_id,idempotency_key));
create table public.operations_hired_basis_heads(organization_id uuid not null,obligation_id uuid not null,current_revision bigint not null check(current_revision between 1 and 9007199254740991),primary key(organization_id,obligation_id));
create table public.operations_hired_source_ownership(
 organization_id uuid not null,source_identity text not null check(source_identity ~ '^[0-9a-f]{64}$'),project_id uuid not null,obligation_id uuid not null,
 source_kind text not null check(source_kind in ('time','catering')),source_stream_id text not null,source_line_id text not null,
 primary key(organization_id,source_identity),unique(organization_id,source_kind,source_stream_id,source_line_id));
create table public.operations_hired_assignment_events(
 event_id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,
 source_identity text not null,revision bigint not null check(revision between 1 and 9007199254740991),basis_event_id uuid not null references public.operations_hired_basis_events(event_id),
 invoice_binding_event_id uuid not null references public.operations_project_obligation_invoice_bindings(event_id),
 source_kind text not null check(source_kind in ('time','catering')),source_stream_id text not null,source_line_id text not null,source_revision bigint not null,
 publication_fingerprint text not null check(publication_fingerprint ~ '^[0-9a-f]{64}$'),source_metadata jsonb not null,invoice_economic_fingerprint text not null,invoice_economic_revision bigint not null,
 replaces_estimate_minor bigint not null check(replaces_estimate_minor=0),consumes_commitment_minor bigint not null check(consumes_commitment_minor=0),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),actor_system_user_id uuid not null,reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 foreign key(organization_id,source_identity) references public.operations_hired_source_ownership(organization_id,source_identity),
 unique(organization_id,source_identity,revision),unique(organization_id,idempotency_key));
create table public.operations_hired_assignment_heads(organization_id uuid not null,source_identity text not null,current_revision bigint not null check(current_revision between 1 and 9007199254740991),primary key(organization_id,source_identity));

do $$declare t text;begin
 foreach t in array array['operations_hired_authority_gates','operations_hired_basis_events','operations_hired_basis_heads','operations_hired_source_ownership','operations_hired_assignment_events','operations_hired_assignment_heads'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to service_role',t);
 end loop;
 foreach t in array array['operations_hired_basis_events','operations_hired_source_ownership','operations_hired_assignment_events'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.operations_personnel_evidence_immutable()',t||'_immutable',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);
 end loop;end;$$;
grant insert,update on public.operations_hired_authority_gates to service_role;
create function operations_hired_private.head_guard_v1() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'hired_head_delete_denied' using errcode='55000';end if;
 if tg_table_name='operations_hired_authority_gates' then
 if new.organization_id is distinct from old.organization_id then raise exception 'hired_gate_identity_denied' using errcode='55000';end if;return new;end if;
 if (tg_op='INSERT' and new.current_revision<>1) or (tg_op='UPDATE' and ((to_jsonb(new)-'current_revision') is distinct from (to_jsonb(old)-'current_revision') or new.current_revision<>old.current_revision+1)) then raise exception 'hired_head_advance_denied' using errcode='55000';end if;
 if tg_table_name='operations_hired_basis_heads' then
 if not exists(select 1 from public.operations_hired_basis_events e where e.organization_id=new.organization_id and e.obligation_id=new.obligation_id and e.revision=new.current_revision) then raise exception 'hired_saved_basis_required' using errcode='55000';end if;
 else if not exists(select 1 from public.operations_hired_assignment_events e where e.organization_id=new.organization_id and e.source_identity=new.source_identity and e.revision=new.current_revision) then raise exception 'hired_saved_assignment_required' using errcode='55000';end if;end if;return new;end;$$;
revoke all on function operations_hired_private.head_guard_v1() from public,anon,authenticated,service_role;
create trigger hired_gate_identity before update or delete on public.operations_hired_authority_gates for each row execute function operations_hired_private.head_guard_v1();
do $$declare t text;begin foreach t in array array['operations_hired_authority_gates','operations_hired_basis_heads','operations_hired_assignment_heads'] loop
 if t<>'operations_hired_authority_gates' then execute format('create trigger %I before insert or update or delete on public.%I for each row execute function operations_hired_private.head_guard_v1()',t||'_guard',t);end if;
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.operations_personnel_evidence_immutable()',t||'_no_truncate',t);end loop;end;$$;

create function operations_hired_private.fingerprint_v1(p jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(operations_economy_private.canonical_json_v1(p),'UTF8')),'hex');$$;
create function operations_hired_private.source_identity_v1(p_org uuid,p_kind text,p_stream text,p_line text) returns text language sql immutable set search_path='' as $$select operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-source-identity-v1',p_org::text,p_kind,p_stream,p_line));$$;
create function operations_hired_private.check_gate_v1(p_org uuid) returns void language plpgsql set search_path='' as $$begin
 perform 1 from public.operations_hired_authority_gates where organization_id=p_org and enabled for share;
 if not found then raise exception 'hired_authority_disabled' using errcode='42501';end if;end;$$;
create function operations_hired_private.counter_v1(p jsonb,p_min bigint) returns boolean language sql immutable set search_path='' as $$select case when jsonb_typeof(p)='number' then p::text::numeric=trunc(p::text::numeric) and p::text::numeric between p_min and 9007199254740990 else false end;$$;

-- Reads the actual saved source under its existing writer's stream lock.
create function operations_hired_private.source_metadata_v1(p_org uuid,p_project uuid,p_obligation uuid,p_kind text,p_stream text,p_revision bigint,p_line text,p_fp text) returns jsonb language plpgsql set search_path='' as $$
declare publication jsonb;line jsonb;raw_snapshot jsonb;block jsonb;head_revision bigint;worker uuid;metadata jsonb;outbox public.operations_personnel_cost_outbox%rowtype;cp public.operations_catering_cost_publications%rowtype;observation public.operations_catering_source_observations%rowtype;target public.operations_personnel_target_bindings%rowtype;begin
 if p_kind='time' then
 select current_revision,worker_id into head_revision,worker from public.operations_personnel_cost_streams where organization_id=p_org and source_time_stream_id=p_stream for share;
 if not found or head_revision is distinct from p_revision then raise exception 'hired_source_head_changed' using errcode='PT409';end if;
 select cost_snapshot,raw_time_snapshot into publication,raw_snapshot from public.operations_personnel_cost_publications where organization_id=p_org and source_time_stream_id=p_stream and source_revision=p_revision;
 if not found then raise exception 'hired_saved_source_missing' using errcode='22023';end if;
 select value into strict line from jsonb_array_elements(publication->'lines') where value->>'source_time_line_id'=p_line;
 select value into strict block from jsonb_array_elements(raw_snapshot->'blocks') where value->>'id'=p_line;
 select * into target from public.operations_personnel_target_bindings where organization_id=p_org and source_system=block#>>'{target,sourceSystem}' and target_kind=block#>>'{target,kind}' and external_id=block#>>'{target,externalId}' and target_version=block#>>'{target,version}';
 if not found or target.source_project_id is distinct from p_project or target.source_project_id::text is distinct from line->>'source_project_id' or target.currency is distinct from line->>'currency' or target.source_booking_id is distinct from (line->>'source_booking_id')::uuid or line->'minutes' is distinct from block->'durationMinutes' then raise exception 'hired_time_target_provenance_denied' using errcode='42501';end if;
 select * into outbox from public.operations_personnel_cost_outbox where organization_id=p_org and source_time_stream_id=p_stream and source_revision=p_revision;
 if not found or outbox.raw_body::jsonb is distinct from publication or encode(sha256(convert_to(outbox.raw_body,'UTF8')),'hex') is distinct from outbox.body_sha256
 or outbox.source_evidence->>'raw_snapshot' is null or (outbox.source_evidence->>'raw_snapshot')::jsonb is distinct from raw_snapshot
 or encode(sha256(convert_to(outbox.source_evidence->>'raw_snapshot','UTF8')),'hex') is distinct from outbox.source_evidence->>'raw_snapshot_sha256'
 or raw_snapshot->>'snapshotHash' is distinct from publication->>'source_snapshot_hash' or outbox.source_evidence->>'submission_state' in ('voided','rejected') then raise exception 'hired_time_evidence_denied' using errcode='42501';end if;
 metadata:=jsonb_build_object('source_status',outbox.source_evidence->>'submission_state','project_cost_status',line->>'status','currency',line->>'currency','minutes',line->'minutes','amount_minor',line->'amount_minor','coverage',line->>'coverage');
 elsif p_kind='catering' then
 select current_revision,worker_id into head_revision,worker from public.operations_catering_cost_streams where organization_id=p_org and source_stream_id=p_stream for share;
 if not found or head_revision is distinct from p_revision then raise exception 'hired_source_head_changed' using errcode='PT409';end if;
 select * into cp from public.operations_catering_cost_publications where organization_id=p_org and source_stream_id=p_stream and source_revision=p_revision;
 if not found then raise exception 'hired_saved_source_missing' using errcode='22023';end if;publication:=cp.snapshot;
 select * into observation from public.operations_catering_source_observations where organization_id=p_org and id=cp.observation_id;
 if not found or observation.time_entry_id::text is distinct from p_line or publication->>'source_time_entry_id' is distinct from p_line or publication->>'project_id' is distinct from p_project::text or publication->>'obligation_id' is distinct from p_obligation::text
 or observation.entry_version is distinct from (publication->>'source_time_entry_version')::integer
 or observation.catering_organization_id::text is distinct from publication->>'source_organization_id' or observation.person_id::text is distinct from publication->>'source_person_id'
 or observation.raw_entry::jsonb->>'status' is distinct from publication->>'source_status' or observation.source_fingerprint is distinct from publication->>'source_fingerprint'
 or encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(observation.raw_entry::jsonb),'UTF8')),'hex') is distinct from observation.source_fingerprint
 or encode(sha256(convert_to(observation.raw_entry,'UTF8')),'hex') is distinct from observation.raw_entry_sha256 then raise exception 'hired_catering_saved_scope_denied' using errcode='42501';end if;
 perform 1 from public.operations_catering_project_mappings where id=cp.mapping_id and organization_id=p_org and worker_id=worker and project_id=p_project and obligation_id=p_obligation and time_entry_id=observation.time_entry_id and currency=publication->>'currency' and mapping_revision=publication->>'mapping_revision';
 if not found then raise exception 'hired_catering_mapping_provenance_denied' using errcode='42501';end if;
 metadata:=jsonb_build_object('source_status',publication->>'source_status','project_cost_status',publication->>'project_review_status','currency',publication->>'currency','minutes',publication->'minutes','amount_minor',publication->'amount_minor','coverage',publication->>'coverage');
 else raise exception 'unsupported_hired_source' using errcode='22023';end if;
 if publication->>'organization_id' is distinct from p_org::text or publication->>'worker_id' is distinct from worker::text or operations_hired_private.fingerprint_v1(jsonb_build_array('operations-hired-personnel-publication-fingerprint-v1',p_kind,publication)) is distinct from p_fp then raise exception 'hired_publication_fingerprint_changed' using errcode='PT409';end if;
 if metadata->>'project_cost_status' is null or metadata->>'project_cost_status' not in ('preliminary','confirmed') or metadata->>'source_status' is null or metadata->>'source_status' in ('rejected','voided') then raise exception 'hired_rejected_source_denied' using errcode='42501';end if;
 if metadata->>'coverage'='missing_rate' and metadata->'amount_minor' is distinct from 'null'::jsonb then raise exception 'hired_missing_rate_must_be_null' using errcode='22023';end if;
 return metadata||jsonb_build_object('source_kind',p_kind,'source_stream_id',p_stream,'source_line_id',p_line,'source_revision',p_revision,'publication_fingerprint',p_fp,'worker_id',worker,'project_id',p_project,'source_currentness','saved_publication_head_only');
end;$$;

create function operations_hired_private.lock_invoice_binding_v1(p_org uuid,p_project uuid,p_obligation uuid,p_binding uuid) returns void language plpgsql set search_path='' as $$declare binding public.operations_project_obligation_invoice_bindings%rowtype;begin
 select * into binding from public.operations_project_obligation_invoice_bindings where event_id=p_binding and organization_id=p_org and project_id=p_project and obligation_id=p_obligation;
 if not found then raise exception 'hired_invoice_binding_denied' using errcode='42501';end if;
 perform operations_invoice_private.lock_invoice_economic_sources_v1(p_org,jsonb_build_array(jsonb_build_object('source_organization_id',binding.source_organization_id,'invoice_id',binding.invoice_id)));end;$$;
create function operations_hired_private.invoice_evidence_v1(p_org uuid,p_project uuid,p_obligation uuid,p_binding uuid) returns jsonb language plpgsql set search_path='' as $$
declare binding public.operations_project_obligation_invoice_bindings%rowtype;original jsonb;unified public.operations_finance_invoice_economic_current_v2%rowtype;begin
 select * into binding from public.operations_project_obligation_invoice_bindings where event_id=p_binding and organization_id=p_org and project_id=p_project and obligation_id=p_obligation;
 if not found then raise exception 'hired_invoice_binding_denied' using errcode='42501';end if;
 perform operations_invoice_private.lock_invoice_economic_sources_v1(p_org,jsonb_build_array(jsonb_build_object('source_organization_id',binding.source_organization_id,'invoice_id',binding.invoice_id)));
 original:=operations_economy_private.read_obligation_original_v1(p_org,p_project,p_obligation,binding.source_anchor);
 select * into unified from public.operations_finance_invoice_economic_current_v2 where organization_id=p_org and source_organization_id=binding.source_organization_id and invoice_id=binding.invoice_id;
 if original->>'state' is distinct from 'bound_original' or original->>'binding_event_id' is distinct from p_binding::text or unified.source_currentness is distinct from 'saved_receiver_heads_only' or unified.source_economic_revision is distinct from binding.source_economic_revision or unified.source_economic_fingerprint is distinct from binding.source_economic_fingerprint then raise exception 'hired_invoice_relation_changed' using errcode='PT409';end if;
 return jsonb_build_object('binding_event_id',binding.event_id,'source_anchor',binding.source_anchor,'source_economic_revision',binding.source_economic_revision,'source_economic_fingerprint',binding.source_economic_fingerprint,'currency',binding.currency);
end;$$;

create function operations_hired_private.append_basis_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();baseline public.operations_project_obligation_baselines%rowtype;event public.operations_hired_basis_events%rowtype;current_revision bigint;document jsonb;begin
 perform operations_economy_private.validate_obligation_command_common_v1(p,array['schema_version','project_id','obligation_id','baseline_event_id','expected_obligation_revision','expected_basis_revision','cost_basis','evidence_sha256','idempotency_key','reason'],'operations-hired-basis.v1');
 if jsonb_typeof(p->'baseline_event_id') is distinct from 'string' or p->>'baseline_event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not operations_hired_private.counter_v1(p->'expected_obligation_revision',1) or not operations_hired_private.counter_v1(p->'expected_basis_revision',0)
 or jsonb_typeof(p->'cost_basis') is distinct from 'string' or p->>'cost_basis' not in ('invoice','time') or jsonb_typeof(p->'evidence_sha256') is distinct from 'string' or p->>'evidence_sha256' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_hired_basis' using errcode='22023';end if;
 org:=operations_economy_private.authorize_obligation_admin_v1((p->>'project_id')::uuid);perform operations_hired_private.check_gate_v1(org);perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 select * into event from public.operations_hired_basis_events where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if event.command<>p or event.actor_system_user_id<>actor then raise exception 'hired_basis_idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('outcome','replayed','event_id',event.event_id,'revision',event.revision,'fingerprint',event.fingerprint,'historical_only',true);end if;
 select b.* into baseline from public.operations_project_obligation_heads h join public.operations_project_obligation_baselines b on b.organization_id=h.organization_id and b.obligation_id=h.obligation_id and b.revision=h.current_revision where h.organization_id=org and h.project_id=(p->>'project_id')::uuid and h.obligation_id=(p->>'obligation_id')::uuid for share of h;
 if not found or baseline.event_id is distinct from (p->>'baseline_event_id')::uuid or baseline.revision is distinct from (p->>'expected_obligation_revision')::bigint then raise exception 'hired_baseline_changed' using errcode='PT409';end if;
 if baseline.category<>'personnel' or baseline.cost_basis<>p->>'cost_basis' then raise exception 'hired_baseline_basis_mismatch' using errcode='22023';end if;
 select h.current_revision into current_revision from public.operations_hired_basis_heads h where h.organization_id=org and h.obligation_id=baseline.obligation_id for update;current_revision:=coalesce(current_revision,0);
 if current_revision<>(p->>'expected_basis_revision')::bigint then raise exception 'hired_basis_revision_conflict' using errcode='PT409';end if;
 document:=jsonb_build_object('schema_version','operations-hired-basis-evidence.v1','organization_id',org,'project_id',baseline.project_id,'obligation_id',baseline.obligation_id,'revision',current_revision+1,'baseline_event_id',baseline.event_id,'baseline_revision',baseline.revision,'baseline_fingerprint',baseline.fingerprint,'cost_basis',baseline.cost_basis,'evidence_sha256',p->>'evidence_sha256');
 insert into public.operations_hired_basis_events(organization_id,project_id,obligation_id,revision,baseline_event_id,baseline_revision,baseline_fingerprint,cost_basis,evidence_sha256,fingerprint,actor_system_user_id,reason,idempotency_key,command)
 values(org,baseline.project_id,baseline.obligation_id,current_revision+1,baseline.event_id,baseline.revision,baseline.fingerprint,baseline.cost_basis,p->>'evidence_sha256',operations_hired_private.fingerprint_v1(document),actor,p->>'reason',p->>'idempotency_key',p) returning * into event;
 if current_revision=0 then insert into public.operations_hired_basis_heads values(org,baseline.obligation_id,event.revision);else update public.operations_hired_basis_heads set current_revision=event.revision where organization_id=org and obligation_id=baseline.obligation_id;end if;
 return jsonb_build_object('outcome','accepted','event_id',event.event_id,'revision',event.revision,'fingerprint',event.fingerprint,'historical_only',false);end;$$;

create function operations_hired_private.assign_source_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();basis public.operations_hired_basis_events%rowtype;baseline public.operations_project_obligation_baselines%rowtype;event public.operations_hired_assignment_events%rowtype;owner public.operations_hired_source_ownership%rowtype;invoice jsonb;metadata jsonb;identity text;current_revision bigint;document jsonb;kind text;line_id text;begin
 perform operations_economy_private.validate_obligation_command_common_v1(p,array['schema_version','project_id','obligation_id','basis_event_id','expected_assignment_revision','source_kind','source_stream_id','source_revision','source_line_id','expected_source_fingerprint','invoice_binding_event_id','replaces_estimate_minor','consumes_commitment_minor','idempotency_key','reason'],'operations-hired-operational-source-assign.v1');
 if jsonb_typeof(p->'basis_event_id') is distinct from 'string' or p->>'basis_event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(p->'invoice_binding_event_id') is distinct from 'string' or p->>'invoice_binding_event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or not operations_hired_private.counter_v1(p->'expected_assignment_revision',0) or not operations_hired_private.counter_v1(p->'source_revision',1)
 or jsonb_typeof(p->'source_kind') is distinct from 'string' or p->>'source_kind' not in ('time','catering') or jsonb_typeof(p->'source_stream_id') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'source_stream_id',256)
 or jsonb_typeof(p->'source_line_id') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'source_line_id',256)
 or jsonb_typeof(p->'expected_source_fingerprint') is distinct from 'string' or p->>'expected_source_fingerprint' !~ '^[0-9a-f]{64}$'
 or p->'replaces_estimate_minor' is distinct from '0'::jsonb or p->'consumes_commitment_minor' is distinct from '0'::jsonb then raise exception 'invalid_hired_assignment' using errcode='22023';end if;
 kind:=p->>'source_kind';line_id:=p->>'source_line_id';if kind='catering' then
 if line_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_hired_catering_line_selector' using errcode='22023';end if;
 line_id:=line_id::uuid::text;end if;
 org:=operations_economy_private.authorize_obligation_admin_v1((p->>'project_id')::uuid);perform operations_hired_private.check_gate_v1(org);perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 select * into event from public.operations_hired_assignment_events where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if event.command<>p or event.actor_system_user_id<>actor then raise exception 'hired_assignment_idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('outcome','replayed','event_id',event.event_id,'revision',event.revision,'fingerprint',event.fingerprint,'historical_only',true);end if;
 perform operations_hired_private.lock_invoice_binding_v1(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,(p->>'invoice_binding_event_id')::uuid);
 metadata:=operations_hired_private.source_metadata_v1(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,kind,p->>'source_stream_id',(p->>'source_revision')::bigint,line_id,p->>'expected_source_fingerprint');
 invoice:=operations_hired_private.invoice_evidence_v1(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,(p->>'invoice_binding_event_id')::uuid);
 select e.* into basis from public.operations_hired_basis_events e join public.operations_hired_basis_heads h on h.organization_id=e.organization_id and h.obligation_id=e.obligation_id and h.current_revision=e.revision where e.event_id=(p->>'basis_event_id')::uuid and e.organization_id=org and e.project_id=(p->>'project_id')::uuid and e.obligation_id=(p->>'obligation_id')::uuid;
 select b.* into baseline from public.operations_project_obligation_heads h join public.operations_project_obligation_baselines b on b.organization_id=h.organization_id and b.obligation_id=h.obligation_id and b.revision=h.current_revision where h.organization_id=org and h.obligation_id=(p->>'obligation_id')::uuid for share of h;
 if basis.event_id is null or baseline.event_id is distinct from basis.baseline_event_id then raise exception 'hired_basis_or_baseline_changed' using errcode='PT409';end if;
 if basis.cost_basis<>'invoice' or baseline.cost_basis<>'invoice' or baseline.category<>'personnel' or metadata->>'currency' is distinct from baseline.currency or invoice->>'currency' is distinct from baseline.currency then raise exception 'hired_invoice_basis_currency_required' using errcode='42501';end if;
 identity:=operations_hired_private.source_identity_v1(org,kind,p->>'source_stream_id',line_id);
 select * into owner from public.operations_hired_source_ownership where organization_id=org and source_identity=identity;
 if found and (owner.project_id,owner.obligation_id,owner.source_kind,owner.source_stream_id,owner.source_line_id) is distinct from (baseline.project_id,baseline.obligation_id,kind,p->>'source_stream_id',line_id) then raise exception 'hired_permanent_source_owner_conflict' using errcode='42501';end if;
 select h.current_revision into current_revision from public.operations_hired_assignment_heads h where h.organization_id=org and h.source_identity=identity for update;current_revision:=coalesce(current_revision,0);
 if current_revision<>(p->>'expected_assignment_revision')::bigint then raise exception 'hired_assignment_revision_conflict' using errcode='PT409';end if;
 insert into public.operations_hired_source_ownership values(org,identity,baseline.project_id,baseline.obligation_id,kind,p->>'source_stream_id',line_id) on conflict do nothing;
 document:=jsonb_build_object('schema_version','operations-hired-source-assignment-evidence.v1','organization_id',org,'project_id',baseline.project_id,'obligation_id',baseline.obligation_id,'source_identity',identity,'revision',current_revision+1,'basis_event_id',basis.event_id,'invoice',invoice,'source',metadata,'disposition','operational_only','replaces_estimate_minor',0,'consumes_commitment_minor',0);
 insert into public.operations_hired_assignment_events(organization_id,project_id,obligation_id,source_identity,revision,basis_event_id,invoice_binding_event_id,source_kind,source_stream_id,source_line_id,source_revision,publication_fingerprint,source_metadata,invoice_economic_fingerprint,invoice_economic_revision,replaces_estimate_minor,consumes_commitment_minor,fingerprint,actor_system_user_id,reason,idempotency_key,command)
 values(org,baseline.project_id,baseline.obligation_id,identity,current_revision+1,basis.event_id,(p->>'invoice_binding_event_id')::uuid,kind,p->>'source_stream_id',line_id,(p->>'source_revision')::bigint,p->>'expected_source_fingerprint',metadata,invoice->>'source_economic_fingerprint',(invoice->>'source_economic_revision')::bigint,0,0,operations_hired_private.fingerprint_v1(document),actor,p->>'reason',p->>'idempotency_key',p) returning * into event;
 if current_revision=0 then insert into public.operations_hired_assignment_heads values(org,identity,event.revision);else update public.operations_hired_assignment_heads set current_revision=event.revision where organization_id=org and source_identity=identity;end if;
 return jsonb_build_object('outcome','accepted','event_id',event.event_id,'revision',event.revision,'fingerprint',event.fingerprint,'source_identity',identity,'historical_only',false);end;$$;

-- Narrow service metadata read; current state is re-derived, never reusable permission.
create function operations_hired_private.read_source_v1(p_org uuid,p_project uuid,p_obligation uuid,p_identity text) returns jsonb language plpgsql security definer set search_path='' as $$
declare event public.operations_hired_assignment_events%rowtype;basis public.operations_hired_basis_events%rowtype;baseline public.operations_project_obligation_baselines%rowtype;invoice jsonb;metadata jsonb;reason text;result jsonb;begin
 if p_org is null or p_project is null or p_obligation is null or p_identity is null or p_identity !~ '^[0-9a-f]{64}$' then raise exception 'invalid_hired_read_selector' using errcode='22023';end if;
 perform 1 from public.projects where id=p_project and organization_id=p_org and deleted_at is null for share;if not found then raise exception 'hired_read_project_denied' using errcode='42501';end if;
 result:=jsonb_build_object('schema_version','operations-hired-source-authority.v1','organization_id',p_org,'project_id',p_project,'obligation_id',p_obligation,'source_identity',p_identity,'state','unresolved','current_source',null,'historical_source',null,'category_coverage','unavailable','source_coverage','unavailable','eac_minor',null,'remaining_minor',null,'shadow_only',true,'credit_eligible',false);
 begin perform operations_hired_private.check_gate_v1(p_org);exception when insufficient_privilege then return result||jsonb_build_object('reason','authority_disabled');end;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||p_org,0));
 select e.* into event from public.operations_hired_assignment_events e join public.operations_hired_assignment_heads h on h.organization_id=e.organization_id and h.source_identity=e.source_identity and h.current_revision=e.revision where e.organization_id=p_org and e.project_id=p_project and e.obligation_id=p_obligation and e.source_identity=p_identity;
 if not found then return result||jsonb_build_object('reason','no_assignment');end if;
 result:=result||jsonb_build_object('assignment_event_id',event.event_id,'assignment_revision',event.revision,'assignment_fingerprint',event.fingerprint,'basis_event_id',event.basis_event_id,'invoice_binding_event_id',event.invoice_binding_event_id,'historical_source',event.source_metadata,'disposition','operational_only','replaces_estimate_minor',0,'consumes_commitment_minor',0);
 begin
 perform operations_hired_private.lock_invoice_binding_v1(p_org,p_project,p_obligation,event.invoice_binding_event_id);
 metadata:=operations_hired_private.source_metadata_v1(p_org,p_project,p_obligation,event.source_kind,event.source_stream_id,event.source_revision,event.source_line_id,event.publication_fingerprint);
 invoice:=operations_hired_private.invoice_evidence_v1(p_org,p_project,p_obligation,event.invoice_binding_event_id);
 select e.* into basis from public.operations_hired_basis_events e join public.operations_hired_basis_heads h on h.organization_id=e.organization_id and h.obligation_id=e.obligation_id and h.current_revision=e.revision where e.event_id=event.basis_event_id;
 select b.* into baseline from public.operations_project_obligation_heads h join public.operations_project_obligation_baselines b on b.organization_id=h.organization_id and b.obligation_id=h.obligation_id and b.revision=h.current_revision where h.organization_id=p_org and h.obligation_id=p_obligation for share of h;
 if basis.event_id is null or baseline.event_id is distinct from basis.baseline_event_id then reason:='basis_or_baseline_changed';
 elsif metadata->>'currency' is distinct from baseline.currency or invoice->>'currency' is distinct from baseline.currency then reason:='currency_changed';
 elsif invoice->>'source_economic_fingerprint' is distinct from event.invoice_economic_fingerprint or (invoice->>'source_economic_revision')::bigint is distinct from event.invoice_economic_revision then reason:='invoice_economics_changed';end if;
 exception when sqlstate 'PT409' then reason:='source_or_invoice_changed';when insufficient_privilege then reason:='source_or_invoice_denied';when no_data_found or too_many_rows then reason:='saved_source_line_unavailable';end;
 if reason is not null then return result||jsonb_build_object('reason',reason);end if;
 return result||jsonb_build_object('state','current_operational_only','reason',null,'current_source',metadata);end;$$;

do $$declare f record;begin for f in select p.oid::regprocedure identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_hired_private' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.identity);end loop;end;$$;
grant execute on function operations_hired_private.append_basis_v1(jsonb),operations_hired_private.assign_source_v1(jsonb) to authenticated;
grant execute on function operations_hired_private.read_source_v1(uuid,uuid,uuid,text) to service_role;
create function public.append_operations_hired_basis_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_hired_private.append_basis_v1(p_command);$$;
create function public.assign_operations_hired_operational_source_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_hired_private.assign_source_v1(p_command);$$;
create function public.read_operations_hired_operational_source_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid,p_source_identity text) returns jsonb language sql security invoker set search_path='' as $$select operations_hired_private.read_source_v1(p_organization_id,p_project_id,p_obligation_id,p_source_identity);$$;
revoke all on function public.append_operations_hired_basis_v1(jsonb),public.assign_operations_hired_operational_source_v1(jsonb),public.read_operations_hired_operational_source_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.append_operations_hired_basis_v1(jsonb),public.assign_operations_hired_operational_source_v1(jsonb) to authenticated;
grant execute on function public.read_operations_hired_operational_source_v1(uuid,uuid,uuid,text) to service_role;
