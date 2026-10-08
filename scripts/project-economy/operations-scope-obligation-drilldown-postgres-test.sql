\set ON_ERROR_STOP on
-- Synthetic fixture, genuine receiver/admin commands/read. Rollback-only.
begin;
create temporary table scope_evidence_fixture(data jsonb not null);
insert into scope_evidence_fixture values(:'fixture'::jsonb);
grant select on scope_evidence_fixture to authenticated,service_role;
create function pg_temp.scope_evidence_assert(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'scope evidence assertion failed: %',label;end if;end;$$;
insert into public.operations_finance_invoice_enrollments values('fixture_drilldown_read','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true,now());
insert into public.operations_finance_invoice_project_scopes values('fixture_drilldown_read','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare f jsonb;baseline jsonb;r jsonb;preview jsonb;enroll jsonb;compose jsonb;binding jsonb;snapshot uuid;event uuid;scope uuid:='90909090-9090-4909-8909-909090909090';org uuid:='11111111-1111-4111-8111-111111111111';project uuid:='55555555-5555-4555-8555-555555555555';root uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';saved jsonb;count_pub bigint;count_baseline bigint;count_comp bigint;request jsonb;policy jsonb;begin
 select data into f from scope_evidence_fixture;baseline:=f->'baseline';
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_drilldown_read',floor(extract(epoch from clock_timestamp()))::bigint::text,'fixture_drilldown_read_original_nonce',f->>'rawInvoice');snapshot:=(r->>'snapshot_receipt_id')::uuid;execute 'reset role';
 execute 'set local role authenticated';
 r:=public.read_operations_scope_obligation_evidence_v1(org,'project',project);
 perform pg_temp.scope_evidence_assert(r->>'state'='no_scope' and r->'economicScopeId'='null' and r->'knownEstimateMinor'='null' and r->'eacMinor'='null','unregistered root has no invented zero');
 preview:=public.preview_operations_project_scope_v1('large_project',root);
 enroll:=jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id',scope,'root_kind','large_project','root_id',root,'expected_revision',0,'expected_membership_fingerprint',preview->>'membership_fingerprint','idempotency_key','synthetic-drilldown-reader-enrollment','reason','Capture the actual root scope');perform public.enroll_operations_project_scope_v1(enroll);
 r:=public.read_operations_scope_obligation_evidence_v1(org,'large_project',root);perform pg_temp.scope_evidence_assert(r->>'state'='no_evidence' and r->>'economicScopeId'=scope::text and r->'knownCommitmentMinor'='null','enrolled empty scope is not zero');
 r:=public.append_operations_manual_obligation_baseline_v1(baseline);event:=(r->>'event_id')::uuid;
 binding:=jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',project,'obligation_id',baseline->>'obligation_id','expected_obligation_revision',1,'source_snapshot_id',snapshot,'source_allocation_id',f#>>'{invoice,allocations,0,allocation_id}','expected_economic_revision',1,'expected_economic_fingerprint',repeat('a',64),'idempotency_key','synthetic-drilldown-reader-binding','reason','Bind actual received allocation');perform public.bind_operations_invoice_obligation_v1(binding);
 compose:=jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',scope,'expected_scope_revision',1,'expected_membership_fingerprint',preview->>'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',jsonb_build_array(event),'idempotency_key','synthetic-drilldown-reader-first','reason','Save partial manual cost evidence');perform public.compose_operations_scope_obligations_v1(compose);
 saved:=public.read_operations_scope_obligation_evidence_v1(org,'large_project',root);

 request:=jsonb_build_object('schema_version','operations-scope-obligation-drilldown-read.v1','root_kind','large_project','root_id',root,'obligation_id',baseline->>'obligation_id','expected_composition_snapshot_id',saved->>'snapshotId','expected_baseline_event_id',event);
 begin perform public.read_operations_scope_obligation_drilldown_v1(request);raise exception 'disabled drilldown gate allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';insert into public.operations_invoice_obligation_kernel_read_gates values(org,true);execute 'set local role authenticated';
 r:=public.read_operations_scope_obligation_drilldown_v1(request);
 perform pg_temp.scope_evidence_assert(r->>'state'='received_evidence' and r#>>'{baseline,estimateMinor}'='1000000' and r#>'{baseline,committedMinor}'='null' and r#>>'{sources,0,amountMinor}'='540000' and r#>>'{sources,0,status}'='preliminary','same saved baseline/current copied invoice');
 perform pg_temp.scope_evidence_assert(r#>>'{sources,0,policyState}'='missing' and r#>'{sources,0,replacesEstimateMinor}'='null' and r#>'{sources,0,consumesCommitmentMinor}'='null','missing policy preserves null without hiding real cost');
 perform pg_temp.scope_evidence_assert((select count(*) from jsonb_object_keys(r))=22 and (select count(*) from jsonb_object_keys(r#>'{sources,0}'))=13 and not(r#>'{sources,0}' ?| array['source_organization_id','invoice_id','source_anchor','source_raw_sha256','rate_revision','hourly_rate_minor']),'exact protected redaction');
 perform pg_temp.scope_evidence_assert(r#>'{prognosis,eacMinor}'='null' and r#>'{prognosis,remainingMinor}'='null' and r#>'{prognosis,budgetMinor}'='null' and r#>'{prognosis,marginMinor}'='null' and r#>>'{coverage,credit}'='unavailable' and r#>>'{coverage,personnel}'='unavailable' and r#>>'{coverage,catering}'='unavailable','no invented forecast or complete categories');
 begin perform public.read_operations_scope_obligation_drilldown_v1(request||'{"actor_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');raise exception 'caller actor accepted';exception when sqlstate '22023' then null;end;
 begin perform public.read_operations_scope_obligation_drilldown_v1(request||'{"expected_composition_snapshot_id":"91919191-9191-4919-8919-919191919191"}');raise exception 'replaced capture allowed';exception when sqlstate 'PT409' then null;end;
 begin perform public.read_operations_scope_obligation_drilldown_v1(request||'{"obligation_id":"92929292-9292-4929-8929-929292929292"}');raise exception 'unselected obligation allowed';exception when sqlstate 'PT409' then null;end;
 -- Explicit policy copied; it may replace more estimate than observed invoice money.
 execute 'reset role';select jsonb_build_object('schema_version','operations-obligation-source-policy.v1','project_id',project,'obligation_id',baseline->>'obligation_id','baseline_event_id',event,'binding_event_id',b.event_id,'expected_policy_revision',0,'replaces_estimate_minor',700000,'consumes_commitment_minor',null,'idempotency_key','synthetic-drilldown-policy','reason','Explicit approved source allocation') into policy from public.operations_project_obligation_invoice_bindings b where b.organization_id=org and b.obligation_id=(baseline->>'obligation_id')::uuid;
 execute 'set local role authenticated';perform public.append_operations_obligation_source_policy_v1(policy);
 r:=public.read_operations_scope_obligation_drilldown_v1(request);
 perform pg_temp.scope_evidence_assert(r#>>'{sources,0,amountMinor}'='540000' and r#>>'{sources,0,replacesEstimateMinor}'='700000' and r#>'{sources,0,consumesCommitmentMinor}'='null' and r#>>'{sources,0,policyState}'='current','copies explicit policy without price cap or recomputation');
 execute 'reset role';select count(*) into count_pub from public.operations_finance_invoice_snapshots;select count(*) into count_baseline from public.operations_project_obligation_baselines;select count(*) into count_comp from public.operations_scope_obligation_compositions;execute 'set local role authenticated';
 perform public.read_operations_scope_obligation_drilldown_v1(request);execute 'reset role';
 perform pg_temp.scope_evidence_assert(count_pub=(select count(*) from public.operations_finance_invoice_snapshots) and count_baseline=(select count(*) from public.operations_project_obligation_baselines) and count_comp=(select count(*) from public.operations_scope_obligation_compositions),'read changes no source/baseline/composition money');
 -- Actual received rejection changes economic head; historical cost/policy cannot be reused.
 execute 'set local role service_role';perform public.operations_receive_finance_project_invoice_destination_v1('fixture_drilldown_read',floor(extract(epoch from clock_timestamp()))::bigint::text,'fixture_drilldown_rejected_nonce',jsonb_set((f->'invoice')||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('c',64),'invoice_status','rejected'),'{allocations,0,status}','"rejected"')::text);execute 'reset role';execute 'set local role authenticated';
 r:=public.read_operations_scope_obligation_drilldown_v1(request);
 perform pg_temp.scope_evidence_assert(r#>>'{sources,0,bindingState}'='unresolved' and r#>'{sources,0,amountMinor}'='null' and r#>'{sources,0,status}'='null' and r#>>'{sources,0,policyState}'='stale' and r#>'{sources,0,replacesEstimateMinor}'='null' and r#>>'{sources,0,reason}'='changed_invoice_economics','higher received rejection withholds old positive amount/policy');execute 'reset role';
 -- Current baseline change preserves exact displayed saved row, null current sources.
 execute 'set local role authenticated';perform public.append_operations_manual_obligation_baseline_v1(baseline||jsonb_build_object('expected_revision',1,'estimate_minor',2000000,'idempotency_key','synthetic-drilldown-new-baseline'));
 r:=public.read_operations_scope_obligation_drilldown_v1(request);perform pg_temp.scope_evidence_assert(r->>'state'='baseline_changed' and r#>>'{baseline,eventId}'=event::text and r#>>'{baseline,estimateMinor}'='1000000' and r->'sources'='[]' and r#>'{referenceCurrentness,baseline}'='false','no silent current baseline/money substitution');execute 'reset role';
 -- Removed/changed leaf graph is a business reload conflict, never source money.
 insert into public.projects(id,organization_id,deleted_at,booking_id) values('81818181-8181-4818-8818-818181818181',org,null,'Legacy-Order-42');execute 'set local role authenticated';
 begin perform public.read_operations_scope_obligation_drilldown_v1(request);raise exception 'changed membership returned money';exception when sqlstate 'PT409' then null;end;execute 'reset role';
 -- Actual admin-only boundary: signed project-role actor/grant cannot replace admin.
 perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);execute 'set local role authenticated';
 begin perform public.read_operations_scope_obligation_drilldown_v1(request);raise exception 'project role admitted to scope authority';exception when insufficient_privilege then null;end;execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);execute 'set local role authenticated';
 begin perform public.read_operations_scope_obligation_drilldown_v1(request);raise exception 'foreign profile admitted';exception when insufficient_privilege then null;end;execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
 delete from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id=org and role='admin';execute 'set local role authenticated';
 begin perform public.read_operations_scope_obligation_drilldown_v1(request);raise exception 'revoked admin admitted';exception when insufficient_privilege then null;end;execute 'reset role';
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);execute 'set local role authenticated';begin perform public.read_operations_scope_obligation_drilldown_v1(request);raise exception 'missing actor admitted';exception when insufficient_privilege then null;end;execute 'reset role';
 execute 'set local role service_role';begin perform public.read_operations_scope_obligation_drilldown_v1(request);raise exception 'service wrapper access allowed';exception when insufficient_privilege then null;end;execute 'reset role';
 perform pg_temp.scope_evidence_assert(has_function_privilege('authenticated','public.read_operations_scope_obligation_drilldown_v1(jsonb)','execute') and not has_function_privilege('anon','public.read_operations_scope_obligation_drilldown_v1(jsonb)','execute') and not has_function_privilege('service_role','public.read_operations_scope_obligation_drilldown_v1(jsonb)','execute'),'auth-only wrapper leaves general kernel service-only');
end;$$;
rollback;
select 'operations-scope-obligation-drilldown-postgres PASS' as result;
