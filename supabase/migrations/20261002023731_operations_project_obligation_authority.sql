-- Genuine Operations-authored local authority, separate from isolated EAC evidence.
-- Dependencies: review canonical helpers, scope live-admin authorizer, inverse v1 receiver.
-- No forecast/publication/credit-delivery activation. Unified v1/v2 source selection is a later gate.
create table public.operations_project_obligation_heads (
 organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'),category text not null check(category in ('personnel','supplier','catering','other')),
 cost_basis text not null check(cost_basis in ('time','invoice','other')),current_revision bigint not null check(current_revision between 1 and 9007199254740991),
 primary key(organization_id,obligation_id)
);
create table public.operations_project_obligation_baselines (
 event_id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),evidence_basis text not null default 'operations_manual' check(evidence_basis='operations_manual'),
 authority_scope text not null default 'local_project_only' check(authority_scope='local_project_only'),
 currency text not null check(currency ~ '^[A-Z]{3}$'),category text not null check(category in ('personnel','supplier','catering','other')),
 cost_basis text not null check(cost_basis in ('time','invoice','other')),
 estimate_minor bigint check(estimate_minor between 0 and 9007199254740991),committed_minor bigint check(committed_minor between 0 and 9007199254740991),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),actor_system_user_id uuid not null,reason text not null,
 idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,obligation_id,revision),unique(organization_id,idempotency_key),
 foreign key(organization_id,obligation_id) references public.operations_project_obligation_heads(organization_id,obligation_id)
);
create table public.operations_project_obligation_source_ownership (
 organization_id uuid not null,source_anchor text not null check(source_anchor ~ '^[0-9a-f]{64}$'),project_id uuid not null,obligation_id uuid not null,
 primary key(organization_id,source_anchor),foreign key(organization_id,obligation_id) references public.operations_project_obligation_heads(organization_id,obligation_id)
);
create table public.operations_project_obligation_invoice_bindings (
 event_id uuid primary key default gen_random_uuid(),binding_sequence bigint generated always as identity unique check(binding_sequence between 1 and 9007199254740991),
 organization_id uuid not null,project_id uuid not null,obligation_id uuid not null,source_anchor text not null,
 baseline_event_id uuid not null references public.operations_project_obligation_baselines(event_id),authority_scope text not null default 'local_project_only' check(authority_scope='local_project_only'),
 source_snapshot_id uuid not null references public.operations_finance_invoice_snapshots(id),source_allocation_id uuid not null,
 source_organization_id uuid not null,invoice_id uuid not null,source_economic_revision bigint not null,
 source_economic_fingerprint text not null check(source_economic_fingerprint ~ '^[0-9a-f]{64}$'),source_raw_body_sha256 text not null,
 document_fingerprint text not null,currency text not null,amount_minor bigint not null check(amount_minor between 1 and 9007199254740991),
 source_status text not null check(source_status in ('preliminary','confirmed')),
 replaces_estimate_minor bigint check(replaces_estimate_minor is null),consumes_commitment_minor bigint check(consumes_commitment_minor is null),
 actor_system_user_id uuid not null,reason text not null,idempotency_key text not null,command jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,idempotency_key),foreign key(organization_id,source_anchor) references public.operations_project_obligation_source_ownership(organization_id,source_anchor)
);
create index operations_obligation_binding_head on public.operations_project_obligation_invoice_bindings(organization_id,source_anchor,binding_sequence desc);
alter table public.operations_project_obligation_heads enable row level security;
alter table public.operations_project_obligation_baselines enable row level security;
alter table public.operations_project_obligation_source_ownership enable row level security;
alter table public.operations_project_obligation_invoice_bindings enable row level security;
revoke all on public.operations_project_obligation_heads,public.operations_project_obligation_baselines,public.operations_project_obligation_source_ownership,public.operations_project_obligation_invoice_bindings from public,anon,authenticated,service_role;
grant select on public.operations_project_obligation_heads,public.operations_project_obligation_baselines,public.operations_project_obligation_source_ownership,public.operations_project_obligation_invoice_bindings to service_role;
create trigger operations_obligation_baselines_immutable before update or delete on public.operations_project_obligation_baselines for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_baselines_no_truncate before truncate on public.operations_project_obligation_baselines for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_ownership_immutable before update or delete on public.operations_project_obligation_source_ownership for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_ownership_no_truncate before truncate on public.operations_project_obligation_source_ownership for each statement execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_bindings_immutable before update or delete on public.operations_project_obligation_invoice_bindings for each row execute function public.operations_personnel_evidence_immutable();
create trigger operations_obligation_bindings_no_truncate before truncate on public.operations_project_obligation_invoice_bindings for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_economy_private.obligation_head_guard_v1() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op<>'UPDATE' or (new.organization_id,new.project_id,new.obligation_id,new.currency,new.category,new.cost_basis) is distinct from (old.organization_id,old.project_id,old.obligation_id,old.currency,old.category,old.cost_basis)
 or new.current_revision<>old.current_revision+1 or not exists(select 1 from public.operations_project_obligation_baselines b where b.organization_id=new.organization_id and b.obligation_id=new.obligation_id and b.revision=new.current_revision)
 then raise exception 'obligation_head_change_denied' using errcode='55000';end if;return new;end;$$;
revoke all on function operations_economy_private.obligation_head_guard_v1() from public,anon,authenticated,service_role;
create trigger operations_obligation_heads_guard before update or delete on public.operations_project_obligation_heads for each row execute function operations_economy_private.obligation_head_guard_v1();
create trigger operations_obligation_heads_no_truncate before truncate on public.operations_project_obligation_heads for each statement execute function public.operations_personnel_evidence_immutable();

create function operations_economy_private.authorize_obligation_admin_v1(p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$declare org uuid;begin
 org:=operations_economy_private.authorize_scope_admin_v1();
 perform 1 from public.projects where id=p_project and organization_id=org and deleted_at is null for share;
 if not found then raise exception 'obligation_project_access_denied' using errcode='42501';end if;return org;end;$$;
revoke all on function operations_economy_private.authorize_obligation_admin_v1(uuid) from public,anon,authenticated,service_role;
create function operations_economy_private.validate_obligation_command_common_v1(p jsonb,p_keys text[],p_schema text) returns void language plpgsql immutable set search_path='' as $$declare key text;begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>cardinality(p_keys) or not(p ?& p_keys) or p->>'schema_version' is distinct from p_schema then raise exception 'invalid_obligation_command' using errcode='22023';end if;
 foreach key in array array['project_id','obligation_id'] loop
 if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_obligation_identity' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'idempotency_key',200) or length(p->>'idempotency_key')<12
 or jsonb_typeof(p->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'reason',1000) or length(p->>'reason')<3 then raise exception 'invalid_obligation_audit_reason' using errcode='22023';end if;end;$$;
revoke all on function operations_economy_private.validate_obligation_command_common_v1(jsonb,text[],text) from public,anon,authenticated,service_role;

create function operations_economy_private.append_manual_obligation_baseline_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();h public.operations_project_obligation_heads%rowtype;b public.operations_project_obligation_baselines%rowtype;key text;expected bigint;next_revision bigint;document jsonb;begin
 perform operations_economy_private.validate_obligation_command_common_v1(p,array['schema_version','project_id','obligation_id','expected_revision','currency','category','cost_basis','estimate_minor','committed_minor','idempotency_key','reason'],'operations-obligation-manual-baseline.v1');
 if jsonb_typeof(p->'expected_revision') is distinct from 'number' or (p->>'expected_revision')::numeric<>trunc((p->>'expected_revision')::numeric) or (p->>'expected_revision')::numeric not between 0 and 9007199254740990
 or jsonb_typeof(p->'currency') is distinct from 'string' or p->>'currency' !~ '^[A-Z]{3}$'
 or jsonb_typeof(p->'category') is distinct from 'string' or p->>'category' not in ('personnel','supplier','catering','other')
 or jsonb_typeof(p->'cost_basis') is distinct from 'string' or p->>'cost_basis' not in ('time','invoice','other') then raise exception 'invalid_obligation_baseline' using errcode='22023';end if;
 foreach key in array array['estimate_minor','committed_minor'] loop
 if jsonb_typeof(p->key) is distinct from 'null' and (jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric) or (p->>key)::numeric not between 0 and 9007199254740991) then raise exception 'invalid_obligation_baseline_money' using errcode='22023';end if;end loop;
 org:=operations_economy_private.authorize_obligation_admin_v1((p->>'project_id')::uuid);expected:=(p->>'expected_revision')::bigint;
 perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 select * into b from public.operations_project_obligation_baselines where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if b.command<>p or b.actor_system_user_id<>actor then raise exception 'obligation_baseline_idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('outcome','replayed','event_id',b.event_id,'revision',b.revision,'fingerprint',b.fingerprint,'evidence_basis',b.evidence_basis);end if;
 select * into h from public.operations_project_obligation_heads where organization_id=org and obligation_id=(p->>'obligation_id')::uuid for update;
 if found then
 if h.project_id<>(p->>'project_id')::uuid or h.currency<>p->>'currency' or h.category<>p->>'category' or h.cost_basis<>p->>'cost_basis' then raise exception 'immutable_obligation_identity' using errcode='22023';end if;
 if h.current_revision<>expected then return jsonb_build_object('outcome','stale','current_revision',h.current_revision);end if;
 elsif expected<>0 then return jsonb_build_object('outcome','stale','current_revision',0);end if;
 next_revision:=expected+1;
 if h.obligation_id is null then insert into public.operations_project_obligation_heads values(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,p->>'currency',p->>'category',p->>'cost_basis',next_revision);end if;
 document:=jsonb_build_object('schema_version','operations-obligation-manual-baseline-evidence.v1','organization_id',org,'project_id',(p->>'project_id')::uuid,'obligation_id',(p->>'obligation_id')::uuid,'revision',next_revision,'evidence_basis','operations_manual','authority_scope','local_project_only','currency',p->>'currency','category',p->>'category','cost_basis',p->>'cost_basis','estimate_minor',p->'estimate_minor','committed_minor',p->'committed_minor');
 insert into public.operations_project_obligation_baselines(organization_id,project_id,obligation_id,revision,currency,category,cost_basis,estimate_minor,committed_minor,fingerprint,actor_system_user_id,reason,idempotency_key,command)
 values(org,(p->>'project_id')::uuid,(p->>'obligation_id')::uuid,next_revision,p->>'currency',p->>'category',p->>'cost_basis',(p->>'estimate_minor')::bigint,(p->>'committed_minor')::bigint,encode(sha256(convert_to(operations_economy_private.canonical_json_v1(document),'UTF8')),'hex'),actor,p->>'reason',p->>'idempotency_key',p) returning * into b;
 if h.obligation_id is not null then update public.operations_project_obligation_heads set current_revision=next_revision where organization_id=org and obligation_id=h.obligation_id;end if;
 return jsonb_build_object('outcome','accepted','event_id',b.event_id,'revision',b.revision,'fingerprint',b.fingerprint,'evidence_basis',b.evidence_basis);end;$$;
revoke all on function operations_economy_private.append_manual_obligation_baseline_v1(jsonb) from public,anon,service_role;
grant execute on function operations_economy_private.append_manual_obligation_baseline_v1(jsonb) to authenticated;
create function public.append_operations_manual_obligation_baseline_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.append_manual_obligation_baseline_v1(p_command);$$;
revoke all on function public.append_operations_manual_obligation_baseline_v1(jsonb) from public,anon,service_role;
grant execute on function public.append_operations_manual_obligation_baseline_v1(jsonb) to authenticated;

create function operations_economy_private.invoice_source_anchor_v1(p_org uuid,p_invoice uuid,p_allocation uuid,p_document_hash text,p_currency text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(array_to_string(array['finance-invoice-allocation-source-anchor-v1',p_org::text,p_invoice::text,p_allocation::text,p_document_hash,p_currency],E'\n'),'UTF8')),'hex');$$;
revoke all on function operations_economy_private.invoice_source_anchor_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
create function operations_economy_private.bind_invoice_obligation_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();key text;h public.operations_project_obligation_heads%rowtype;b public.operations_project_obligation_baselines%rowtype;
 s public.operations_finance_invoice_snapshots%rowtype;prior public.operations_project_obligation_invoice_bindings%rowtype;binding public.operations_project_obligation_invoice_bindings%rowtype;
 current_revision bigint;a jsonb;anchor text;owner public.operations_project_obligation_source_ownership%rowtype;begin
 perform operations_economy_private.validate_obligation_command_common_v1(p,array['schema_version','project_id','obligation_id','expected_obligation_revision','source_snapshot_id','source_allocation_id','expected_economic_revision','expected_economic_fingerprint','idempotency_key','reason'],'operations-obligation-invoice-bind.v1');
 foreach key in array array['source_snapshot_id','source_allocation_id'] loop if jsonb_typeof(p->key) is distinct from 'string' or p->>key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_obligation_source_identity' using errcode='22023';end if;end loop;
 foreach key in array array['expected_obligation_revision','expected_economic_revision'] loop if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)::numeric<>trunc((p->>key)::numeric) or (p->>key)::numeric not between 1 and 9007199254740991 then raise exception 'invalid_obligation_source_revision' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'expected_economic_fingerprint') is distinct from 'string' or p->>'expected_economic_fingerprint' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_obligation_source_fingerprint' using errcode='22023';end if;
 org:=operations_economy_private.authorize_obligation_admin_v1((p->>'project_id')::uuid);perform pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0));
 select * into prior from public.operations_project_obligation_invoice_bindings where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then if prior.command<>p or prior.actor_system_user_id<>actor then raise exception 'obligation_binding_idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('outcome','replayed','event_id',prior.event_id,'source_anchor',prior.source_anchor,'binding_sequence',prior.binding_sequence,'remaining_coverage','unavailable');end if;
 select * into h from public.operations_project_obligation_heads where organization_id=org and obligation_id=(p->>'obligation_id')::uuid for update;
 if not found or h.project_id<>(p->>'project_id')::uuid or h.cost_basis<>'invoice' then raise exception 'invoice_obligation_scope_required' using errcode='22023';end if;
 if h.current_revision<>(p->>'expected_obligation_revision')::bigint then return jsonb_build_object('outcome','stale','current_revision',h.current_revision);end if;
 select * into b from public.operations_project_obligation_baselines where organization_id=org and obligation_id=h.obligation_id and revision=h.current_revision;
 select * into s from public.operations_finance_invoice_snapshots where id=(p->>'source_snapshot_id')::uuid and organization_id=org;
 if not found then raise exception 'saved_invoice_source_required' using errcode='42501';end if;
 select st.current_revision into current_revision from public.operations_finance_invoice_streams st where st.organization_id=org and st.source_organization_id=s.source_organization_id and st.invoice_id=s.invoice_id for share;
 if current_revision is null or current_revision<>s.source_revision or s.source_revision<>(p->>'expected_economic_revision')::bigint or s.source_publication_fingerprint<>p->>'expected_economic_fingerprint' then raise exception 'current_invoice_economic_source_required' using errcode='22023';end if;
 perform public.operations_validate_finance_invoice_destination_v1(s.envelope);
 if s.raw_body::jsonb<>s.envelope or s.body_sha256<>encode(sha256(convert_to(s.raw_body,'UTF8')),'hex') or s.envelope->>'invoice_kind'<>'invoice' or s.envelope->>'currency'<>h.currency or s.envelope->>'source_publication_fingerprint'<>s.source_publication_fingerprint or (s.envelope->>'source_revision')::bigint<>s.source_revision or (s.envelope->>'source_organization_id')::uuid<>s.source_organization_id or (s.envelope->>'destination_organization_id')::uuid<>org or (s.envelope->>'invoice_id')::uuid<>s.invoice_id then raise exception 'saved_invoice_provenance_invalid' using errcode='22023';end if;
 select value into strict a from jsonb_array_elements(s.envelope->'allocations') where (value->>'allocation_id')::uuid=(p->>'source_allocation_id')::uuid;
 if (a->>'destination_project_id')::uuid<>h.project_id or (a->>'destination_organization_id')::uuid<>org or a->>'status' not in ('preliminary','confirmed') or (a->>'amount_minor')::bigint<=0 then raise exception 'positive_project_original_required' using errcode='22023';end if;
 anchor:=operations_economy_private.invoice_source_anchor_v1(s.source_organization_id,s.invoice_id,(a->>'allocation_id')::uuid,s.envelope->>'document_fingerprint',h.currency);
 select * into owner from public.operations_project_obligation_source_ownership where organization_id=org and source_anchor=anchor;
 if found and (owner.project_id<>h.project_id or owner.obligation_id<>h.obligation_id) then raise exception 'permanent_obligation_source_owner_conflict' using errcode='23505';end if;
 if owner.source_anchor is null then insert into public.operations_project_obligation_source_ownership values(org,anchor,h.project_id,h.obligation_id);end if;
 insert into public.operations_project_obligation_invoice_bindings(organization_id,project_id,obligation_id,source_anchor,baseline_event_id,source_snapshot_id,source_allocation_id,source_organization_id,invoice_id,source_economic_revision,source_economic_fingerprint,source_raw_body_sha256,document_fingerprint,currency,amount_minor,source_status,actor_system_user_id,reason,idempotency_key,command)
 values(org,h.project_id,h.obligation_id,anchor,b.event_id,s.id,(a->>'allocation_id')::uuid,s.source_organization_id,s.invoice_id,s.source_revision,s.source_publication_fingerprint,s.body_sha256,s.envelope->>'document_fingerprint',h.currency,(a->>'amount_minor')::bigint,a->>'status',actor,p->>'reason',p->>'idempotency_key',p) returning * into binding;
 return jsonb_build_object('outcome','accepted','event_id',binding.event_id,'source_anchor',anchor,'binding_sequence',binding.binding_sequence,'remaining_coverage','unavailable');
 exception when no_data_found or too_many_rows then raise exception 'unambiguous_saved_invoice_allocation_required' using errcode='22023';end;$$;
revoke all on function operations_economy_private.bind_invoice_obligation_v1(jsonb) from public,anon,service_role;
grant execute on function operations_economy_private.bind_invoice_obligation_v1(jsonb) to authenticated;
create function public.bind_operations_invoice_obligation_v1(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.bind_invoice_obligation_v1(p_command);$$;
revoke all on function public.bind_operations_invoice_obligation_v1(jsonb) from public,anon,service_role;
grant execute on function public.bind_operations_invoice_obligation_v1(jsonb) to authenticated;

-- Source-only service projection. A v2 resolver must separately prove that no
-- newer v2 economic publication supersedes this v1 head before credit activation.
create function operations_economy_private.read_obligation_original_v1(p_org uuid,p_project uuid,p_obligation uuid,p_anchor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.operations_project_obligation_heads%rowtype;b public.operations_project_obligation_baselines%rowtype;
 binding public.operations_project_obligation_invoice_bindings%rowtype;s public.operations_finance_invoice_snapshots%rowtype;current_revision bigint;a jsonb;
 unresolved jsonb:=jsonb_build_object('schema_version','operations-obligation-original-evidence.v1','state','unresolved','authority_scope','local_project_only','source_currentness','receiver_v1_only','remaining_coverage','unavailable','eac_minor',null,'shadow_only',true);
begin
 if p_org is null or p_project is null or p_obligation is null or p_anchor is null or p_anchor !~ '^[0-9a-f]{64}$' then raise exception 'invalid_obligation_original_selector' using errcode='22023';end if;
 perform 1 from public.projects where id=p_project and organization_id=p_org and deleted_at is null for share;
 if not found then raise exception 'obligation_original_project_denied' using errcode='42501';end if;
 select * into h from public.operations_project_obligation_heads where organization_id=p_org and project_id=p_project and obligation_id=p_obligation for share;
 if not found or h.cost_basis<>'invoice' then return unresolved||jsonb_build_object('reason','missing_invoice_obligation');end if;
 select * into binding from public.operations_project_obligation_invoice_bindings where organization_id=p_org and project_id=p_project and obligation_id=p_obligation and source_anchor=p_anchor order by binding_sequence desc limit 1;
 if not found then return unresolved||jsonb_build_object('reason','missing_source_binding');end if;
 select * into b from public.operations_project_obligation_baselines where organization_id=p_org and obligation_id=p_obligation and revision=h.current_revision;
 if b.event_id is distinct from binding.baseline_event_id then return unresolved||jsonb_build_object('reason','changed_baseline');end if;
 select st.current_revision into current_revision from public.operations_finance_invoice_streams st where st.organization_id=p_org and st.source_organization_id=binding.source_organization_id and st.invoice_id=binding.invoice_id for share;
 if current_revision is distinct from binding.source_economic_revision then return unresolved||jsonb_build_object('reason','changed_invoice_economics');end if;
 select * into s from public.operations_finance_invoice_snapshots where id=binding.source_snapshot_id;
 if not found or s.source_publication_fingerprint is distinct from binding.source_economic_fingerprint or s.body_sha256 is distinct from binding.source_raw_body_sha256 then return unresolved||jsonb_build_object('reason','saved_source_provenance_unavailable');end if;
 select value into a from jsonb_array_elements(s.envelope->'allocations') where (value->>'allocation_id')::uuid=binding.source_allocation_id;
 if a is null or a->>'status' not in ('preliminary','confirmed') or (a->>'amount_minor')::bigint is distinct from binding.amount_minor or (a->>'destination_project_id')::uuid is distinct from p_project then return unresolved||jsonb_build_object('reason','positive_original_unavailable');end if;
 return jsonb_build_object('schema_version','operations-obligation-original-evidence.v1','state','bound_original','authority_scope','local_project_only','source_currentness','receiver_v1_only','remaining_coverage','unavailable','eac_minor',null,'shadow_only',true,
 'organization_id',p_org,'project_id',p_project,'obligation_id',p_obligation,'source_anchor',p_anchor,'currency',h.currency,
 'baseline_event_id',b.event_id,'baseline_revision',b.revision,'baseline_fingerprint',b.fingerprint,'baseline_evidence_basis',b.evidence_basis,'estimate_minor',b.estimate_minor,'committed_minor',b.committed_minor,
 'binding_event_id',binding.event_id,'source_snapshot_id',s.id,'source_allocation_id',binding.source_allocation_id,'source_economic_revision',binding.source_economic_revision,'source_economic_fingerprint',binding.source_economic_fingerprint,
 'source_raw_body_sha256',binding.source_raw_body_sha256,'amount_minor',binding.amount_minor,'source_status',binding.source_status,'replaces_estimate_minor',null,'consumes_commitment_minor',null);
end;$$;
revoke all on function operations_economy_private.read_obligation_original_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function operations_economy_private.read_obligation_original_v1(uuid,uuid,uuid,text) to service_role;
create function public.read_operations_obligation_original_v1(p_organization_id uuid,p_project_id uuid,p_obligation_id uuid,p_source_anchor text)
returns jsonb language sql security invoker set search_path='' as $$select operations_economy_private.read_obligation_original_v1(p_organization_id,p_project_id,p_obligation_id,p_source_anchor);$$;
revoke all on function public.read_operations_obligation_original_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_operations_obligation_original_v1(uuid,uuid,uuid,text) to service_role;
