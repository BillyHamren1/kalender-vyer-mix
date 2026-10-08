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
insert into public.operations_finance_credit_v2_enrollments(key_id,source_organization_id,destination_organization_id)
select 'fixture_credit_v2',source_organization_id,destination_organization_id from public.operations_finance_invoice_enrollments;
insert into public.operations_finance_credit_v2_project_scopes(key_id,source_project_id,destination_project_id)
select 'fixture_credit_v2',source_project_id,destination_project_id from public.operations_finance_invoice_project_scopes;
create temp table credit_v2_fixture(payload jsonb);
insert into credit_v2_fixture select payload||jsonb_build_object('schema_version','finance-project-invoice-destination-v2',
 'source_economic_revision',1,'source_economic_publication_fingerprint',payload->>'source_publication_fingerprint',
 'source_publication_fingerprint',repeat('f',64),'credit_relationship_fingerprint',null,
 'allocations',jsonb_build_array((payload#>'{allocations,0}')||jsonb_build_object('credited_source_anchor',null,
 'source_anchor',encode(sha256(convert_to(array_to_string(array['finance-invoice-allocation-source-anchor-v1',
 payload->>'source_organization_id',payload->>'invoice_id',payload#>>'{allocations,0,allocation_id}',
 payload->>'document_fingerprint',payload->>'currency'],chr(10)),'UTF8')),'hex')))) from invoice_fixture;
grant select on invoice_fixture,credit_v2_fixture to service_role;
set local role service_role;
do $$ declare p jsonb:=(select payload from credit_v2_fixture);v1 jsonb:=(select payload from invoice_fixture);
 stamp text:=floor(extract(epoch from clock_timestamp()))::bigint::text;r jsonb;first_id text;denied boolean;
begin
 p:=jsonb_set(p,'{source_organization_id}',to_jsonb(upper(p->>'source_organization_id')));
 denied:=false;begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_default_off_nonce1',p::text);
 exception when insufficient_privilege then denied:=true;end;perform pg_temp.invoice_assert(denied,'v2 default-off enrollment');
 update public.operations_finance_credit_v2_enrollments set enabled=true;
 denied:=false;begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_disabled_scope_001',p::text);
 exception when insufficient_privilege then denied:=true;end;perform pg_temp.invoice_assert(denied,'v2 default-off scope');
 update public.operations_finance_credit_v2_project_scopes set enabled=true;
 update public.operations_finance_invoice_enrollments set enabled=true;update public.operations_finance_invoice_project_scopes set enabled=true;
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'v1_initial_original01',v1::text);
 r:=public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_disabled_scope_001',replace(p::text,': ',':'));
 first_id:=r->>'snapshot_receipt_id';perform pg_temp.invoice_assert(r->>'outcome'='accepted' and r->>'snapshot_fingerprint'=r->>'request_body_sha256','compact v2 raw SHA and scope denial leaves nonce unused');
 perform pg_temp.invoice_assert((select count(*)=1 and min(source_protocol)='v2' and min((envelope->>'recipient_net_minor')::bigint)=540000
 from public.operations_finance_invoice_economic_current_v2),'same-economic protocols normalize UUID casing and project one charge');
 r:=public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_exact_replay_00001',replace(p::text,': ',':'));
 perform pg_temp.invoice_assert(r->>'outcome'='replayed' and r->>'snapshot_receipt_id'=first_id,'fresh nonce immutable replay');
 denied:=false;begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_exact_replay_00001',replace(p::text,': ',':'));
 exception when insufficient_privilege then denied:=true;end;perform pg_temp.invoice_assert(denied,'persistent nonce replay denied');
 denied:=false;begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_bad_anchor_nonce01',
 jsonb_set(p||jsonb_build_object('source_revision',2),'{allocations,0,source_anchor}',to_jsonb(repeat('0',64)))::text);
 exception when invalid_parameter_value then denied:=true;end;perform pg_temp.invoice_assert(denied,'own anchor verified');
 denied:=false;begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_equal_fp_conflict1',
 (p||jsonb_build_object('source_revision',2,'source_economic_publication_fingerprint',repeat('c',64)))::text);
 exception when invalid_parameter_value then denied:=true;end;perform pg_temp.invoice_assert(denied,'equal v1/v2 economic fingerprint mismatch denied');
 denied:=false;begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_tied_money_denial1',
 jsonb_set(p||jsonb_build_object('source_revision',2,'recipient_net_minor',539000),'{allocations,0,amount_minor}','539000')::text);
 exception when invalid_parameter_value then denied:=true;end;perform pg_temp.invoice_assert(denied,'same opaque economic fingerprint cannot change selected amount');
 p:=jsonb_set(p||jsonb_build_object('source_revision',2,'source_economic_revision',2,'source_economic_publication_fingerprint',repeat('c',64),
 'recipient_net_minor',450000),'{allocations,0,amount_minor}','450000');
 perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_higher_economic01',p::text);
 v1:=jsonb_set(v1||jsonb_build_object('source_revision',2,'source_publication_fingerprint',repeat('c',64),'recipient_net_minor',450000),'{allocations,0,amount_minor}','450000');
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'v1_equal_late_version1',v1::text);
 perform pg_temp.invoice_assert((select source_protocol='v2' and source_economic_revision=2 and envelope->>'recipient_net_minor'='450000'
 from public.operations_finance_invoice_economic_current_v2),'late equal v1 no second charge');
 v1:=jsonb_set(v1||jsonb_build_object('source_revision',3,'source_publication_fingerprint',repeat('d',64),'recipient_net_minor',300000),'{allocations,0,amount_minor}','300000');
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'v1_newer_supersedes01',v1::text);
 p:=p||jsonb_build_object('source_revision',3);
 perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_relationship_old01',p::text);
 perform pg_temp.invoice_assert((select source_protocol='v1' and source_economic_revision=3 and envelope->>'recipient_net_minor'='300000'
 from public.operations_finance_invoice_economic_current_v2),'newer v1 supersedes stale relationship publication');
 denied:=false;begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_economic_decrease1',
 (p||jsonb_build_object('source_revision',4,'source_economic_revision',1))::text);
 exception when invalid_parameter_value then denied:=true;end;perform pg_temp.invoice_assert(denied,'v2 economic version cannot decrease');
 p:=jsonb_set(p||jsonb_build_object('source_revision',4,'source_economic_revision',3,'source_economic_publication_fingerprint',repeat('d',64),
 'recipient_net_minor',300000),'{allocations,0,amount_minor}','300000');
 perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_current_economics1',p::text);
 p:=p||jsonb_build_object('source_revision',5,'source_economic_revision',4,'source_economic_publication_fingerprint',repeat('e',64),
 'recipient_net_minor',0,'allocations','[]'::jsonb);
 perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_full_withdrawal01',p::text);
 perform pg_temp.invoice_assert((select source_protocol='v2' and source_economic_revision=4 and envelope->'allocations'='[]'::jsonb
 and envelope->>'recipient_net_minor'='0' and local_credit_eligibility='unresolved' and eac_minor is null
 from public.operations_finance_invoice_economic_current_v2),'full withdrawal and no fabricated eligibility/EAC');
 -- A first v1 head can arrive after v2. Frozen v1 stays untouched; unified view
 -- independently withholds a conflicting equal-version source instead of charging it.
 p:=(select payload from credit_v2_fixture);p:=p||jsonb_build_object('invoice_id','e6000000-0000-4000-8000-000000000090');
 p:=jsonb_set(p,'{allocations,0,source_anchor}',to_jsonb(encode(sha256(convert_to(array_to_string(array[
 'finance-invoice-allocation-source-anchor-v1',p->>'source_organization_id',p->>'invoice_id',p#>>'{allocations,0,allocation_id}',
 p->>'document_fingerprint',p->>'currency'],chr(10)),'UTF8')),'hex')));
 perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_before_first_v1_01',p::text);
 v1:=(select payload from invoice_fixture);v1:=jsonb_set(v1||jsonb_build_object('invoice_id',p->>'invoice_id','recipient_net_minor',530000),'{allocations,0,amount_minor}','530000');
 perform public.operations_receive_finance_project_invoice_destination_v1('fixture_invoice_sql',stamp,'v1_first_conflicts01',v1::text);
 perform pg_temp.invoice_assert((select source_protocol='conflict' and source_currentness='economic_fingerprint_conflict' and envelope is null
 and snapshot_id is null and eac_minor is null from public.operations_finance_invoice_economic_current_v2 where invoice_id=(p->>'invoice_id')::uuid),
 'late first v1 tied fingerprint but contradictory selected amount withholds current evidence');
 -- A valid signed-source linked credit remains local evidence only: the own
 -- credit anchor has no authenticated Operations obligation assignment.
 p:=(select payload from credit_v2_fixture);p:=p||jsonb_build_object('invoice_id','e6000000-0000-4000-8000-000000000091',
 'invoice_kind','credit','invoice_status','received','recipient_net_minor',-2000,'credit_relation_coverage','linked',
 'credit_relationship_fingerprint',repeat('8',64));
 p:=jsonb_set(jsonb_set(p,'{allocations,0,amount_minor}','-2000'),'{allocations,0,credited_source_anchor}',
 (select payload#>'{allocations,0,source_anchor}' from credit_v2_fixture));
 p:=jsonb_set(p,'{allocations,0,source_anchor}',to_jsonb(encode(sha256(convert_to(array_to_string(array[
 'finance-invoice-allocation-source-anchor-v1',p->>'source_organization_id',p->>'invoice_id',p#>>'{allocations,0,allocation_id}',
 p->>'document_fingerprint',p->>'currency'],chr(10)),'UTF8')),'hex')));
 perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',stamp,'v2_linked_no_binding1',p::text);
 perform pg_temp.invoice_assert((select envelope->>'recipient_net_minor'='-2000' and envelope->>'credit_relation_coverage'='linked'
 and local_credit_eligibility='unresolved' and eac_minor is null from public.operations_finance_invoice_economic_current_v2
 where invoice_id=(p->>'invoice_id')::uuid),'linked source metadata cannot invent own-credit obligation assignment');
 perform pg_temp.invoice_assert(not exists(select 1 from public.operations_finance_credit_v2_receipts where nonce in
 ('v2_bad_anchor_nonce01','v2_equal_fp_conflict1','v2_economic_decrease1','v2_tied_money_denial1')),'denials do not consume security nonce');
end $$;
do $$ declare denied boolean;begin
 denied:=false;begin update public.operations_finance_credit_v2_streams set current_revision=current_revision;
 exception when insufficient_privilege then denied:=true;end;perform pg_temp.invoice_assert(denied,'service cannot mutate V2 streams directly');
 denied:=false;begin insert into public.operations_finance_credit_v2_snapshots select * from public.operations_finance_credit_v2_snapshots limit 1;
 exception when insufficient_privilege then denied:=true;end;perform pg_temp.invoice_assert(denied,'service cannot insert arbitrary V2 snapshots directly');
 denied:=false;begin insert into public.operations_finance_credit_v2_receipts select * from public.operations_finance_credit_v2_receipts limit 1;
 exception when insufficient_privilege then denied:=true;end;perform pg_temp.invoice_assert(denied,'service cannot insert arbitrary V2 receipts directly');
 denied:=false;begin update public.operations_finance_credit_v2_enrollments set source_organization_id='e6000000-0000-4000-8000-000000000099';
 exception when object_not_in_prerequisite_state then denied:=true;end;perform pg_temp.invoice_assert(denied,'service cannot rewrite enrollment identity');
 denied:=false;begin update public.operations_finance_credit_v2_project_scopes set destination_project_id='e6000000-0000-4000-8000-000000000099';
 exception when object_not_in_prerequisite_state then denied:=true;end;perform pg_temp.invoice_assert(denied,'service cannot rewrite project capability identity');
end $$;
reset role;
select pg_temp.invoice_assert(not has_function_privilege('authenticated','public.operations_receive_finance_project_invoice_destination_v2(text,text,text,text)','EXECUTE')
 and not has_table_privilege('authenticated','public.operations_finance_credit_v2_snapshots','SELECT'), 'v2 service-only evidence boundary');
select pg_temp.invoice_assert(not has_table_privilege('service_role','public.operations_finance_credit_v2_streams','INSERT')
 and not has_table_privilege('service_role','public.operations_finance_credit_v2_streams','UPDATE')
 and not has_table_privilege('service_role','public.operations_finance_credit_v2_snapshots','INSERT')
 and not has_table_privilege('service_role','public.operations_finance_credit_v2_receipts','INSERT'),
 'explicit revoke removes inherited service writer privileges');
do $$ declare denied boolean;begin
 denied:=false;begin update public.operations_finance_credit_v2_streams set current_revision=current_revision-1;
 exception when object_not_in_prerequisite_state then denied:=true;end;perform pg_temp.invoice_assert(denied,'owner cannot rewind V2 source head');
 denied:=false;begin update public.operations_finance_credit_v2_streams set current_revision=current_revision+100;
 exception when object_not_in_prerequisite_state then denied:=true;end;perform pg_temp.invoice_assert(denied,'owner cannot point head to unsaved snapshot');
 denied:=false;begin update public.operations_finance_credit_v2_streams set invoice_id='e6000000-0000-4000-8000-000000000099';
 exception when object_not_in_prerequisite_state then denied:=true;end;perform pg_temp.invoice_assert(denied,'owner cannot rewrite stream identity');
 denied:=false;begin delete from public.operations_finance_credit_v2_streams;
 exception when object_not_in_prerequisite_state then denied:=true;end;perform pg_temp.invoice_assert(denied,'owner cannot delete source stream');
 denied:=false;begin truncate public.operations_finance_credit_v2_streams cascade;
 exception when object_not_in_prerequisite_state then denied:=true;end;perform pg_temp.invoice_assert(denied,'owner cannot truncate source stream');
end $$;
do $$ begin
 begin update public.operations_finance_credit_v2_snapshots set envelope='{}'::jsonb;raise exception 'v2 immutable snapshot updated';
 exception when object_not_in_prerequisite_state then null;end;
 begin truncate public.operations_finance_credit_v2_receipts;raise exception 'v2 immutable receipt truncated';
 exception when object_not_in_prerequisite_state then null;end;
end $$;
update public.projects set deleted_at=now();
set local role service_role;
do $$ declare denied boolean:=false;begin
 begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,
 'v2_deleted_project01',(select payload::text from credit_v2_fixture));exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.invoice_assert(denied,'actual deleted destination project denied');
end $$;
reset role;
update public.projects set deleted_at=null,organization_id='e6000000-0000-4000-8000-000000000099';
set local role service_role;
do $$ declare denied boolean:=false;begin
 begin perform public.operations_receive_finance_project_invoice_destination_v2('fixture_credit_v2',floor(extract(epoch from clock_timestamp()))::bigint::text,
 'v2_foreign_project01',(select payload::text from credit_v2_fixture));exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.invoice_assert(denied,'actual foreign destination project denied');
 perform pg_temp.invoice_assert(not exists(select 1 from public.operations_finance_credit_v2_receipts where nonce in
 ('v2_deleted_project01','v2_foreign_project01')),'actual project denial consumes no nonce');
end $$;
reset role;
select 'PASS Operations credit-v2 source evidence nonce/rawSHA/unified economic precedence/conflict/withdrawal/no eligibility' as result;
rollback;
