\set ON_ERROR_STOP on
-- Isolated real service-role ingress, authenticated ledger commands, no live writes.
begin;
create temporary table canonical_ingress_fixture(data jsonb not null);
insert into canonical_ingress_fixture values(:'fixture'::jsonb);
create function pg_temp.ingress_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'canonical ingress assertion failed: %',label;end if;end;$$;
create function pg_temp.ingress_fail_proof() returns trigger language plpgsql as $$
begin raise exception 'synthetic canonical proof failure' using errcode='22023';end;$$;
insert into public.operations_personnel_target_bindings(organization_id,source_system,target_kind,external_id,target_version,source_project_id,source_booking_id,currency,source_reference)
values('11111111-1111-4111-8111-111111111111','planning','project','77777777-7777-4777-8777-777777777777','binding-v1',
 '77777777-7777-4777-8777-777777777777',null,'SEK','isolated-canonical-two-project-ingress');
do $$
declare f jsonb;snapshot jsonb;evidence jsonb;initial_evidence jsonb;initial_snapshot jsonb;current_snapshot jsonb;stream text;
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';a uuid:='55555555-5555-4555-8555-555555555555';b uuid:='77777777-7777-4777-8777-777777777777';
  result jsonb;first_receipt jsonb;review_a jsonb;review_b jsonb;reject_a jsonb;
begin
  select data into strict f from canonical_ingress_fixture;
  select jsonb_set(f->'snapshot','{lines}',jsonb_agg(jsonb_set(value,'{status}','"confirmed"') order by ord)) into initial_snapshot
    from jsonb_array_elements(f#>'{snapshot,lines}') with ordinality l(value,ord);
  stream:=initial_snapshot->>'source_time_stream_id';
  initial_evidence:=jsonb_build_object('schema','operations-personnel-source-evidence-v1','personnel_id','99999999-9999-4999-8999-999999999999',
    'source_system','planning','external_personnel_id','44444444-4444-4444-8444-444444444444','project_review_sequence',5,
    'project_review_status','confirmed','raw_snapshot',(f->'raw')::text,'raw_snapshot_sha256',encode(sha256(convert_to((f->'raw')::text,'UTF8')),'hex'),
    'persisted_sync_state','synced','submission_state','submitted','submission_decision_sequence',0);
  execute 'set local role service_role';
  begin perform public.publish_operations_personnel_cost_ingress_v1(jsonb_set(initial_snapshot,'{lines,0}',(initial_snapshot#>'{lines,0}')-'status'),f->'raw',initial_evidence,0,'synthetic-canonical-malformed-line');
    raise exception 'missing producer status repaired';exception when sqlstate '22023' then
    if sqlerrm<>'invalid_canonical_ingress_line' then raise;end if;end;
  result:=public.publish_operations_personnel_cost_ingress_v1(jsonb_set(initial_snapshot,'{source_revision}','5'),f->'raw',initial_evidence,4,'synthetic-canonical-first-stale');
  execute 'reset role';
  perform pg_temp.ingress_assert(result->>'status'='stale' and result->>'current_revision'='0' and
    (select count(*)=0 from public.operations_personnel_cost_streams),'stale first request cannot create a ghost stream');
  execute 'set local role service_role';
  first_receipt:=public.publish_operations_personnel_cost_ingress_v1(initial_snapshot,f->'raw',initial_evidence,0,'synthetic-canonical-first');
  execute 'reset role';
  perform pg_temp.ingress_assert(first_receipt->>'status'='accepted','actual service-role publication');
  select cost_snapshot into strict current_snapshot from public.operations_personnel_cost_current;
  perform pg_temp.ingress_assert((select bool_and(value->>'status'='preliminary' and value->>'amount_minor'='60000') from jsonb_array_elements(current_snapshot->'lines')),'day-wide approval has no project authority');
  perform pg_temp.ingress_assert((select count(*)=1 and bool_and(event_kind='time_ingress') from public.operations_personnel_project_publication_links),'first ingress has atomic proof link');
  perform pg_temp.ingress_assert((select count(*)=2 and bool_and(not economics_match and applied_status='preliminary') from public.operations_personnel_project_publication_proofs),'both unreviewed projects have explicit no-review proofs');
  perform pg_temp.ingress_assert((select bool_and(value->>'status'='preliminary') from public.operations_personnel_cost_publications,jsonb_array_elements(cost_snapshot->'lines')),'no transient globally confirmed publication');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  review_a:=public.review_operations_project_personnel_v1(stream,a,1,0,'approved',null,'synthetic-canonical-review-a');
  execute 'reset role';
  evidence:=initial_evidence||jsonb_build_object('project_review_sequence',6);snapshot:=jsonb_set(initial_snapshot,'{source_revision}','2');
  execute 'set local role service_role';
  result:=public.publish_operations_personnel_cost_ingress_v1(snapshot,f->'raw',evidence,1,'synthetic-canonical-event-two');
  execute 'reset role';select cost_snapshot into strict current_snapshot from public.operations_personnel_cost_current;
  perform pg_temp.ingress_assert(result->>'status'='accepted' and current_snapshot#>>'{lines,0,status}'='confirmed' and current_snapshot#>>'{lines,1,status}'='preliminary','canonical ingress uses A approval without confirming B');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  review_b:=public.review_operations_project_personnel_v1(stream,b,2,0,'approved',null,'synthetic-canonical-review-b');
  execute 'reset role';
  evidence:=evidence||jsonb_build_object('project_review_sequence',7);snapshot:=jsonb_set(initial_snapshot,'{source_revision}','3');
  execute 'set local role service_role';result:=public.publish_operations_personnel_cost_ingress_v1(snapshot,f->'raw',evidence,2,'synthetic-canonical-event-three');execute 'reset role';
  perform pg_temp.ingress_assert((select bool_and(value->>'status'='confirmed') from public.operations_personnel_cost_current,jsonb_array_elements(cost_snapshot->'lines')),'independent B review confirms B');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
  reject_a:=public.review_operations_project_personnel_v1(stream,a,3,(review_a->>'review_sequence')::bigint,'rejected','Allocation rejected independently','synthetic-canonical-reject-a');
  execute 'reset role';
  evidence:=evidence||jsonb_build_object('project_review_sequence',8,'submission_state','correction_requested','submission_decision_sequence',1,'project_review_status','preliminary');snapshot:=jsonb_set(initial_snapshot,'{source_revision}','4');
  execute 'set local role service_role';result:=public.publish_operations_personnel_cost_ingress_v1(snapshot,f->'raw',evidence,3,'synthetic-canonical-event-four');execute 'reset role';
  select cost_snapshot into strict current_snapshot from public.operations_personnel_cost_current;
  perform pg_temp.ingress_assert(current_snapshot#>>'{lines,0,status}'='rejected' and current_snapshot#>>'{lines,1,status}'='preliminary','source correction preserves current rejection and downgrades B');
  perform pg_temp.ingress_assert((select bool_and(value->>'amount_minor'='60000' and value->>'hourly_rate_minor'='30000') from jsonb_array_elements(current_snapshot->'lines')),'same-Time economics frozen');
  perform pg_temp.ingress_assert((select economics_match and applied_status='rejected' and review_event_id=(reject_a->>'event_id')::uuid
    from public.operations_personnel_project_publication_proofs where source_revision=4 and project_id=a),'canonical rejection proof tied to exact ledger event');
  execute 'set local role service_role';
  result:=public.publish_operations_personnel_cost_ingress_v1(initial_snapshot,f->'raw',initial_evidence,0,'synthetic-canonical-first');
  execute 'reset role';
  perform pg_temp.ingress_assert(result->>'status'='duplicate' and result->>'outbox_id'=first_receipt->>'outbox_id','historical retry preserves original projected body and receipt');
  execute 'set local role service_role';
  begin perform public.publish_operations_personnel_cost_ingress_v1(jsonb_set(initial_snapshot,'{lines,0,minutes}','121'),f->'raw',initial_evidence,0,'synthetic-canonical-first');
    raise exception 'changed canonical retry accepted';exception when sqlstate '23505' then null;end;
  result:=public.publish_operations_personnel_cost_ingress_v1(jsonb_set(snapshot,'{source_revision}','5'),f->'raw',evidence||jsonb_build_object('project_review_sequence',7),4,'synthetic-canonical-stale-review');
  execute 'reset role';perform pg_temp.ingress_assert(result->>'status'='stale_source_review','source review regression returns stale without append');
  perform pg_temp.ingress_assert((select current_revision=4 from public.operations_personnel_cost_streams),'stale/retry attempts leave head unchanged');
  -- A real new Time version changes the fingerprint and invalidates rejection.
  snapshot:=f->'corrected';evidence:=initial_evidence||jsonb_build_object('project_review_sequence',0,'project_review_status','preliminary','raw_snapshot',(f->'rawCorrection')::text,
    'raw_snapshot_sha256',encode(sha256(convert_to((f->'rawCorrection')::text,'UTF8')),'hex'));
  execute 'create trigger synthetic_canonical_proof_failure before insert on public.operations_personnel_project_publication_proofs for each row execute function pg_temp.ingress_fail_proof()';
  execute 'set local role service_role';
  begin perform public.publish_operations_personnel_cost_ingress_v1(snapshot,f->'rawCorrection',evidence,4,'synthetic-canonical-proof-failure');
    raise exception 'failed canonical proof accepted';exception when sqlstate '22023' then
    if sqlerrm<>'synthetic canonical proof failure' then raise;end if;end;
  execute 'reset role';execute 'drop trigger synthetic_canonical_proof_failure on public.operations_personnel_project_publication_proofs';
  perform pg_temp.ingress_assert((select current_revision=4 from public.operations_personnel_cost_streams) and
    (select count(*)=4 from public.operations_personnel_cost_publications) and (select count(*)=4 from public.operations_personnel_cost_outbox) and
    (select count(*)=4 from public.operations_personnel_project_publication_links),'failed proof insertion rolls back publication, head, outbox, proof link');
  execute 'set local role service_role';result:=public.publish_operations_personnel_cost_ingress_v1(snapshot,f->'rawCorrection',evidence,4,'synthetic-canonical-new-time');execute 'reset role';
  select cost_snapshot into strict current_snapshot from public.operations_personnel_cost_current;
  perform pg_temp.ingress_assert(result->>'status'='accepted' and current_snapshot#>>'{lines,0,amount_minor}'='45000' and current_snapshot#>>'{lines,1,amount_minor}'='60000','new Time economics calculated by actual Operations engine');
  perform pg_temp.ingress_assert((select bool_and(value->>'status'='preliminary') from jsonb_array_elements(current_snapshot->'lines')),'genuine new snapshot invalidates both old review decisions');
  perform pg_temp.ingress_assert((select bool_and(not economics_match and review_event_id is null) from public.operations_personnel_project_publication_proofs where source_revision=5),'new Time never copies invalid prior review proof');
  evidence:=initial_evidence||jsonb_build_object('project_review_sequence',0,'project_review_status','preliminary','raw_snapshot',(f->'rawEmpty')::text,
    'raw_snapshot_sha256',encode(sha256(convert_to((f->'rawEmpty')::text,'UTF8')),'hex'));
  execute 'set local role service_role';result:=public.publish_operations_personnel_cost_ingress_v1(f->'empty',f->'rawEmpty',evidence,5,'synthetic-canonical-empty-time');execute 'reset role';
  perform pg_temp.ingress_assert(result->>'status'='accepted' and (select cost_snapshot->'lines'='[]'::jsonb from public.operations_personnel_cost_current),'empty authoritative correction reverses whole stream');
  perform pg_temp.ingress_assert((select count(*)=6 from public.operations_personnel_cost_publications) and
    (select count(*)=6 from public.operations_personnel_cost_outbox) and (select count(*)=6 from public.operations_personnel_project_publication_links),'one durable publication/outbox/link per successful transaction');
  execute 'set local role authenticated';
  begin perform public.publish_operations_personnel_cost_ingress_v1(initial_snapshot,f->'raw',initial_evidence,0,'synthetic-forged-canonical-client');
    raise exception 'client can publish arbitrary canonical cost';exception when insufficient_privilege then null;end;
  execute 'reset role';
end;$$;
rollback;
\echo 'Operations canonical personnel ingress PostgreSQL checks passed'
