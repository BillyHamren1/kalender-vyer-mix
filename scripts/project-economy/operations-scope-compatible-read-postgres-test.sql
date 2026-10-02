-- Isolated direct PRODUCT-read compatibility proof. Controls roll back completely.
-- Actual native concurrency/JWT/owner caller proof is separate and required.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_compatible_read_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('operations_scope_reader_permission_native.fixture') is null
 or to_regprocedure('operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)') is null
 or (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4 or (select count(*) from public.user_roles)<>3
 or (select count(*) from public.projects)<>4 or (select count(*) from public.operations_project_scope_heads)<>2
 or exists(select 1 from public.operations_project_scope_heads where current_revision<>1)
 or exists(select 1 from public.operations_scope_obligation_composition_heads where current_revision<>1)
 or exists(select 1 from operations_scope_publication_native.publications)
 or exists(select 1 from operations_scope_publication_native.receipts)
 or exists(select 1 from operations_scope_publication_native.heads)
 or exists(select 1 from operations_scope_publication_native.blocked_controls)
 then raise exception 'fresh_disposable_compatible_read_fixture_required' using errcode='22023';end if;
end;$$;
create temporary table compatible_requests(case_id text primary key,service jsonb,admin jsonb);
insert into compatible_requests select 'unknown',read_request,jsonb_build_object('schema_version','operations-scope-invoice-capture-admin-read.v1','root_kind','packing_project','root_id','65656565-6565-4656-8656-656565656565','expected_composition_snapshot_id',c.snapshot_id) from operations_scope_reader_permission_native.fixture f join public.operations_scope_obligation_compositions c on c.economic_scope_id=(f.read_request->>'economic_scope_id')::uuid and c.composition_revision=1;
insert into compatible_requests select 'known',read_request,jsonb_build_object('schema_version','operations-scope-invoice-capture-admin-read.v1','root_kind','large_project','root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_composition_snapshot_id',c.snapshot_id) from public.operations_scope_invoice_kernel_native_fixture f join public.operations_scope_obligation_compositions c on c.economic_scope_id=(f.read_request->>'economic_scope_id')::uuid and c.composition_revision=1;
grant select on compatible_requests to authenticated,service_role;
create function pg_temp.compatible_assert(v boolean) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'compatible_reader_direct_assertion_failed' using errcode='22023';end if;end;$$;
-- Only timestamps are excluded from parity; all saved IDs, flags, fingerprints
-- and copied amounts remain exact. This helper does not calculate any money.
create function pg_temp.compatible_strip_times(v jsonb) returns jsonb language plpgsql as $$declare r jsonb;begin
 if jsonb_typeof(v)='object' then select coalesce(jsonb_object_agg(key,pg_temp.compatible_strip_times(value)),'{}') into r from jsonb_each(v) where key<>'as_of';return r;
 elsif jsonb_typeof(v)='array' then select coalesce(jsonb_agg(pg_temp.compatible_strip_times(value) order by ordinality),'[]') into r from jsonb_array_elements(v) with ordinality a(value,ordinality);return r;end if;return v;
end;$$;
create temporary table compatible_vectors(label text primary key,request jsonb,evidence jsonb);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
-- Owner call path is genuine frozen core. No role retains direct bypass.
insert into compatible_vectors select 'old_service_'||case_id,service,operations_economy_private.read_scope_invoice_kernel_v1(service) from compatible_requests;
insert into compatible_vectors select 'old_admin_'||case_id,admin,operations_economy_private.read_scope_invoice_capture_admin_v1(admin) from compatible_requests;
select pg_temp.compatible_assert(not has_function_privilege('service_role','operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','execute') and not has_function_privilege('authenticated','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)','execute') and has_function_privilege('service_role','public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)','execute') and has_function_privilege('authenticated','public.read_operations_scope_invoice_capture_admin_v1(jsonb)','execute'));
grant insert,select on compatible_vectors to authenticated,service_role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role service_role;
insert into compatible_vectors select 'new_service_'||case_id,service,public.read_operations_scope_invoice_kernel_evidence_v1(service) from compatible_requests;
do $$begin
 begin perform operations_economy_private.read_scope_invoice_kernel_v1(service) from compatible_requests where case_id='unknown';raise exception 'old_service_bypass_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin perform public.read_operations_scope_invoice_capture_admin_v1(admin) from compatible_requests where case_id='unknown';raise exception 'service_admin_role_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin perform public.read_operations_scope_invoice_kernel_evidence_v1(service||'{"expected_scope_revision":"1"}'::jsonb) from compatible_requests where case_id='unknown';raise exception 'numeric_string_accepted' using errcode='22023';exception when invalid_parameter_value then if sqlerrm<>'invalid_scope_invoice_revision' then raise;end if;end;
end;$$;
reset role;
set local role authenticated;
insert into compatible_vectors select 'new_admin_'||case_id,admin,public.read_operations_scope_invoice_capture_admin_v1(admin) from compatible_requests;
do $$begin
 begin perform operations_economy_private.read_scope_invoice_capture_admin_v1(admin) from compatible_requests where case_id='unknown';raise exception 'old_admin_bypass_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin perform public.read_operations_scope_invoice_kernel_evidence_v1(service) from compatible_requests where case_id='unknown';raise exception 'admin_service_role_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin perform public.read_operations_scope_invoice_capture_admin_v1(admin||'{"organization_id":"11111111-1111-4111-8111-111111111111"}'::jsonb) from compatible_requests where case_id='unknown';raise exception 'caller_organization_accepted' using errcode='22023';exception when invalid_parameter_value then if sqlerrm<>'exact_scope_invoice_admin_request_required' then raise;end if;end;
 begin perform public.read_operations_scope_invoice_capture_admin_v1(admin||'{"root_kind":"project","root_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}'::jsonb) from compatible_requests where case_id='unknown';raise exception 'foreign_root_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'scope_root_missing_or_foreign' then raise;end if;end;
end;$$;
reset role;
select pg_temp.compatible_assert((select count(*)=8 from compatible_vectors) and not exists(select 1 from compatible_vectors old join compatible_vectors new on new.label=replace(old.label,'old_','new_') where old.label like 'old_%' and pg_temp.compatible_strip_times(old.evidence) is distinct from pg_temp.compatible_strip_times(new.evidence)));
-- Missing/leaf actor denies before private hints.
select set_config('request.jwt.claims','{"role":"authenticated"}',true);set local role authenticated;
do $$begin begin perform public.read_operations_scope_invoice_capture_admin_v1(admin) from compatible_requests where case_id='unknown';raise exception 'missing_actor_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'authenticated_scope_admin_required' then raise;end if;end;end;$$;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
do $$begin begin perform public.read_operations_scope_invoice_capture_admin_v1(admin) from compatible_requests where case_id='unknown';raise exception 'leaf_grant_elevated' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'organization_scope_admin_required' then raise;end if;end;end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
-- Product endpoint priority: actual current policy denial precedes admin stale,
-- while the service preserves composition-first validation.
update public.packing_projects set status='ready' where id='65656565-6565-4656-8656-656565656565';
update public.operations_project_scope_packing_policies set enabled=false where organization_id='11111111-1111-4111-8111-111111111111' and status='ready';
set local role authenticated;
do $$begin begin perform public.read_operations_scope_invoice_capture_admin_v1(admin||'{"expected_composition_snapshot_id":"ffffffff-ffff-4fff-8fff-ffffffffffff"}'::jsonb) from compatible_requests where case_id='unknown';raise exception 'denied_policy_mislabeled_stale' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'scope_packing_missing_or_unenrolled' then raise;end if;end;end;$$;
reset role;set local role service_role;
do $$begin begin perform public.read_operations_scope_invoice_kernel_evidence_v1(service||'{"expected_composition_revision":2}'::jsonb) from compatible_requests where case_id='unknown';raise exception 'service_priority_changed' using errcode='22023';exception when invalid_parameter_value then if sqlerrm<>'current_scope_invoice_composition_required' then raise;end if;end;end;$$;
reset role;
update public.operations_project_scope_packing_policies set enabled=true where organization_id='11111111-1111-4111-8111-111111111111' and status='ready';
set local role authenticated;
do $$begin begin perform public.read_operations_scope_invoice_capture_admin_v1(admin) from compatible_requests where case_id='unknown';raise exception 'new_policy_bypassed_graph_stale' using errcode='22023';exception when sqlstate 'PT409' then if sqlerrm<>'displayed_scope_invoice_capture_changed' then raise;end if;end;end;$$;
reset role;
update public.packing_projects set status='planning' where id='65656565-6565-4656-8656-656565656565';
-- Disabled gates never become empty evidence or successful currentness.
update public.operations_scope_invoice_kernel_read_gates set enabled=false where organization_id='11111111-1111-4111-8111-111111111111';
set local role service_role;
do $$begin begin perform public.read_operations_scope_invoice_kernel_evidence_v1(service) from compatible_requests where case_id='unknown';raise exception 'gate_bypassed' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'scope_invoice_read_gate_disabled' then raise;end if;end;end;$$;
reset role;
update public.operations_scope_invoice_kernel_read_gates set enabled=true where organization_id='11111111-1111-4111-8111-111111111111';
select pg_temp.compatible_assert(not exists(select 1 from operations_scope_publication_native.publications) and not exists(select 1 from operations_scope_publication_native.receipts) and not exists(select 1 from operations_scope_publication_native.heads) and not exists(select 1 from operations_scope_publication_native.blocked_controls) and (select count(*)=4 and bool_and(current_revision=1) from public.operations_project_obligation_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_project_scope_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_scope_obligation_composition_heads) and (select count(*)=2 and bool_and(current_revision=1) from public.operations_finance_invoice_streams) and not exists(select 1 from public.operations_finance_credit_v2_streams));
-- Exact raw SQL evidence is exported before rollback by the private native runner.
select jsonb_agg(jsonb_build_object('label',label,'request',request,'evidence',evidence::text) order by label) as compatible_read_vectors from compatible_vectors;
rollback;
select 'operations-scope-compatible-read-direct PASS copied_parity_roles_bypass_priority_denials_no_cost_writes_rollback' as proof;
