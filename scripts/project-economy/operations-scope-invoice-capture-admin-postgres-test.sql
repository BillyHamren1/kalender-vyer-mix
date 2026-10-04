\set ON_ERROR_STOP on
-- Rollback-only read fixture after the exact guarded whole-scope native seed.
begin;
do $$begin
 if current_database() !~ '^eventflow_scope_invoice_kernel_[a-z0-9_]+$'
 or current_setting('eventflow.scope_invoice_kernel_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('public.operations_scope_invoice_kernel_native_fixture') is null
 or (select count(*) from public.operations_scope_invoice_kernel_native_fixture)<>1
 or (select count(*) from public.operations_finance_invoice_streams)<>2
 or exists(select 1 from public.operations_finance_invoice_streams where organization_id<>'11111111-1111-4111-8111-111111111111' or current_revision<>1)
 or exists(select 1 from public.operations_finance_credit_v2_streams)
 or (select count(*) from public.operations_scope_obligation_compositions)<>1
 or not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id
 where p.user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.organization_id='11111111-1111-4111-8111-111111111111' and r.organization_id=p.organization_id and r.role='admin')
 then raise exception 'dedicated_exact_scope_invoice_admin_fixture_required' using errcode='22023';end if;
end;$$;
create temporary table scope_admin_vectors(label text primary key,evidence jsonb not null,request jsonb not null);
create function pg_temp.scope_admin_assert(v boolean,label text) returns void language plpgsql as $$begin
 if v is distinct from true then raise exception 'scope admin assertion failed: %',label;end if;end;$$;
create function pg_temp.scope_admin_counts() returns jsonb language sql as $$select jsonb_build_array(
 (select count(*) from public.operations_finance_invoice_snapshots),(select count(*) from public.operations_finance_invoice_receipts),
 (select count(*) from public.operations_finance_credit_v2_snapshots),(select count(*) from public.operations_finance_credit_v2_receipts),
 (select count(*) from public.operations_project_obligation_baselines),(select count(*) from public.operations_project_obligation_invoice_bindings),
 (select count(*) from public.operations_obligation_source_policies),(select count(*) from public.operations_scope_obligation_compositions),
 (select count(*) from public.operations_project_scope_snapshots));$$;
create function pg_temp.scope_admin_denied(p jsonb,code text,reason text,role_name text default 'authenticated') returns void language plpgsql as $$
declare actual_code text;actual_message text;begin
 if role_name not in ('authenticated','anon','service_role') then raise exception 'fixture_role_required';end if;
 execute format('set local role %I',role_name);
 begin perform public.read_operations_scope_invoice_capture_admin_v1(p);raise exception 'unexpected admin read acceptance';
 exception when others then get stacked diagnostics actual_code=returned_sqlstate,actual_message=message_text;end;
 execute 'reset role';
 if actual_code is distinct from code or (reason is not null and actual_message is distinct from reason) then
 raise exception 'expected %/% but received %/%',code,reason,actual_code,actual_message;end if;
end;$$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare fixture public.operations_scope_invoice_kernel_native_fixture%rowtype;request jsonb;r jsonb;counts jsonb;source jsonb;comp jsonb;current_ids jsonb;before_id uuid;
begin
 select * into strict fixture from public.operations_scope_invoice_kernel_native_fixture;
 select snapshot_id into strict before_id from public.operations_scope_obligation_compositions where composition_revision=1;
 request:=jsonb_build_object('schema_version','operations-scope-invoice-capture-admin-read.v1','root_kind','large_project',
 'root_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc','expected_composition_snapshot_id',before_id);
 counts:=pg_temp.scope_admin_counts();execute 'set local role authenticated';r:=public.read_operations_scope_invoice_capture_admin_v1(request);execute 'reset role';
 perform pg_temp.scope_admin_assert(counts=pg_temp.scope_admin_counts(),'reads append no economic evidence');
 perform pg_temp.scope_admin_assert((select count(*) from jsonb_object_keys(r))=3 and r->>'authority_scope'='canonical_scope_invoice_capture'
 and jsonb_array_length(r#>'{evidence,members}')=3 and jsonb_array_length(r#>'{evidence,source_inventory}')=3
 and r#>'{evidence,eac_minor}'='null'::jsonb and r#>'{evidence,credit_eligible}'='false'::jsonb,'exact copied partial capture');
 insert into scope_admin_vectors values('admin_initial',r,request);
 perform pg_temp.scope_admin_denied(request||jsonb_build_object('organization_id','11111111-1111-4111-8111-111111111111'),'22023','exact_scope_invoice_admin_request_required');
 perform pg_temp.scope_admin_denied(request||jsonb_build_object('root_id',jsonb_build_array(request->'root_id')),'22023','invalid_scope_invoice_admin_identity');
 perform pg_temp.scope_admin_denied(request||jsonb_build_object('root_kind',null),'22023','exact_scope_invoice_admin_request_required');
 perform pg_temp.scope_admin_denied(request||jsonb_build_object('expected_composition_snapshot_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),'PT409','displayed_scope_invoice_capture_changed');
 perform pg_temp.scope_admin_denied(request||jsonb_build_object('root_kind','project','root_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),'42501','scope_root_missing_or_foreign');
 perform pg_temp.scope_admin_denied(request,'42501',null,'anon');perform pg_temp.scope_admin_denied(request,'42501',null,'service_role');
 -- Genuine current role/profile/gate revocations, each rolled back explicitly.
 begin delete from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='admin';
 perform pg_temp.scope_admin_denied(request,'42501','organization_scope_admin_required');raise exception 'synthetic_role_rollback' using errcode='P0001';
 exception when sqlstate 'P0001' then if sqlerrm<>'synthetic_role_rollback' then raise;end if;end;
 begin update public.profiles set organization_id='88888888-8888-4888-8888-888888888888' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 perform pg_temp.scope_admin_denied(request,'42501','organization_scope_admin_required');raise exception 'synthetic_profile_rollback' using errcode='P0001';
 exception when sqlstate 'P0001' then if sqlerrm<>'synthetic_profile_rollback' then raise;end if;end;
 begin update public.operations_scope_invoice_kernel_read_gates set enabled=false;
 perform pg_temp.scope_admin_denied(request,'42501','scope_invoice_read_gate_disabled');raise exception 'synthetic_gate_rollback' using errcode='P0001';
 exception when sqlstate 'P0001' then if sqlerrm<>'synthetic_gate_rollback' then raise;end if;end;
 begin update public.operations_invoice_obligation_kernel_read_gates set enabled=false;
 perform pg_temp.scope_admin_denied(request,'42501','invoice_kernel_read_gate_disabled');raise exception 'synthetic_leaf_gate_rollback' using errcode='P0001';
 exception when sqlstate 'P0001' then if sqlerrm<>'synthetic_leaf_gate_rollback' then raise;end if;end;
 execute 'set local role authenticated';perform public.append_operations_obligation_source_policy_v1(fixture.policy_command);execute 'reset role';
 counts:=pg_temp.scope_admin_counts();execute 'set local role authenticated';r:=public.read_operations_scope_invoice_capture_admin_v1(request);execute 'reset role';
 perform pg_temp.scope_admin_assert(counts=pg_temp.scope_admin_counts(),'fresh policy capture read has no append');insert into scope_admin_vectors values('admin_new_policy',r,request);
 -- Graph changes are as-of, but the next read must reject a changed exact graph.
 begin insert into public.bookings values('Admin-Extra-Order','11111111-1111-4111-8111-111111111111',null);
 insert into public.large_project_bookings values('15151515-1515-4515-8515-151515151515','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Admin-Extra-Order');
 perform pg_temp.scope_admin_denied(request,'PT409','displayed_scope_invoice_capture_changed');raise exception 'synthetic_graph_rollback' using errcode='P0001';
 exception when sqlstate 'P0001' then if sqlerrm<>'synthetic_graph_rollback' then raise;end if;end;
 begin execute 'set local role authenticated';perform public.append_operations_manual_obligation_baseline_v1(fixture.baseline_command);execute 'reset role';
 perform pg_temp.scope_admin_denied(request,'PT409','displayed_scope_invoice_capture_changed');raise exception 'synthetic_baseline_rollback' using errcode='P0001';
 exception when sqlstate 'P0001' then if sqlerrm<>'synthetic_baseline_rollback' then raise;end if;end;
 source:=fixture.raw_source_correction::jsonb;
 execute 'set local role service_role';perform public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'admin_actual_source_correction',source::text);execute 'reset role';
 counts:=pg_temp.scope_admin_counts();execute 'set local role authenticated';r:=public.read_operations_scope_invoice_capture_admin_v1(request);execute 'reset role';
 perform pg_temp.scope_admin_assert(counts=pg_temp.scope_admin_counts(),'changed invoice read has no append');insert into scope_admin_vectors values('admin_corrected_source',r,request);
 execute 'set local role authenticated';comp:=public.compose_operations_scope_obligations_v1(fixture.compose_command||jsonb_build_object('expected_composition_revision',1,'baseline_event_ids','[]'::jsonb,'idempotency_key','admin_native_empty_selection'));execute 'reset role';
 perform pg_temp.scope_admin_denied(request,'PT409','displayed_scope_invoice_capture_changed');
 request:=request||jsonb_build_object('expected_composition_snapshot_id',comp->'snapshot_id');
 counts:=pg_temp.scope_admin_counts();execute 'set local role authenticated';r:=public.read_operations_scope_invoice_capture_admin_v1(request);execute 'reset role';
 perform pg_temp.scope_admin_assert(counts=pg_temp.scope_admin_counts() and jsonb_array_length(r#>'{evidence,members}')=0 and r#>'{evidence,eac_minor}'='null'::jsonb,'empty selection is copied unavailable with no append');
 insert into scope_admin_vectors values('admin_empty_selection',r,request);
end;$$;
select label,evidence::text,request::text from scope_admin_vectors order by label;
select 'operations-scope-invoice-capture-admin-postgres PASS' as result;
rollback;
