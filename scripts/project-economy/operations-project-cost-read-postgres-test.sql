\set ON_ERROR_STOP on
-- Native disposable SQL, authenticated role and actual publication/receipt calls.
create temporary table cost_read_fixture(data jsonb not null);
insert into cost_read_fixture values(:'fixture'::jsonb);
create function pg_temp.cost_read_assert(value boolean,label text) returns void language plpgsql as $$ begin
 if value is distinct from true then raise exception 'cost evidence read failed: %',label;end if;
end $$;
begin;
do $$ declare f jsonb;r jsonb;org uuid:='11111111-1111-4111-8111-111111111111';project uuid:='55555555-5555-4555-8555-555555555555';
begin
 select data into strict f from cost_read_fixture;
 perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
 execute 'set local role authenticated';
 r:=public.read_operations_project_cost_evidence_v1(org,project);
 perform pg_temp.cost_read_assert(jsonb_array_length(r->'personnel')=0 and jsonb_array_length(r->'invoices')=0,'no evidence is arrays, no invented zero');
 begin perform public.read_operations_project_cost_evidence_v1(project,project);raise exception 'foreign requested organization read';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform public.publish_operations_personnel_cost_v1(f->'initial',f->'raw',0,'synthetic-read-initial');
 perform public.publish_operations_personnel_cost_v1(f->'confirmed',f->'raw',1,'synthetic-read-confirmed');
 perform public.publish_operations_personnel_cost_v1(f->'corrected',f->'rawCorrection',2,'synthetic-read-corrected');
 execute 'set local role authenticated';
 r:=public.read_operations_project_cost_evidence_v1(org,project);
 perform pg_temp.cost_read_assert(jsonb_array_length(r->'personnel')=1 and r#>>'{personnel,0,amountMinor}'='45000'
   and r#>>'{personnel,0,timeVersion}'='2' and r#>>'{personnel,0,revision}'='3','current correction replaces older60000 once');
  perform pg_temp.cost_read_assert(not((r->'personnel'->0) ?| array['hourly_rate_minor','rate_revision','worker_id','raw_time_snapshot']),'no private rate or source document');
  perform pg_temp.cost_read_assert(r#>>'{personnel,0,streamKey}' ~ '^[0-9a-f]{64}$'
    and position('44444444-4444-4444-8444-444444444444' in r::text)=0,'opaque stream key redacts personnel identity');
 execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
 execute 'set local role authenticated';
 begin perform public.read_operations_project_cost_evidence_v1(org,project);raise exception 'ungranted project role read';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
 execute 'set local role authenticated';
 begin perform public.read_operations_project_cost_evidence_v1(org,project);raise exception 'foreign organization admin read';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claims','{}',true);execute 'set local role authenticated';
 begin perform public.read_operations_project_cost_evidence_v1(org,project);raise exception 'missing actor read';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
-- Same source invoice/allocation transitions then withdraws; no provider is called.
insert into public.operations_finance_invoice_enrollments(key_id,source_organization_id,destination_organization_id,enabled)
 values('cost_read_invoice','e7000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',true);
insert into public.operations_finance_invoice_project_scopes(key_id,source_project_id,destination_project_id,enabled)
 values('cost_read_invoice','e7000000-0000-4000-8000-000000000002','55555555-5555-4555-8555-555555555555',true);
do $$ declare p jsonb;r jsonb;stamp text:=floor(extract(epoch from clock_timestamp()))::bigint::text;
begin
 p:=jsonb_build_object('schema_version','finance-project-invoice-destination-v1',
 'source_organization_id','e7000000-0000-4000-8000-000000000001','destination_organization_id','11111111-1111-4111-8111-111111111111',
 'invoice_id','e7000000-0000-4000-8000-000000000003','source_revision',1,'source_publication_fingerprint',repeat('a',64),
 'source_observation_id','e7000000-0000-4000-8000-000000000004','provider_document_number','READ-5400','document_fingerprint',repeat('b',64),
 'invoice_kind','invoice','currency','SEK','recipient_net_minor',540000,'invoice_status','in_approval','provider_source_changed',false,
 'accounting_state','booked','settlement_state','paid','provider_approval_state','not_pending','credit_relation_coverage','not_applicable',
 'allocations',jsonb_build_array(jsonb_build_object('allocation_id','e7000000-0000-4000-8000-000000000005',
 'project_id','e7000000-0000-4000-8000-000000000002','cost_line_id','e7000000-0000-4000-8000-000000000006',
 'destination_organization_id','11111111-1111-4111-8111-111111111111','destination_project_id','55555555-5555-4555-8555-555555555555',
 'amount_minor',540000,'consumes_commitment',true,'status','preliminary')));
 execute 'set local role service_role';
 perform public.operations_receive_finance_project_invoice_destination_v1('cost_read_invoice',stamp,'cost_read_nonce_initial',p::text);
 execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);execute 'set local role authenticated';
 r:=public.read_operations_project_cost_evidence_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555');
 perform pg_temp.cost_read_assert(r#>>'{invoices,0,amountMinor}'='540000' and r#>>'{invoices,0,status}'='preliminary'
  and r#>>'{invoices,0,settlementState}'='paid','paid invoice stays preliminary before Finance approval');
 execute 'reset role';
 p:=p||jsonb_build_object('source_revision',2,'allocations','[]'::jsonb,'recipient_net_minor',0);
 execute 'set local role service_role';
 perform public.operations_receive_finance_project_invoice_destination_v1('cost_read_invoice',stamp,'cost_read_nonce_withdraw',p::text);
 execute 'reset role';execute 'set local role authenticated';
 r:=public.read_operations_project_cost_evidence_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555');
 perform pg_temp.cost_read_assert(jsonb_array_length(r->'invoices')=0,'withdrawn invoice does not reappear from historical rows');
 execute 'reset role';
 perform pg_temp.cost_read_assert((select count(*) from public.operations_finance_invoice_snapshots where invoice_id='e7000000-0000-4000-8000-000000000003')=2,'history not deleted by read');
end $$;
rollback;
begin;
do $$ declare f jsonb;r jsonb;begin
 select data into strict f from cost_read_fixture;
 perform public.publish_operations_personnel_cost_v1(f->'initialMissing',f->'raw',0,'synthetic-read-missing-rate');
 perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);execute 'set local role authenticated';
 r:=public.read_operations_project_cost_evidence_v1('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555');
 perform pg_temp.cost_read_assert(r#>'{personnel,0,amountMinor}'='null'::jsonb and r->>'missingPersonnelCostCount'='1','actual engine missing-rate null preserved');
 execute 'reset role';
 perform pg_temp.cost_read_assert(not has_function_privilege('anon','public.read_operations_project_cost_evidence_v1(uuid,uuid)','EXECUTE'),'anonymous read denied');
end $$;
select 'PASS operations project cost evidence read' as result;
rollback;
