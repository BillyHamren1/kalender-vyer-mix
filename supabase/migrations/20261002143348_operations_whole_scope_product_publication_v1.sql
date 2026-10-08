-- Default-off partial invoice publication. No transport, Finance admission or official costs.
-- Product calculator port from frozen TEST prototype SHA256
-- 5f3c95ad51c6c65f1dbd7bfcadbbbae1672ed3becdfd64dc917ce7b4c7370780.
-- Only trusted same-transaction compatible reader output reaches the product entry.
create schema operations_whole_scope_publication_private;
revoke all on schema operations_whole_scope_publication_private from public,anon,authenticated,service_role;
create function operations_whole_scope_publication_private.calculate_money_v1(v jsonb, nonnegative boolean default false) returns numeric
language plpgsql security invoker set search_path='' as $$declare n numeric;begin
 if v='null'::jsonb then return null;end if;
 if v is null or jsonb_typeof(v)<>'number' then raise exception 'Invalid obligation money';end if;
 n:=v::text::numeric;
 if n<>trunc(n) or abs(n)>9007199254740991 or (nonnegative and n<0) then raise exception 'Invalid obligation money';end if;return n;
end;$$;
create function operations_whole_scope_publication_private.calculate_minor_v1(n numeric) returns numeric language plpgsql security invoker set search_path='' as $$begin
 if n<>trunc(n) or abs(n)>9007199254740991 then raise exception 'Unsafe obligation aggregation';end if;return n;
end;$$;
create function operations_whole_scope_publication_private.calculate_obligation_v1(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare
 k text;s jsonb;o jsonb;ids text[]:='{}';issues text[]:='{}';originals jsonb:='{}';credits jsonb:='{}';
 estimate numeric;commitment numeric;amount numeric;replacement numeric;consumption numeric;total numeric;
 confirmed numeric:=0;preliminary numeric:=0;replaced numeric:=0;consumed numeric:=0;
 er numeric;cr numeric;remaining numeric;known numeric;complete boolean;
begin
 if p is null or jsonb_typeof(p)<>'object' or p->>'cost_basis' is null or p->>'cost_basis' not in ('time','invoice','other')
 or p->>'relation_coverage' is null or p->>'relation_coverage' not in ('complete','unresolved') then raise exception 'Explicit obligation authority required';end if;
 foreach k in array array['organization_id','project_id','obligation_id'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Exact obligation scope required';end if;end loop;
 if p->>'currency' is null or p->>'currency' !~ '^[A-Z]{3}$' or jsonb_typeof(p->'sources') is distinct from 'array' then raise exception 'Invalid obligation envelope';end if;
 if jsonb_array_length(p->'sources')>10000 then raise exception 'Invalid obligation envelope';end if;
 estimate:=operations_whole_scope_publication_private.calculate_money_v1(p->'estimate_minor',true);commitment:=operations_whole_scope_publication_private.calculate_money_v1(p->'committed_minor',true);
 if p->>'relation_coverage'<>'complete' then issues:=array_append(issues,'unresolved_obligation_relation');end if;
 if estimate is null then issues:=array_append(issues,'missing_estimate');end if;
 if commitment is null then issues:=array_append(issues,'missing_commitment');end if;
 for s in select value from jsonb_array_elements(p->'sources') loop
 if s is null or jsonb_typeof(s->'source_id') is distinct from 'string' or btrim(s->>'source_id', E' \t\n\v\f\r'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))=''  or s->>'source_id'=any(ids) then raise exception 'Duplicate/missing obligation source identity';end if;
 ids:=array_append(ids,s->>'source_id');
 foreach k in array array['organization_id','project_id','obligation_id','currency'] loop if s->k is distinct from p->k then raise exception 'Cross-scope obligation relation';end if;end loop;
 if s->>'kind' is null or s->>'kind' not in ('time','invoice','credit','other') or s->>'status' is null or s->>'status' not in ('preliminary','confirmed','rejected') or s->>'relation_coverage' is null or s->>'relation_coverage' not in ('complete','unresolved') then raise exception 'Invalid obligation source status';end if;
 perform operations_whole_scope_publication_private.calculate_money_v1(s->'amount_minor');perform operations_whole_scope_publication_private.calculate_money_v1(s->'replaces_estimate_minor',true);perform operations_whole_scope_publication_private.calculate_money_v1(s->'consumes_commitment_minor',true);
 if s->>'kind'<>'credit' and s->'credited_source_id' is distinct from 'null'::jsonb then raise exception 'Credit relationship on noncredit source';end if;
 if s->>'kind'='invoice' then originals:=originals||jsonb_build_object(s->>'source_id',s);end if;
 end loop;
 for s in select value from jsonb_array_elements(p->'sources') loop
 if s->>'status'='rejected' then continue;end if;
 if s->>'relation_coverage'<>'complete' then issues:=array_append(issues,'unresolved_source_relation:'||(s->>'source_id'));continue;end if;
 replacement:=operations_whole_scope_publication_private.calculate_money_v1(s->'replaces_estimate_minor',true);consumption:=operations_whole_scope_publication_private.calculate_money_v1(s->'consumes_commitment_minor',true);
 if p->>'cost_basis'='invoice' and s->>'kind'='time' then
 if replacement is distinct from 0 or consumption is distinct from 0 then raise exception 'Noncharging hired time cannot consume obligation';end if;continue;end if;
 if (p->>'cost_basis'='time' and s->>'kind'<>'time') or (p->>'cost_basis'='invoice' and s->>'kind' not in ('invoice','credit')) or (p->>'cost_basis'='other' and s->>'kind'<>'other') then raise exception 'Competing obligation cost authorities';end if;
 amount:=operations_whole_scope_publication_private.calculate_money_v1(s->'amount_minor');
 if amount is null then issues:=array_append(issues,'missing_source_amount:'||(s->>'source_id'));continue;end if;
 if replacement is null or consumption is null then issues:=array_append(issues,'missing_source_replacement:'||(s->>'source_id'));end if;
 if s->>'kind'='credit' then
 if amount>=0 or replacement is distinct from 0 or consumption is distinct from 0 then raise exception 'Credit cannot restore or consume estimated obligation';end if;
 o:=case when jsonb_typeof(s->'credited_source_id')='string' then originals->(s->>'credited_source_id') else null end;
 if o is null or o->>'status'='rejected' or o->'amount_minor'='null'::jsonb or (o->>'amount_minor')::numeric<=0 or o->>'relation_coverage'<>'complete' then issues:=array_append(issues,'unresolved_credit_original:'||(s->>'source_id'));continue;end if;
 total:=coalesce((credits->>(o->>'source_id'))::numeric,0)-amount;
 if total>(o->>'amount_minor')::numeric then raise exception 'Credit exceeds its exact original allocation';end if;
 credits:=credits||jsonb_build_object(o->>'source_id',total);
 elsif amount<0 then raise exception 'Negative noncredit source';end if;
 replaced:=replaced+coalesce(replacement,0);consumed:=consumed+coalesce(consumption,0);
 if s->>'status'='confirmed' then confirmed:=confirmed+amount;else preliminary:=preliminary+amount;end if;
 end loop;
 if estimate is not null and replaced>estimate then raise exception 'Estimate replacement exceeds obligation';end if;
 if commitment is not null and consumed>commitment then raise exception 'Commitment consumption exceeds obligation';end if;
 complete:=cardinality(issues)=0;
 if complete and estimate is not null then er:=operations_whole_scope_publication_private.calculate_minor_v1(estimate-replaced);end if;
 if complete and commitment is not null then cr:=operations_whole_scope_publication_private.calculate_minor_v1(commitment-consumed);end if;
 if er is not null and cr is not null then remaining:=greatest(er,cr);end if;
 known:=operations_whole_scope_publication_private.calculate_minor_v1(confirmed+preliminary);
 return jsonb_build_object('schema_version','operations-cost-obligation-v1','calculation_version','operations-obligation-replacement-v1',
 'organization_id',p->'organization_id','project_id',p->'project_id','obligation_id',p->'obligation_id','currency',p->'currency','cost_basis',p->'cost_basis',
 'coverage',case when complete then 'complete' else 'unavailable' end,'issues',to_jsonb(issues),'source_ids',to_jsonb(ids),
 'confirmed_minor',operations_whole_scope_publication_private.calculate_minor_v1(confirmed),'preliminary_minor',operations_whole_scope_publication_private.calculate_minor_v1(preliminary),'known_cost_minor',known,
 'estimate_remaining_minor',er,'commitment_remaining_minor',cr,'remaining_minor',remaining,'eac_minor',case when remaining is null then null else operations_whole_scope_publication_private.calculate_minor_v1(confirmed+preliminary+remaining) end);
end;$$;
create function operations_whole_scope_publication_private.calculate_leaf_v1(e jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare
 s jsonb;input jsonb;result jsonb;b jsonb:=e->'baseline';sources jsonb:='[]';excluded jsonb:='[]';diagnostics jsonb:=e->'diagnostics';resolved int:=0;
begin
 for s in select value from jsonb_array_elements(e->'sources') loop
 if s->'resolved'='true'::jsonb then
 resolved:=resolved+1;
 sources:=sources||jsonb_build_array(jsonb_build_object('source_id','invoice:'||(s->>'source_anchor'),'organization_id',e->'organization_id','project_id',e->'project_id','obligation_id',e->'obligation_id','currency',b->'currency','kind','invoice','status',s->'status','amount_minor',s->'amount_minor','replaces_estimate_minor',s->'replaces_estimate_minor','consumes_commitment_minor',s->'consumes_commitment_minor','credited_source_id',null,'relation_coverage','complete'));
 else excluded:=excluded||jsonb_build_array(s->'source_anchor');diagnostics:=diagnostics||jsonb_build_array('excluded_source:'||(s->>'source_anchor')||':'||(s->>'reason'));end if;
 end loop;
 for s in select value from jsonb_array_elements(e->'sources') loop if s->'resolved'='true'::jsonb and s->>'policy_state'<>'current' then diagnostics:=diagnostics||jsonb_build_array('unavailable_source_policy:'||(s->>'source_anchor'));end if;end loop;
 if e->>'state'<>'unsupported_basis' then
 input:=jsonb_build_object('organization_id',e->'organization_id','project_id',e->'project_id','obligation_id',e->'obligation_id','currency',b->'currency','cost_basis','invoice','estimate_minor',b->'estimate_minor','committed_minor',b->'committed_minor','relation_coverage','unresolved','sources',sources);
 result:=operations_whole_scope_publication_private.calculate_obligation_v1(input);end if;
 return jsonb_build_object('schema_version','operations-local-invoice-kernel-projection.v1','authority_scope','local_project_only','source_currentness','saved_receiver_heads_only','kernel_input',input,'kernel_result',result,'known_captured_cost_minor',case when resolved=0 then null else result->'known_cost_minor' end,'resolved_source_count',resolved,'excluded_source_anchors',excluded,'diagnostics',diagnostics,'category_coverage','unavailable','source_coverage','unavailable','remaining_minor',null,'eac_minor',null,'credit_eligible',false,'shadow_only',true);
end;$$;
create function operations_whole_scope_publication_private.calculate_scope_v1(e jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare
 m jsonb;s jsonb;child jsonb;reply jsonb;diagnostics jsonb:=e->'diagnostics';excluded jsonb:='[]';confirmed numeric:=0;preliminary numeric:=0;count int:=0;k text;
begin
 for m in select value from jsonb_array_elements(e->'members') loop
 child:=operations_whole_scope_publication_private.calculate_leaf_v1(m->'kernel_evidence');diagnostics:=diagnostics||(child->'diagnostics');
 if (child->>'resolved_source_count')::int>0 then count:=count+(child->>'resolved_source_count')::int;confirmed:=confirmed+(child->'kernel_result'->>'confirmed_minor')::numeric;preliminary:=preliminary+(child->'kernel_result'->>'preliminary_minor')::numeric;end if;end loop;
 for s in select value from jsonb_array_elements(e->'source_inventory') loop if s->>'mapping_state'<>'charging' then excluded:=excluded||jsonb_build_array(s->'source_anchor');diagnostics:=diagnostics||jsonb_build_array('excluded_scope_source:'||(s->>'source_anchor')||':'||(s->>'reason'));end if;end loop;
 if count>0 and (abs(confirmed)>9007199254740991 or abs(preliminary)>9007199254740991 or abs(confirmed+preliminary)>9007199254740991) then raise exception 'unsafe_scope_invoice_subtotal';end if;
 reply:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-projection.v1','authority_scope','canonical_scope_invoice_capture',
 'known_captured_invoice_cost_minor',case when count=0 then null else confirmed+preliminary end,'confirmed_captured_invoice_cost_minor',case when count=0 then null else confirmed end,'preliminary_captured_invoice_cost_minor',case when count=0 then null else preliminary end,
 'resolved_source_count',count,'excluded_source_anchors',excluded,'member_count',jsonb_array_length(e->'members'),'diagnostics',diagnostics,'source_coverage','unavailable','credit_eligible',false,'remaining_minor',null,'eac_minor',null,'budget_minor',null,'margin_minor',null,'shadow_only',true);
 foreach k in array array['organization_id','economic_scope_id','currency','scope_snapshot_id','scope_revision','membership_fingerprint','composition_snapshot_id','composition_revision','composition_fingerprint','root_kind','root_id','membership_currentness','source_currentness','as_of','captured_inventory_fingerprint','captured_inventory_matches_current','category_coverage'] loop reply:=reply||jsonb_build_object(k,e->k);end loop;
 return reply;
end;$$;

revoke all on function operations_whole_scope_publication_private.calculate_money_v1(jsonb,boolean) from public,anon,authenticated,service_role;

revoke all on function operations_whole_scope_publication_private.calculate_minor_v1(numeric) from public,anon,authenticated,service_role;

revoke all on function operations_whole_scope_publication_private.calculate_obligation_v1(jsonb) from public,anon,authenticated,service_role;

revoke all on function operations_whole_scope_publication_private.calculate_leaf_v1(jsonb) from public,anon,authenticated,service_role;

revoke all on function operations_whole_scope_publication_private.calculate_scope_v1(jsonb) from public,anon,authenticated,service_role;

-- First slice has no grant writer or destination body. Null cannot authorize export.
create table operations_whole_scope_publication_private.gates (
 organization_id uuid not null,economic_scope_id uuid not null,enabled boolean not null default false,
 primary key(organization_id,economic_scope_id),
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id)
);
create table operations_whole_scope_publication_private.publications (
 publication_id uuid primary key,organization_id uuid not null,economic_scope_id uuid not null,
 publication_revision bigint not null check(publication_revision between 1 and 9007199254740991),
 actor_id uuid not null,idempotency_key text not null,command jsonb not null,
 document jsonb not null,capture jsonb not null,projection jsonb not null,source_manifest jsonb not null,
 source_evidence_fingerprint text not null check(source_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
 source_publication_fingerprint text not null check(source_publication_fingerprint ~ '^[0-9a-f]{64}$'),
 observed_at timestamptz not null,export_grant jsonb check(export_grant is null),destination_raw_body text check(destination_raw_body is null),
 unique(organization_id,economic_scope_id,publication_revision),unique(organization_id,idempotency_key),
 unique(organization_id,economic_scope_id,publication_revision,publication_id),
 foreign key(organization_id,economic_scope_id) references public.operations_project_scope_heads(organization_id,economic_scope_id)
);
create table operations_whole_scope_publication_private.heads (
 organization_id uuid not null,economic_scope_id uuid not null,publication_revision bigint not null,publication_id uuid not null,
 primary key(organization_id,economic_scope_id),
 foreign key(organization_id,economic_scope_id,publication_revision,publication_id)
 references operations_whole_scope_publication_private.publications(organization_id,economic_scope_id,publication_revision,publication_id)
);
create table operations_whole_scope_publication_private.receipts (
 publication_id uuid primary key references operations_whole_scope_publication_private.publications(publication_id),document jsonb not null
);
alter table operations_whole_scope_publication_private.gates enable row level security;
alter table operations_whole_scope_publication_private.publications enable row level security;
alter table operations_whole_scope_publication_private.heads enable row level security;
alter table operations_whole_scope_publication_private.receipts enable row level security;
revoke all on all tables in schema operations_whole_scope_publication_private from public,anon,authenticated,service_role;
grant usage on schema operations_whole_scope_publication_private to authenticated,service_role;
grant select,insert on operations_whole_scope_publication_private.gates to service_role;
grant update(enabled) on operations_whole_scope_publication_private.gates to service_role;
create function operations_whole_scope_publication_private.guard_gate_v1() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if tg_op<>'UPDATE' or new.organization_id is distinct from old.organization_id or new.economic_scope_id is distinct from old.economic_scope_id then
 raise exception 'immutable_product_publication_gate_identity' using errcode='55000';end if;return new;
end;$$;
revoke all on function operations_whole_scope_publication_private.guard_gate_v1() from public,anon,authenticated,service_role;
create trigger product_publication_gate_identity before update or delete on operations_whole_scope_publication_private.gates for each row execute function operations_whole_scope_publication_private.guard_gate_v1();
create trigger product_publication_gate_no_truncate before truncate on operations_whole_scope_publication_private.gates for each statement execute function public.operations_personnel_evidence_immutable();
create trigger product_publication_immutable before update or delete on operations_whole_scope_publication_private.publications for each row execute function public.operations_personnel_evidence_immutable();
create trigger product_publication_no_truncate before truncate on operations_whole_scope_publication_private.publications for each statement execute function public.operations_personnel_evidence_immutable();
create trigger product_receipt_immutable before update or delete on operations_whole_scope_publication_private.receipts for each row execute function public.operations_personnel_evidence_immutable();
create trigger product_receipt_no_truncate before truncate on operations_whole_scope_publication_private.receipts for each statement execute function public.operations_personnel_evidence_immutable();
create function operations_whole_scope_publication_private.guard_head_v1() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if tg_op='DELETE' or (tg_op='INSERT' and new.publication_revision<>1) or
 (tg_op='UPDATE' and (new.organization_id is distinct from old.organization_id or new.economic_scope_id is distinct from old.economic_scope_id or new.publication_revision<>old.publication_revision+1)) then
 raise exception 'immutable_monotonic_product_publication_head' using errcode='55000';end if;
 perform 1 from operations_whole_scope_publication_private.publications p where p.organization_id=new.organization_id and p.economic_scope_id=new.economic_scope_id and p.publication_revision=new.publication_revision and p.publication_id=new.publication_id;
 if not found then raise exception 'saved_product_publication_head_required' using errcode='55000';end if;return new;
end;$$;
revoke all on function operations_whole_scope_publication_private.guard_head_v1() from public,anon,authenticated,service_role;
create trigger product_publication_head_guard before insert or update or delete on operations_whole_scope_publication_private.heads for each row execute function operations_whole_scope_publication_private.guard_head_v1();
create trigger product_publication_head_no_truncate before truncate on operations_whole_scope_publication_private.heads for each statement execute function public.operations_personnel_evidence_immutable();

-- Installed compatible predecessor graph, explicitly separate from dynamic-dispatch audit.
do $$begin
 if not exists(select 1 from pg_proc p where p.oid='operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)'::regprocedure
 and p.proowner=(select oid from pg_roles where rolname=current_user) and p.prosecdef and p.proconfig=array['search_path=""']::text[])
 or exists(select 1 from pg_proc p where p.prosrc ~ 'read_scope_invoice_kernel_compatible_v1[[:space:]]*\('
 and p.oid<>'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure)
 or has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)','EXECUTE')
 then raise exception 'installed_product_compatible_caller_closure_required' using errcode='55000';end if;
end;$$;

create function operations_whole_scope_publication_private.publish_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare
 org uuid;actor uuid:=auth.uid();scope_id uuid;k text;project uuid;expected bigint;current_revision bigint;
 membership public.operations_project_scope_snapshots%rowtype;
 composition public.operations_scope_obligation_compositions%rowtype;
 prior operations_whole_scope_publication_private.publications%rowtype;
 projects uuid[];checked_projects uuid[];captured_projects uuid[];captured jsonb;projection jsonb;manifest jsonb;
 request jsonb;document jsonb;receipt jsonb;new_publication_id uuid;revision bigint;evidence_fp text;publication_fp text;message text;
begin
 if current_setting('transaction_isolation') not in ('repeatable read','serializable') then raise exception 'coherent_product_publication_transaction_required' using errcode='55000';end if;
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>9 or not(p ?& array['schema_version','economic_scope_id','expected_scope_revision','expected_membership_fingerprint','expected_composition_revision','expected_composition_fingerprint','expected_publication_revision','idempotency_key','reason'])
 or p->>'schema_version' is distinct from 'operations-whole-scope-product-publication-command.v1' then raise exception 'exact_product_publication_command_required' using errcode='22023';end if;
 if jsonb_typeof(p->'economic_scope_id') is distinct from 'string' or p->>'economic_scope_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_product_publication_identity' using errcode='22023';end if;
 foreach k in array array['expected_scope_revision','expected_composition_revision','expected_publication_revision'] loop
 if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric<>trunc((p->>k)::numeric)
 or (p->>k)::numeric not between (case when k='expected_publication_revision' then 0 else 1 end) and (case when k='expected_publication_revision' then 9007199254740990 else 9007199254740991 end) then raise exception 'invalid_product_publication_revision' using errcode='22023';end if;end loop;
 foreach k in array array['expected_membership_fingerprint','expected_composition_fingerprint'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~ '^[0-9a-f]{64}$' then raise exception 'invalid_product_publication_fingerprint' using errcode='22023';end if;end loop;
 if jsonb_typeof(p->'idempotency_key') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'idempotency_key',200) or length(p->>'idempotency_key')<12
 or jsonb_typeof(p->'reason') is distinct from 'string' or not operations_economy_private.scope_text_v1(p->>'reason',1000) or length(p->>'reason')<3 then raise exception 'invalid_product_publication_audit' using errcode='22023';end if;
 org:=operations_economy_private.authorize_scope_read_nowait_v1();scope_id:=(p->>'economic_scope_id')::uuid;
 perform 1 from operations_whole_scope_publication_private.gates where organization_id=org and economic_scope_id=scope_id and enabled for share nowait;
 if not found then raise exception 'product_publication_gate_disabled' using errcode='42501';end if;
 -- Immutable expected rows are hints only; all canonical projects and baseline projects are preauthorized.
 select * into membership from public.operations_project_scope_snapshots where organization_id=org and economic_scope_id=scope_id and scope_revision=(p->>'expected_scope_revision')::bigint and membership_fingerprint=p->>'expected_membership_fingerprint';
 if not found then raise exception 'product_publication_source_changed' using errcode='PT409';end if;
 select * into composition from public.operations_scope_obligation_compositions where organization_id=org and economic_scope_id=scope_id and composition_revision=(p->>'expected_composition_revision')::bigint and fingerprint=p->>'expected_composition_fingerprint';
 if not found or composition.scope_snapshot_id<>membership.snapshot_id then raise exception 'product_publication_source_changed' using errcode='PT409';end if;
 if jsonb_typeof(membership.membership->'source_project_ids') is distinct from 'array' or jsonb_array_length(membership.membership->'source_project_ids')>1000 then raise exception 'product_full_membership_limit' using errcode='22023';end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into projects from (
 select value::text::uuid id from jsonb_array_elements_text(membership.membership->'source_project_ids')
 union select b.project_id from public.operations_scope_obligation_baseline_captures c join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id where c.composition_snapshot_id=composition.snapshot_id and b.organization_id=org) x;
 if cardinality(projects)>1000 then raise exception 'product_full_project_union_limit' using errcode='22023';end if;
 foreach project in array projects loop perform 1 from public.projects where id=project and organization_id=org and deleted_at is null for share nowait;
 if not found then raise exception 'product_full_member_permission_denied' using errcode='42501';end if;end loop;
 perform operations_economy_private.lock_scope_read_root_nowait_v1(org,membership.membership->>'root_kind',(membership.membership->>'root_id')::uuid);
 -- Nonwaiting barriers are essential; never substitute a blocking advisory call.
 if not pg_try_advisory_xact_lock(hashtextextended('obligation-org:'||org,0)) or not pg_try_advisory_xact_lock(hashtextextended('operations-economic-scope:'||org,0)) then raise exception 'product_publication_lock_busy' using errcode='55P03';end if;
 select * into prior from operations_whole_scope_publication_private.publications where organization_id=org and idempotency_key=p->>'idempotency_key';
 if found then
 if prior.command is distinct from p or prior.actor_id is distinct from actor then raise exception 'product_publication_idempotency_conflict' using errcode='23505';end if;
 select r.document into strict receipt from operations_whole_scope_publication_private.receipts r where r.publication_id=prior.publication_id;
 return receipt||jsonb_build_object('outcome','replayed','historical_only',true);end if;
 select h.publication_revision into current_revision from operations_whole_scope_publication_private.heads h where h.organization_id=org and h.economic_scope_id=scope_id;
 expected:=(p->>'expected_publication_revision')::bigint;
 if coalesce(current_revision,0)<>expected then raise exception 'product_publication_revision_changed' using errcode='PT409';end if;
 -- Hints must still be the exact current rows. No new project/policy is acquired here.
 perform 1 from public.operations_project_scope_heads h where h.organization_id=org and h.economic_scope_id=scope_id and h.current_revision=membership.scope_revision and h.root_kind=membership.membership->>'root_kind' and h.root_id=(membership.membership->>'root_id')::uuid;
 if not found then raise exception 'product_publication_source_changed' using errcode='PT409';end if;
 perform 1 from public.operations_scope_obligation_composition_heads h where h.organization_id=org and h.economic_scope_id=scope_id and h.current_revision=composition.composition_revision;
 if not found then raise exception 'product_publication_source_changed' using errcode='PT409';end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into checked_projects from (
 select value::text::uuid id from jsonb_array_elements_text(membership.membership->'source_project_ids')
 union select b.project_id from public.operations_scope_obligation_baseline_captures c join public.operations_project_obligation_baselines b on b.event_id=c.baseline_event_id where c.composition_snapshot_id=composition.snapshot_id and b.organization_id=org) x;
 if checked_projects is distinct from projects then raise exception 'product_publication_permission_set_changed' using errcode='PT409';end if;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id',org,'economic_scope_id',scope_id,'expected_scope_revision',p->'expected_scope_revision','expected_membership_fingerprint',p->'expected_membership_fingerprint','expected_composition_revision',p->'expected_composition_revision','expected_composition_fingerprint',p->'expected_composition_fingerprint');
 begin captured:=operations_economy_private.read_scope_invoice_kernel_compatible_v1(request);
 exception when sqlstate '22023' then get stacked diagnostics message=message_text;
 if message in ('current_scope_invoice_graph_required','current_scope_invoice_composition_required','current_scope_invoice_baseline_required') then raise exception 'product_publication_source_changed' using errcode='PT409';end if;raise;end;
 select coalesce(array_agg(distinct (value->>'project_id')::uuid order by (value->>'project_id')::uuid),'{}'::uuid[]) into captured_projects from jsonb_array_elements(captured->'members');
 if not captured_projects<@projects then raise exception 'product_publication_permission_set_changed' using errcode='PT409';end if;
 projection:=operations_whole_scope_publication_private.calculate_scope_v1(captured);
 if projection->>'source_coverage' is distinct from 'unavailable' or projection->>'membership_currentness' is distinct from 'as_of_graph' or projection->>'source_currentness' is distinct from 'saved_receiver_heads_only'
 or projection->'credit_eligible' is distinct from 'false'::jsonb or projection->'remaining_minor' is distinct from 'null'::jsonb or projection->'eac_minor' is distinct from 'null'::jsonb or projection->'budget_minor' is distinct from 'null'::jsonb or projection->'margin_minor' is distinct from 'null'::jsonb or projection->'as_of' is distinct from captured->'as_of' then raise exception 'product_unknown_coverage_changed' using errcode='22023';end if;
 select coalesce(jsonb_agg(value-'source_organization_id'-'invoice_id' order by ord),'[]'::jsonb) into manifest from jsonb_array_elements(captured->'source_inventory') with ordinality x(value,ord);
 perform 1 from operations_whole_scope_publication_private.heads h where h.organization_id=org and h.economic_scope_id=scope_id for update nowait;
 new_publication_id:=gen_random_uuid();revision:=expected+1;
 evidence_fp:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-evidence-v1',captured)),'UTF8')),'hex');
 document:=jsonb_build_object('schema_version','operations-whole-scope-product-publication.v1','publication_id',new_publication_id,'organization_id',org,'economic_scope_id',scope_id,'publication_revision',revision,'actor_id',actor,'command',p,'calculation_version','operations-whole-scope-invoice-capture-sql.v1','full_membership',membership.membership,'scope_snapshot_id',membership.snapshot_id,'scope_revision',membership.scope_revision,'membership_fingerprint',membership.membership_fingerprint,'composition_snapshot_id',composition.snapshot_id,'composition_revision',composition.composition_revision,'composition_fingerprint',composition.fingerprint,'capture',captured,'projection',projection,'source_manifest',manifest,'source_evidence_fingerprint',evidence_fp,'observed_at',captured->'as_of','export_grant',null,'shadow_only',true);
 if octet_length(operations_economy_private.canonical_json_v1(document))>4194304 then raise exception 'product_publication_private_size_limit' using errcode='54000';end if;
 publication_fp:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-publication-v1',document)),'UTF8')),'hex');
 receipt:=jsonb_build_object('schema_version','operations-whole-scope-product-publication-receipt.v1','outcome','accepted','publication_id',new_publication_id,'publication_revision',revision,'source_publication_fingerprint',publication_fp,'source_evidence_fingerprint',evidence_fp,'historical_only',false,'delivery_state','blocked_missing_export_grant');
 insert into operations_whole_scope_publication_private.publications values(new_publication_id,org,scope_id,revision,actor,p->>'idempotency_key',p,document,captured,projection,manifest,evidence_fp,publication_fp,(captured->>'as_of')::timestamptz,null,null);
 insert into operations_whole_scope_publication_private.receipts values(new_publication_id,receipt);
 if expected=0 then insert into operations_whole_scope_publication_private.heads values(org,scope_id,revision,new_publication_id);
 else update operations_whole_scope_publication_private.heads h set publication_revision=revision,publication_id=new_publication_id where h.organization_id=org and h.economic_scope_id=scope_id;end if;
 return receipt;
exception when lock_not_available then raise exception 'product_publication_lock_busy' using errcode='55P03';
end;$$;
revoke all on function operations_whole_scope_publication_private.publish_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function operations_whole_scope_publication_private.publish_v1(jsonb) to authenticated;
create function public.publish_operations_whole_scope_product_v1(p_command jsonb) returns jsonb
language sql security invoker set search_path='' set default_transaction_isolation='repeatable read' as $$select operations_whole_scope_publication_private.publish_v1(p_command);$$;
revoke all on function public.publish_operations_whole_scope_product_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.publish_operations_whole_scope_product_v1(jsonb) to authenticated;

-- Exact installed successor graph. Dynamic/generic dispatch remains a separate audit gate.
do $$declare entry oid:='operations_whole_scope_publication_private.publish_v1(jsonb)'::regprocedure;
 public_entry oid:='public.publish_operations_whole_scope_product_v1(jsonb)'::regprocedure;
 scope_calc oid:='operations_whole_scope_publication_private.calculate_scope_v1(jsonb)'::regprocedure;
begin
 if exists(select 1 from pg_proc p where p.prosrc ~ 'read_scope_invoice_kernel_compatible_v1[[:space:]]*\('
 and p.oid<>all(array[entry,'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)'::regprocedure::oid]))
 or exists(select 1 from pg_proc p where p.prosrc ~ 'operations_whole_scope_publication_private[.]publish_v1[[:space:]]*\(' and p.oid<>public_entry)
 or exists(select 1 from pg_proc p where p.prosrc ~ 'operations_whole_scope_publication_private[.]calculate_scope_v1[[:space:]]*\(' and p.oid<>entry)
 then raise exception 'installed_product_static_successor_graph_required' using errcode='55000';end if;
 if exists(select 1 from pg_proc p where p.oid=any(array[entry,scope_calc,
 'operations_whole_scope_publication_private.calculate_money_v1(jsonb,boolean)'::regprocedure::oid,
 'operations_whole_scope_publication_private.calculate_minor_v1(numeric)'::regprocedure::oid,
 'operations_whole_scope_publication_private.calculate_obligation_v1(jsonb)'::regprocedure::oid,
 'operations_whole_scope_publication_private.calculate_leaf_v1(jsonb)'::regprocedure::oid])
 and (p.proowner<>(select oid from pg_roles where rolname=current_user) or p.proconfig is distinct from array['search_path=""']::text[] or p.prosecdef is distinct from (p.oid=entry)
 or (p.oid<>entry and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE')))))
 or not exists(select 1 from pg_proc p where p.oid=public_entry and p.proowner=(select oid from pg_roles where rolname=current_user) and not p.prosecdef and p.proconfig=array['search_path=""','default_transaction_isolation=repeatable read']::text[])
 or not has_function_privilege('authenticated',entry,'EXECUTE') or not has_function_privilege('authenticated',public_entry,'EXECUTE')
 or has_function_privilege('service_role',entry,'EXECUTE') or has_function_privilege('service_role',public_entry,'EXECUTE') or has_function_privilege('anon',entry,'EXECUTE') or has_function_privilege('anon',public_entry,'EXECUTE')
 or has_function_privilege('authenticated',scope_calc,'EXECUTE') or has_function_privilege('service_role',scope_calc,'EXECUTE')
 then raise exception 'installed_product_owner_role_settings_required' using errcode='55000';end if;
end;$$;
