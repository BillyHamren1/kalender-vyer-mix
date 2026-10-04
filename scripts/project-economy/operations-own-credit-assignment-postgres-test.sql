\set ON_ERROR_STOP on
-- Exact immutable authority fixture produced by operations-obligation-fixture.ts.
-- All source evidence arrives through actual service receiver RPCs; transaction rolls back.
begin;
create temporary table own_credit_fixture(data jsonb not null);
insert into own_credit_fixture values(:'fixture'::jsonb);
grant select on own_credit_fixture to authenticated,service_role;
create function pg_temp.credit_assert(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'own credit assertion failed: %',label;end if;end;$$;
create function pg_temp.credit_fail_event() returns trigger language plpgsql as $$begin raise exception 'synthetic own credit atomic failure' using errcode='22023';end;$$;
insert into public.operations_finance_invoice_enrollments values('fixture_own_credit_v1','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true,now());
insert into public.operations_finance_invoice_project_scopes values('fixture_own_credit_v1','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
insert into public.operations_finance_credit_v2_enrollments values('fixture_own_credit_v2','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',true,now());
insert into public.operations_finance_credit_v2_project_scopes values('fixture_own_credit_v2','56565656-5656-4565-8565-565656565656','55555555-5555-4555-8555-555555555555',true);
set local role service_role;
do $$declare f jsonb;r jsonb;begin select data into f from own_credit_fixture;
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_own_credit_v1',floor(extract(epoch from clock_timestamp()))::bigint::text,'synthetic_own_credit_original',f->>'rawInvoice');
 perform pg_temp.credit_assert(r->>'outcome'='accepted','real original receiver');end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare f jsonb;p jsonb;credit jsonb;command jsonb;bind jsonb;r jsonb;first jsonb;orig_snapshot uuid;credit_snapshot uuid;binding uuid;anchor text;original_anchor text;
 org uuid:='11111111-1111-4111-8111-111111111111';project uuid:='55555555-5555-4555-8555-555555555555';obligation uuid:='abababab-abab-4aba-8aba-abababababab';begin
 select data into f from own_credit_fixture;select id into orig_snapshot from public.operations_finance_invoice_snapshots where source_revision=1;
 original_anchor:=f->>'anchor';
 credit:=f->'invoice'||jsonb_build_object('schema_version','finance-project-invoice-destination-v2','invoice_id','89898989-8989-4898-8989-898989898989','invoice_kind','credit','document_fingerprint',repeat('c',64),
 'recipient_net_minor',-50000,'source_revision',1,'source_economic_revision',1,'source_economic_publication_fingerprint',repeat('d',64),'source_publication_fingerprint',repeat('e',64),'credit_relation_coverage','linked','credit_relationship_fingerprint',repeat('f',64));
 anchor:=operations_economy_private.invoice_source_anchor_v1('99999999-9999-4999-8999-999999999999','89898989-8989-4898-8989-898989898989',(f#>>'{invoice,allocations,0,allocation_id}')::uuid,repeat('c',64),'SEK');
 credit:=credit||jsonb_build_object('allocations',jsonb_build_array((f#>'{invoice,allocations,0}')||jsonb_build_object('amount_minor',-50000,'source_anchor',anchor,'credited_source_anchor',original_anchor)));
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v2('fixture_own_credit_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'synthetic_own_credit_v2_first',replace(credit::text,': ',':'));execute 'reset role';credit_snapshot:=(r->>'snapshot_receipt_id')::uuid;
 execute 'set local role authenticated';perform public.append_operations_manual_obligation_baseline_v1(f->'baseline');
 bind:=jsonb_build_object('schema_version','operations-obligation-invoice-bind.v1','project_id',project,'obligation_id',obligation,'expected_obligation_revision',1,'source_snapshot_id',orig_snapshot,'source_allocation_id',f#>>'{invoice,allocations,0,allocation_id}','expected_economic_revision',1,'expected_economic_fingerprint',repeat('a',64),'idempotency_key','synthetic-own-credit-original-bind','reason','Genuine positive original ownership');
 r:=public.bind_operations_invoice_obligation_v1(bind);binding:=(r->>'event_id')::uuid;
 command:=jsonb_build_object('schema_version','operations-obligation-credit-assign.v1','project_id',project,'obligation_id',obligation,'expected_baseline_revision',1,'credit_snapshot_id',credit_snapshot,'credit_allocation_id',f#>>'{invoice,allocations,0,allocation_id}','expected_credit_economic_revision',1,'expected_credit_economic_fingerprint',repeat('d',64),'expected_original_binding_event_id',binding,'expected_assignment_revision',0,'idempotency_key','synthetic-own-credit-assignment','reason','Assign actual own credit to same original obligation');
 -- Narrow direct-RPC strict type/auth negatives, not catch-all schema masking.
 for p in select value from jsonb_array_elements(jsonb_build_array(command||'{"amount_minor":-1}',command||'{"actor_system_user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',command||'{"expected_assignment_revision":"0"}',command||'{"expected_assignment_revision":9007199254740991}',command||'{"credit_snapshot_id":["89898989-8989-4898-8989-898989898989"]}')) loop
 begin perform public.assign_operations_obligation_own_credit_v1(p);raise exception 'invalid credit command accepted';exception when sqlstate '22023' then null;end;end loop;
 perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
 begin perform public.assign_operations_obligation_own_credit_v1(command);raise exception 'project role became budget admin';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
 r:=public.assign_operations_obligation_own_credit_v1(command||'{"expected_assignment_revision":1}');perform pg_temp.credit_assert(r->>'outcome'='stale' and r->>'current_revision'='0','initial stale no assignment');
 execute 'reset role';perform pg_temp.credit_assert(not exists(select 1 from public.operations_obligation_credit_assignment_heads) and not exists(select 1 from public.operations_project_obligation_source_ownership where source_anchor=anchor),'stale no ghost/permanent ownership');
 execute 'create trigger synthetic_credit_assignment_rollback before insert on public.operations_obligation_credit_assignments for each row execute function pg_temp.credit_fail_event()';execute 'set local role authenticated';
 begin perform public.assign_operations_obligation_own_credit_v1(command);raise exception 'injected atomic failure did not rollback';exception when sqlstate '22023' then if sqlerrm<>'synthetic own credit atomic failure' then raise;end if;end;
 execute 'reset role';perform pg_temp.credit_assert(not exists(select 1 from public.operations_obligation_credit_assignment_heads) and not exists(select 1 from public.operations_project_obligation_source_ownership where source_anchor=anchor),'event failure atomically rolls back head/ownership');execute 'drop trigger synthetic_credit_assignment_rollback on public.operations_obligation_credit_assignments';execute 'set local role authenticated';
 first:=public.assign_operations_obligation_own_credit_v1(command);perform pg_temp.credit_assert(first->>'outcome'='accepted' and first->>'revision'='1' and first->>'credit_eligible'='false' and first->'eac_minor'='null','real source assignment remains ineligible');
 r:=public.assign_operations_obligation_own_credit_v1(command);perform pg_temp.credit_assert(r->>'outcome'='replayed' and r->>'event_id'=first->>'event_id' and r->>'receipt_currentness'='historical_provenance_only','replay explicitly historical');
 begin perform public.assign_operations_obligation_own_credit_v1(command||'{"reason":"Different same-key explanation"}');raise exception 'changed idempotency accepted';exception when unique_violation then if sqlerrm<>'credit_assignment_idempotency_conflict' then raise;end if;end;
 execute 'reset role';perform pg_temp.credit_assert((select actor_system_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and proof->>'amount_minor'='-50000' and proof->>'credit_source_revision'='1' and proof->>'credit_relationship_fingerprint'=repeat('f',64) and proof->>'credited_source_anchor'=original_anchor and proof->>'credit_raw_sha256'=proof->>'credit_snapshot_fingerprint' from public.operations_obligation_credit_assignments),'saved actual actor/negative source/full relationship raw proof');
 execute 'set local role service_role';r:=public.read_operations_obligation_own_credit_v1(org,project,obligation,anchor);perform pg_temp.credit_assert(r->>'state'='assigned' and r->>'credit_eligible'='false' and r->'eac_minor'='null','current bound assignment no pricing authority');execute 'reset role';
 -- Relationship-only V2 revision: same money/economic FP is insufficient currentness.
 credit:=credit||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('0',64),'credit_relationship_fingerprint',repeat('1',64));
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v2('fixture_own_credit_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'synthetic_own_credit_relationship',credit::text);
 credit_snapshot:=(r->>'snapshot_receipt_id')::uuid;r:=public.read_operations_obligation_own_credit_v1(org,project,obligation,anchor);perform pg_temp.credit_assert(r->>'state'='unresolved' and r->>'reason'='changed_assignment_source_proof','relationship-only revision invalidates assignment');execute 'reset role';
 execute 'set local role authenticated';r:=public.assign_operations_obligation_own_credit_v1(command);perform pg_temp.credit_assert(r->>'receipt_currentness'='historical_provenance_only','historical retry not current assignment');
 command:=command||jsonb_build_object('credit_snapshot_id',credit_snapshot,'expected_assignment_revision',1,'idempotency_key','synthetic-own-credit-relation-rebind');
 r:=public.assign_operations_obligation_own_credit_v1(command);perform pg_temp.credit_assert(r->>'outcome'='accepted' and r->>'revision'='2','explicit new publication assignment CAS');execute 'reset role';
 execute 'set local role service_role';r:=public.read_operations_obligation_own_credit_v1(org,project,obligation,anchor);perform pg_temp.credit_assert(r->>'state'='assigned' and r#>>'{proof,credit_source_revision}'='2','new current exact relationship proof');execute 'reset role';
 -- A genuine newer original economic revision withholds the old source binding.
 begin
 p:=f->'invoice'||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('2',64));
 execute 'set local role service_role';perform public.operations_receive_finance_project_invoice_destination_v1('fixture_own_credit_v1',floor(extract(epoch from clock_timestamp()))::bigint::text,'synthetic_own_credit_original_new',p::text);
 r:=public.read_operations_obligation_own_credit_v1(org,project,obligation,anchor);perform pg_temp.credit_assert(r->>'state'='unresolved','new original economic revision invalidates assignment');execute 'reset role';
 raise exception 'synthetic rollback original correction' using errcode='22023';
 exception when sqlstate '22023' then if sqlerrm<>'synthetic rollback original correction' then raise;end if;end;
 -- Changing only the selected credited anchor cannot inherit old authority.
 begin
 p:=jsonb_set(credit||jsonb_build_object('source_revision',3,'source_publication_fingerprint',repeat('3',64),'credit_relationship_fingerprint',repeat('4',64)),'{allocations,0,credited_source_anchor}',to_jsonb(repeat('9',64)));
 execute 'set local role service_role';r:=public.operations_receive_finance_project_invoice_destination_v2('fixture_own_credit_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,'synthetic_own_credit_anchor_new',p::text);
 credit_snapshot:=(r->>'snapshot_receipt_id')::uuid;r:=public.read_operations_obligation_own_credit_v1(org,project,obligation,anchor);perform pg_temp.credit_assert(r->>'state'='unresolved','changed credited anchor invalidates assignment');execute 'reset role';
 execute 'set local role authenticated';begin perform public.assign_operations_obligation_own_credit_v1(command||jsonb_build_object('credit_snapshot_id',credit_snapshot,'expected_assignment_revision',2,'idempotency_key','synthetic-own-credit-wrong-anchor'));raise exception 'wrong credited original accepted';exception when sqlstate '22023' then if sqlerrm<>'current_bound_original_and_own_credit_required' then raise;end if;end;execute 'reset role';
 raise exception 'synthetic rollback changed anchor' using errcode='22023';
 exception when sqlstate '22023' then if sqlerrm<>'synthetic rollback changed anchor' then raise;end if;end;
 -- Baseline revision invalidates old assignment without releasing ownership.
 execute 'set local role authenticated';perform public.append_operations_manual_obligation_baseline_v1(f->'baseline'||'{"expected_revision":1,"idempotency_key":"synthetic-own-credit-new-baseline"}');execute 'reset role';
 execute 'set local role service_role';r:=public.read_operations_obligation_own_credit_v1(org,project,obligation,anchor);perform pg_temp.credit_assert(r->>'state'='unresolved','new baseline invalidates assignment');execute 'reset role';
 perform pg_temp.credit_assert((select count(*)=1 from public.operations_project_obligation_source_ownership where source_anchor=anchor),'permanent own anchor retained');
 begin update public.operations_obligation_credit_assignments set reason='rewrite';raise exception 'event rewrite accepted';exception when sqlstate '55000' then null;end;
 begin delete from public.operations_obligation_credit_assignment_heads;raise exception 'head delete accepted';exception when sqlstate '55000' then null;end;
 begin truncate public.operations_obligation_credit_assignments cascade;raise exception 'event truncate accepted';exception when sqlstate '55000' then null;end;
end;$$;
rollback;
select 'operations-own-credit-assignment-postgres PASS' as result;
