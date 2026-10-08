-- Isolated rollback-only native PostgreSQL proof. No provider/account/official cost writes.
begin;
create function pg_temp.invoice_assert(value boolean,label text) returns void language plpgsql as $$ begin
 if value is distinct from true then raise exception 'assertion failed: %',label; end if;
end $$;
insert into public.projects(id,organization_id,deleted_at) values
 ('e6000000-0000-4000-8000-000000000004','e6000000-0000-4000-8000-000000000002',null);
insert into public.operations_finance_invoice_enrollments(key_id,source_organization_id,destination_organization_id)
values('fixture_invoice_sql','e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000002');
insert into public.operations_finance_invoice_project_scopes(key_id,source_project_id,destination_project_id)
values('fixture_invoice_sql','e6000000-0000-4000-8000-000000000003','e6000000-0000-4000-8000-000000000004');
create temporary table invoice_fixture(payload jsonb) on commit drop;
insert into invoice_fixture values(jsonb_build_object('schema_version','finance-project-invoice-destination-v1',
 'source_organization_id','e6000000-0000-4000-8000-000000000001','destination_organization_id','e6000000-0000-4000-8000-000000000002',
 'invoice_id','e6000000-0000-4000-8000-000000000005','source_revision',1,'source_publication_fingerprint',repeat('a',64),
 'source_observation_id','e6000000-0000-4000-8000-000000000006','provider_document_number','ISOLATED-5400',
 'document_fingerprint',repeat('b',64),'invoice_kind','invoice','currency','SEK','recipient_net_minor',540000,
 'invoice_status','in_approval','provider_source_changed',false,'accounting_state','booked','settlement_state','paid',
 'provider_approval_state','not_pending','credit_relation_coverage','not_applicable','allocations',jsonb_build_array(jsonb_build_object(
 'allocation_id','e6000000-0000-4000-8000-000000000007','project_id','e6000000-0000-4000-8000-000000000003',
 'cost_line_id','e6000000-0000-4000-8000-000000000008','destination_organization_id','e6000000-0000-4000-8000-000000000002',
 'destination_project_id','e6000000-0000-4000-8000-000000000004','amount_minor',540000,'consumes_commitment',true,'status','preliminary'))));
grant select on invoice_fixture to service_role;
set local role service_role;
do $$ declare p jsonb;r jsonb;raw text;stamp text:=floor(extract(epoch from clock_timestamp()))::bigint::text;
begin
 select payload into p from invoice_fixture;
 raw:=replace(p::text, ': ', ':');
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_default_off_01',raw);
 raise exception 'default-off enrollment accepted';exception when insufficient_privilege then null;end;
 perform pg_temp.invoice_assert(not exists(select 1 from public.operations_finance_invoice_snapshots),'default-off no snapshot');
 update public.operations_finance_invoice_enrollments set enabled=true where key_id='fixture_invoice_sql';
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_failed_scope_01',raw);
 raise exception 'disabled project scope accepted';exception when insufficient_privilege then null;end;
 update public.operations_finance_invoice_project_scopes set enabled=true where key_id='fixture_invoice_sql';
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_failed_scope_01',raw);
 perform pg_temp.invoice_assert(r->>'outcome'='accepted' and (select count(*) from jsonb_object_keys(r))=13,'failed scope did not consume nonce');
 perform pg_temp.invoice_assert(r->>'request_body_sha256'=encode(sha256(convert_to(raw,'UTF8')),'hex'),'compact raw hash exact');
 perform pg_temp.invoice_assert(r->>'snapshot_fingerprint'=r->>'request_body_sha256' and raw<>p::text,'snapshot binds exact compact bytes');
 perform pg_temp.invoice_assert((select envelope#>>'{allocations,0,status}' from public.operations_finance_invoice_current)='preliminary',
 'booked paid invoice remains preliminary before attest');
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_failed_scope_01',raw);
 raise exception 'nonce replay accepted';exception when insufficient_privilege then null;end;
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_fresh_replay_01',raw);
 perform pg_temp.invoice_assert(r->>'outcome'='replayed' and (select count(*) from public.operations_finance_invoice_snapshots)=1,'fresh nonce replay one snapshot');
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_changed_body_01',
 jsonb_set(p,'{provider_document_number}','"CHANGED"')::text);raise exception 'changed same revision accepted';
 exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$ declare p jsonb;stamp text:=floor(extract(epoch from clock_timestamp()))::bigint::text;begin
 select payload into p from invoice_fixture;
 delete from public.projects where id='e6000000-0000-4000-8000-000000000004';
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_missing_proj01',replace(p::text, ': ', ':'));
 raise exception 'missing destination accepted';exception when insufficient_privilege then null;end;
 insert into public.projects(id,organization_id,deleted_at) values('e6000000-0000-4000-8000-000000000004','e6000000-0000-4000-8000-000000000099',null);
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_foreign_proj01',replace(p::text, ': ', ':'));
 raise exception 'foreign destination accepted';exception when insufficient_privilege then null;end;
 update public.projects set organization_id='e6000000-0000-4000-8000-000000000002',deleted_at=now() where id='e6000000-0000-4000-8000-000000000004';
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_deleted_proj01',replace(p::text, ': ', ':'));
 raise exception 'deleted destination accepted';exception when insufficient_privilege then null;end;
 update public.projects set deleted_at=null where id='e6000000-0000-4000-8000-000000000004';
 perform pg_temp.invoice_assert(not exists(select 1 from public.operations_finance_invoice_receipts where nonce in('fixture_missing_proj01','fixture_foreign_proj01','fixture_deleted_proj01')),'invalid project scope consumes no nonce');
end $$;
set local role service_role;
-- Higher source revision confirms the same allocation, preserving economic identity.
do $$ declare p jsonb;r jsonb;changed jsonb;stamp text:=floor(extract(epoch from clock_timestamp()))::bigint::text;
begin
 select payload into p from invoice_fixture;
 changed:=p||jsonb_build_object('source_revision',2,'invoice_status','approved','source_publication_fingerprint',repeat('c',64));
 changed:=jsonb_set(changed,'{allocations,0,status}','"confirmed"');
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_confirmed_0001',changed::text);
 perform pg_temp.invoice_assert(r->>'outcome'='accepted' and (select count(*) from public.operations_finance_invoice_current)=1,'confirm same active invoice');
 perform pg_temp.invoice_assert((select envelope#>>'{allocations,0,amount_minor}' from public.operations_finance_invoice_current)='540000','confirmed amount unchanged');
 perform pg_temp.invoice_assert((select envelope#>>'{allocations,0,allocation_id}' from public.operations_finance_invoice_current)=p#>>'{allocations,0,allocation_id}','allocation identity stable');
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_old_replay_001',replace(p::text, ': ', ':'));
 perform pg_temp.invoice_assert(r->>'outcome'='replayed' and (r->>'current_source_revision')::integer=2,'older replay cannot revert head');
 changed:=changed||jsonb_build_object('source_revision',4,'source_publication_fingerprint',repeat('d',64));
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_version_four_1',changed::text);
 r:=public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_stale_version_1',
 (changed||jsonb_build_object('source_revision',3))::text);
 perform pg_temp.invoice_assert(r->>'outcome'='stale' and (r->>'requested_source_revision')::integer=3
 and (r->>'applied_source_revision')::integer=4 and (r->>'current_source_revision')::integer=4,'out-of-order receipt bound to newer committed snapshot');
 changed:=p||jsonb_build_object('source_revision',5,'source_publication_fingerprint',repeat('e',64),'recipient_net_minor',0,'allocations','[]'::jsonb);
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_withdrawal_01',changed::text);
 perform pg_temp.invoice_assert((select jsonb_array_length(envelope->'allocations') from public.operations_finance_invoice_current)=0,'empty snapshot withdraws old destination');
 perform pg_temp.invoice_assert((select count(*) from public.operations_finance_invoice_snapshots)=4,'immutable prior evidence remains after withdrawal');
end $$;
-- Tenant/project/shape/freshness negative tests roll back each attempted mutation.
do $$ declare p jsonb;changed jsonb;stamp text:=floor(extract(epoch from clock_timestamp()))::bigint::text;
begin
 select payload into p from invoice_fixture;p:=p||jsonb_build_object('source_revision',6);
 for changed in select value from jsonb_array_elements(jsonb_build_array(
 jsonb_set(p,'{source_organization_id}','"e6000000-0000-4000-8000-000000000099"'),
 jsonb_set(p,'{destination_organization_id}','"e6000000-0000-4000-8000-000000000098"'),
 jsonb_set(p,'{allocations,0,destination_project_id}','"e6000000-0000-4000-8000-000000000097"'),
 jsonb_set(p,'{allocations,0,destination_organization_id}','"e6000000-0000-4000-8000-000000000096"'))) loop
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_scope_denial_1',changed::text);
 raise exception 'foreign organization/project accepted';exception when insufficient_privilege then null;end;
 end loop;
 for changed in select value from jsonb_array_elements(jsonb_build_array(
 p||jsonb_build_object('signed_net_minor',540000),p||jsonb_build_object('unallocated_minor',0),
 jsonb_set(p,'{recipient_net_minor}','540001'),jsonb_set(p,'{allocations,0,amount_minor}','"540000"'),
 jsonb_set(p,'{recipient_net_minor}','1.5'),jsonb_set(p,'{invoice_status}','null'))) loop
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_shape_denial_1',changed::text);
 raise exception 'malformed recipient contract accepted';exception when invalid_parameter_value then null;end;
 end loop;
 begin perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql','1000000000','fixture_old_timestamp',p::text);
 raise exception 'expired timestamp accepted';exception when invalid_parameter_value then null;end;
 perform pg_temp.invoice_assert((select max(current_revision) from public.operations_finance_invoice_streams)=5,'denials did not advance head');
 perform pg_temp.invoice_assert(not exists(select 1 from public.operations_finance_invoice_receipts where nonce in ('fixture_scope_denial_1','fixture_shape_denial_1')),'failed requests did not consume security nonce');
 -- Rejection remains evidence; no existing obligation is erased by this shadow model.
 p:=jsonb_set(p||jsonb_build_object('invoice_status','rejected'),'{allocations,0,status}','"rejected"');
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_rejected_00001',p::text);
 perform pg_temp.invoice_assert((select envelope#>>'{allocations,0,status}' from public.operations_finance_invoice_current)='rejected','rejected document retained as explicit evidence');
 -- Separate credit identity retains unresolved relation coverage instead of guessing an obligation.
 p:=p||jsonb_build_object('invoice_id','e6000000-0000-4000-8000-000000000090','source_revision',1,'invoice_kind','credit',
 'invoice_status','received','recipient_net_minor',-540000,'credit_relation_coverage','unresolved');
 p:=jsonb_set(jsonb_set(p,'{allocations,0,amount_minor}','-540000'),'{allocations,0,status}','"preliminary"');
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'fixture_credit_0000001',p::text);
 perform pg_temp.invoice_assert((select envelope->>'credit_relation_coverage' from public.operations_finance_invoice_current where invoice_id='e6000000-0000-4000-8000-000000000090')='unresolved','credit relation coverage remains open');
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.operations_receive_finance_project_invoice_destination_v1(text,text,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.operations_receive_finance_project_invoice_destination_v1(text,text,text,text)','EXECUTE') then
 raise exception 'client may ingest invoice evidence';end if;
 if has_schema_privilege('anon','operations_invoice_private','USAGE')
 or has_schema_privilege('authenticated','operations_invoice_private','USAGE')
 or has_function_privilege('authenticated','operations_invoice_private.receive_finance_project_invoice_destination_v1(text,text,text,text)','EXECUTE') then
 raise exception 'client may invoke private receiver';end if;
 if has_table_privilege('authenticated','public.operations_finance_invoice_snapshots','SELECT') then raise exception 'private source evidence exposed';end if;
 begin update public.operations_finance_invoice_snapshots set envelope='{}';raise exception 'immutable snapshot updated';
 exception when object_not_in_prerequisite_state then null;end;
 begin truncate public.operations_finance_invoice_snapshots cascade;raise exception 'immutable snapshot truncated';
 exception when object_not_in_prerequisite_state then null;end;
end $$;
select 'PASS operations invoice destination SQL contract' as result;
rollback;
