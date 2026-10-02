\set ON_ERROR_STOP on
-- Isolated engine-generated two-project fixture, not a live attest or payroll action.
begin;
create temporary table project_publication_fixture(data jsonb not null);
insert into project_publication_fixture values(:'fixture'::jsonb);
create function pg_temp.publication_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'project publication assertion failed: %',label;end if;end;$$;
create function pg_temp.fail_project_proof_insert() returns trigger language plpgsql as $$
begin raise exception 'synthetic proof insert failure' using errcode='22023';end;$$;
insert into public.operations_personnel_target_bindings(organization_id,source_system,target_kind,external_id,target_version,source_project_id,source_booking_id,currency,source_reference)
values('11111111-1111-4111-8111-111111111111','planning','project','77777777-7777-4777-8777-777777777777','binding-v1',
 '77777777-7777-4777-8777-777777777777',null,'SEK','isolated-two-project-review-publication');
do $$
declare f jsonb;snapshot jsonb;evidence jsonb;stream text;result jsonb;first_receipt jsonb;
  a uuid:='55555555-5555-4555-8555-555555555555';b uuid:='77777777-7777-4777-8777-777777777777';
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';review_a jsonb;review_b jsonb;reopen_a jsonb;reject_a jsonb;current_snapshot jsonb;projected jsonb;
begin
  select data into strict f from project_publication_fixture;snapshot:=f->'snapshot';stream:=snapshot->>'source_time_stream_id';
  evidence:=jsonb_build_object('schema','operations-personnel-source-evidence-v1','personnel_id','99999999-9999-4999-8999-999999999999',
    'source_system','planning','external_personnel_id','44444444-4444-4444-8444-444444444444','project_review_sequence',0,
    'project_review_status','preliminary','raw_snapshot',(f->'raw')::text,'raw_snapshot_sha256',encode(sha256(convert_to((f->'raw')::text,'UTF8')),'hex'),
    'persisted_sync_state','synced','submission_state','submitted','submission_decision_sequence',0);
  result:=public.publish_operations_personnel_cost_outbox_v1(snapshot,f->'raw',evidence,0,'synthetic-project-publication-source');
  perform pg_temp.publication_assert(result->>'status'='accepted','trusted frozen initial economics');
  -- A caller-supplied/day-wide confirmed status has no authority in the deriver.
  select jsonb_set(snapshot,'{lines}',jsonb_agg(jsonb_set(value,'{status}','"confirmed"'))) into current_snapshot from jsonb_array_elements(snapshot->'lines');
  projected:=operations_economy_private.derive_project_status_snapshot_v1(current_snapshot,'submitted',1);
  perform pg_temp.publication_assert((select bool_and(value->>'status'='preliminary') from jsonb_array_elements(projected#>'{snapshot,lines}')),'whole Time day approval never confirms projects');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  review_a:=public.review_operations_project_personnel_v1(stream,a,1,0,'approved',null,'synthetic-publication-review-a');
  first_receipt:=public.publish_operations_project_personnel_reviews_v1(stream,a,1,(review_a->>'review_sequence')::bigint,'synthetic-publish-project-a');
  execute 'reset role';
  perform pg_temp.publication_assert(first_receipt->>'status'='accepted' and first_receipt->>'source_revision'='2','authorized review atomically publishes');
  select cost_snapshot into strict current_snapshot from public.operations_personnel_cost_current;
  perform pg_temp.publication_assert(current_snapshot#>>'{lines,0,status}'='confirmed' and current_snapshot#>>'{lines,1,status}'='preliminary','A approved B preliminary');
  perform pg_temp.publication_assert((select count(*)=2 from public.operations_personnel_project_publication_proofs where source_revision=2),'complete per-project proof links');
  perform pg_temp.publication_assert((select economics_match and review_event_id=(review_a->>'event_id')::uuid and applied_status='confirmed'
    from public.operations_personnel_project_publication_proofs where source_revision=2 and project_id=a),'A exact immutable review proof');
  perform pg_temp.publication_assert((select not economics_match and review_event_id is null and applied_status='preliminary'
    from public.operations_personnel_project_publication_proofs where source_revision=2 and project_id=b),'unreviewed B has no fabricated decision');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  review_b:=public.review_operations_project_personnel_v1(stream,b,2,0,'approved',null,'synthetic-publication-review-b');
  result:=public.publish_operations_project_personnel_reviews_v1(stream,b,2,(review_b->>'review_sequence')::bigint,'synthetic-publish-project-b');
  reopen_a:=public.review_operations_project_personnel_v1(stream,a,3,(review_a->>'review_sequence')::bigint,'reopened','A needs another review','synthetic-publication-reopen-a');
  result:=public.publish_operations_project_personnel_reviews_v1(stream,a,3,(reopen_a->>'review_sequence')::bigint,'synthetic-publish-reopened-a');
  execute 'reset role';
  perform pg_temp.publication_assert(result->>'source_revision'='4','reopen has independent publication order');
  select cost_snapshot into strict current_snapshot from public.operations_personnel_cost_current;
  perform pg_temp.publication_assert(current_snapshot#>>'{lines,0,status}'='preliminary' and current_snapshot#>>'{lines,1,status}'='confirmed','reopen A keeps B approved');
  perform pg_temp.publication_assert((select bool_and(value->>'amount_minor'='60000' and value->>'hourly_rate_minor'='30000') from jsonb_array_elements(current_snapshot->'lines')),'all saved amounts/rates unchanged');
  perform pg_temp.publication_assert((select count(*)=4 from public.operations_personnel_cost_publications) and
    (select count(*)=4 from public.operations_personnel_cost_outbox) and
    (select count(*)=3 from public.operations_personnel_project_publication_links),'every review publication and outbox atomic');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.publish_operations_project_personnel_reviews_v1(stream,a,1,(review_a->>'review_sequence')::bigint,'synthetic-publish-project-a');
  execute 'reset role';
  perform pg_temp.publication_assert(result->>'status'='duplicate' and result->>'outbox_id'=first_receipt->>'outbox_id','historical exact retry original receipt');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.publish_operations_project_personnel_reviews_v1(stream,a,1,(review_a->>'review_sequence')::bigint,'synthetic-stale-source-publish');
  execute 'reset role';perform pg_temp.publication_assert(result->>'status'='stale_source','stale source denied without append');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.publish_operations_project_personnel_reviews_v1(stream,a,4,(review_a->>'review_sequence')::bigint,'synthetic-stale-review-publish');
  begin perform public.publish_operations_project_personnel_reviews_v1(stream,a,1,(reopen_a->>'review_sequence')::bigint,'synthetic-publish-project-a');
    raise exception 'changed retry accepted';exception when sqlstate '23505' then null;end;
  begin perform public.publish_operations_personnel_cost_v1(snapshot,f->'raw',0,'synthetic-direct-forged-cost');
    raise exception 'authenticated arbitrary cost publication allowed';exception when insufficient_privilege then null;end;
  execute 'reset role';perform pg_temp.publication_assert(result->>'status'='stale_review','stale review head denied');
  -- A failure after publication+outbox insertion still rolls all three ledgers back.
  execute 'create trigger synthetic_project_proof_failure before insert on public.operations_personnel_project_publication_proofs for each row execute function pg_temp.fail_project_proof_insert()';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  begin perform public.publish_operations_project_personnel_reviews_v1(stream,a,4,(reopen_a->>'review_sequence')::bigint,'synthetic-project-proof-failure');
    raise exception 'failed proof accepted';exception when sqlstate '22023' then
    if sqlerrm<>'synthetic proof insert failure' then raise;end if;end;
  execute 'reset role';execute 'drop trigger synthetic_project_proof_failure on public.operations_personnel_project_publication_proofs';
  perform pg_temp.publication_assert((select current_revision=4 from public.operations_personnel_cost_streams) and
    (select count(*)=4 from public.operations_personnel_cost_publications) and (select count(*)=4 from public.operations_personnel_cost_outbox) and
    (select count(*)=3 from public.operations_personnel_project_publication_links),'failed proof insertion rolls back head, cost, outbox and link');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  reopen_a:=public.review_operations_project_personnel_v1(stream,a,4,(reopen_a->>'review_sequence')::bigint,'rejected','A allocation is rejected','synthetic-publication-reject-a');
  execute 'reset role';
  -- A current explicit rejection remains noncharging during a source correction;
  -- only still-confirmed approvals are downgraded. Rejection is fingerprint-bound.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  reject_a:=public.review_operations_project_personnel_v1(stream,a,4,(reopen_a->>'review_sequence')::bigint,'rejected','Allocation belongs elsewhere','synthetic-publication-reject-a');
  result:=public.publish_operations_project_personnel_reviews_v1(stream,a,4,(reject_a->>'review_sequence')::bigint,'synthetic-publish-rejected-a');
  execute 'reset role';
  result:=public.publish_operations_personnel_cost_outbox_v1(jsonb_set(snapshot,'{source_revision}','6'),f->'raw',
    evidence||jsonb_build_object('submission_state','correction_requested','submission_decision_sequence',8),5,'synthetic-publish-source-correction');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.publish_operations_project_personnel_reviews_v1(stream,b,6,(review_b->>'review_sequence')::bigint,'synthetic-publish-correction-status');
  execute 'reset role';
  select cost_snapshot into strict current_snapshot from public.operations_personnel_cost_current;
  perform pg_temp.publication_assert(current_snapshot#>>'{lines,0,status}'='rejected' and current_snapshot#>>'{lines,1,status}'='preliminary','correction preserves matching rejected A and downgrades approved B');
  perform pg_temp.publication_assert((select bool_and(value->>'amount_minor'='60000') from jsonb_array_elements(current_snapshot->'lines')),'correction leaves frozen money unchanged');
  perform pg_temp.publication_assert((select economics_match and review_event_id=(reject_a->>'event_id')::uuid and applied_status='rejected' and invalidation_reason is null
    from public.operations_personnel_project_publication_proofs where source_revision=7 and project_id=a),'matching rejection has durable noncharging proof');
  perform pg_temp.publication_assert((select invalidation_reason='source_correction_requested' and applied_status='preliminary'
    from public.operations_personnel_project_publication_proofs where source_revision=7 and project_id=b),'confirmation source invalidation has durable proof');
  projected:=operations_economy_private.derive_project_status_snapshot_v1(jsonb_set(current_snapshot,'{source_snapshot_hash}',to_jsonb(repeat('f',64))),'correction_requested',8);
  perform pg_temp.publication_assert((select bool_and(value->>'status'='preliminary') from jsonb_array_elements(projected#>'{snapshot,lines}')),'new source fingerprint invalidates prior rejection');
  perform pg_temp.publication_assert((select bool_and(not (value->>'economics_match')::boolean) from jsonb_array_elements(projected->'proofs')),'new fingerprint never keeps rejection proof');
  perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);execute 'set local role authenticated';
  begin perform public.publish_operations_project_personnel_reviews_v1(stream,a,7,(reject_a->>'review_sequence')::bigint,'synthetic-foreign-project-pub');
    raise exception 'foreign org project publication allowed';exception when insufficient_privilege then null;end;
  execute 'reset role';
  begin update public.operations_personnel_project_publication_proofs set applied_status='rejected';raise exception 'proof updated';exception when sqlstate '55000' then null;end;
  begin truncate public.operations_personnel_project_publication_links,public.operations_personnel_project_publication_proofs;raise exception 'proof link truncated';exception when sqlstate '55000' then null;end;
end;$$;
rollback;
\echo 'Operations project review publication PostgreSQL checks passed'
