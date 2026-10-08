\set ON_ERROR_STOP on
-- Run after operations-transport-seed.sql on an isolated EMPTY fixture database.
begin;
create temporary table outbox_fixture(data jsonb not null);
insert into outbox_fixture values (:'fixture'::jsonb);
create function pg_temp.outbox_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'outbox assertion failed: %',label; end if; end; $$;
create function pg_temp.reject_outbox_insert() returns trigger language plpgsql as $$
begin raise exception 'synthetic outbox insertion failure' using errcode='22023'; end; $$;
do $$
declare f jsonb; evidence jsonb; confirmed_evidence jsonb; result jsonb;
  first public.operations_personnel_cost_outbox%rowtype; claimed public.operations_personnel_cost_outbox%rowtype;
  second public.operations_personnel_cost_outbox%rowtype; bad_receipt jsonb; ack jsonb; body jsonb;
begin
  select data into strict f from outbox_fixture;
  evidence:=jsonb_build_object('schema','operations-personnel-source-evidence-v1',
    'personnel_id','99999999-9999-4999-8999-999999999999','source_system','planning',
    'external_personnel_id','44444444-4444-4444-8444-444444444444','project_review_sequence',0,
    'project_review_status','preliminary','raw_snapshot',(f->'raw')::text,
    'raw_snapshot_sha256',encode(sha256(convert_to((f->'raw')::text,'UTF8')),'hex'),
    'persisted_sync_state','synced','submission_state','submitted','submission_decision_sequence',0);
  execute 'set local role service_role';
  result:=public.publish_operations_personnel_cost_outbox_v1(f->'initial',f->'raw',evidence,0,'synthetic-outbox-initial');
  execute 'reset role';
  perform pg_temp.outbox_assert(result->>'status'='accepted','real service role atomic publish');
  select * into strict first from public.operations_personnel_cost_outbox;
  perform pg_temp.outbox_assert(first.raw_body::jsonb=f->'initial' and first.body_sha256=encode(sha256(convert_to(first.raw_body,'UTF8')),'hex'),'exact rawbody+hash');
  perform pg_temp.outbox_assert((select count(*)=1 from public.operations_personnel_cost_publications),'single publication');
  result:=public.finish_operations_personnel_cost_outbox_v1(first.id,null,null,'delivered',null,null);
  perform pg_temp.outbox_assert(result->>'status'='lease_lost','NULL/unclaimed lease cannot acknowledge');
  update public.operations_personnel_transport_routes set enabled=false;
  perform pg_temp.outbox_assert((select count(*)=0 from public.claim_operations_personnel_cost_outbox_v1('worker-disabled',1,30)),'disabled enrollment never claims');
  update public.operations_personnel_transport_routes set enabled=true;
  execute 'set local role service_role';
  select * into strict claimed from public.claim_operations_personnel_cost_outbox_v1('worker-a',1,30);
  execute 'reset role';
  perform pg_temp.outbox_assert((select count(*)=0 from public.claim_operations_personnel_cost_outbox_v1('worker-b',1,30)),'second worker cannot claim active lease');
  result:=public.finish_operations_personnel_cost_outbox_v1(first.id,'worker-b',claimed.lease_token,'retry',null,'wrong-owner');
  perform pg_temp.outbox_assert(result->>'status'='lease_lost','wrong owner cannot release lease');
  ack:=jsonb_build_object('schema','operations-personnel-cost-receipt-v1','outcome','accepted',
    'source_organization_id',first.organization_id,'source_time_stream_id',first.source_time_stream_id,
    'requested_source_revision',1,'applied_source_revision',1,'current_source_revision',1,
    'request_body_sha256',first.body_sha256,'snapshot_receipt_id',gen_random_uuid(),
    'snapshot_fingerprint',repeat('a',64),'receipt_id',gen_random_uuid(),
    'destination_organization_id',first.destination_organization_id,'shadow_only',true);
  for bad_receipt in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(ack,'{outcome}','null'),(ack-'outcome')||'{"extra":true}',jsonb_set(ack,'{request_body_sha256}',to_jsonb(repeat('0',64))),
    jsonb_set(ack,'{destination_organization_id}','"88888888-8888-4888-8888-888888888888"'))) loop
    begin perform public.finish_operations_personnel_cost_outbox_v1(first.id,'worker-a',claimed.lease_token,'delivered',bad_receipt,null);
      raise exception 'invalid acknowledgment accepted'; exception when sqlstate '22023' then null; end;
  end loop;
  -- Simulates restart after lease timeout without sleeping or changing evidence.
  update public.operations_personnel_cost_outbox set lease_until=clock_timestamp()-interval '1 second' where id=first.id;
  select * into strict second from public.claim_operations_personnel_cost_outbox_v1('worker-restarted',1,30);
  perform pg_temp.outbox_assert(second.lease_token<>claimed.lease_token and second.attempts=2,'restart obtains new lease token');
  result:=public.finish_operations_personnel_cost_outbox_v1(first.id,'worker-a',claimed.lease_token,'delivered',ack,null);
  perform pg_temp.outbox_assert(result->>'status'='lease_lost','expired worker cannot acknowledge after takeover');
  execute 'set local role service_role';
  result:=public.finish_operations_personnel_cost_outbox_v1(first.id,'worker-restarted',second.lease_token,'retry',null,'unknown-commit');
  execute 'reset role';
  perform pg_temp.outbox_assert(result->>'status'='retry','unknown commit retryable');
  update public.operations_personnel_cost_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=first.id;
  select * into strict second from public.claim_operations_personnel_cost_outbox_v1('worker-retry',1,30);
  perform pg_temp.outbox_assert(second.raw_body=first.raw_body and second.source_revision=first.source_revision,'retry immutable bytes/revision');
  execute 'set local role service_role';
  result:=public.finish_operations_personnel_cost_outbox_v1(first.id,'worker-retry',second.lease_token,'delivered',ack,null);
  execute 'reset role';
  perform pg_temp.outbox_assert(result->>'status'='delivered','strict bound committed acknowledgment');
  confirmed_evidence:=evidence||jsonb_build_object('project_review_sequence',7,'project_review_status','confirmed');
  result:=public.publish_operations_personnel_cost_outbox_v1(f->'confirmed',f->'raw',confirmed_evidence,1,'synthetic-outbox-confirmed');
  perform pg_temp.outbox_assert(result->>'status'='accepted','review atomic enqueue');
  result:=public.publish_operations_personnel_cost_outbox_v1(f->'initial',f->'raw',evidence,0,'synthetic-outbox-initial');
  perform pg_temp.outbox_assert(result->>'status'='duplicate' and result->>'outbox_id'=first.id::text,'historical retry same original outbox');
  -- New caller economics cannot forge a Time review or silently replace frozen rates.
  body:=jsonb_set(f->'initial','{source_revision}','3');
  result:=public.publish_operations_personnel_cost_outbox_v1(body,f->'raw',evidence,2,'synthetic-stale-review');
  perform pg_temp.outbox_assert(result->>'status'='stale_source_review','old source review cannot overwrite confirmed');
  begin perform public.publish_operations_personnel_cost_outbox_v1(jsonb_set(f->'corrected','{lines,0,amount_minor}','99999'),f->'rawCorrection',
    evidence||jsonb_build_object('raw_snapshot',(f->'rawCorrection')::text,'raw_snapshot_sha256',encode(sha256(convert_to((f->'rawCorrection')::text,'UTF8')),'hex')),2,'synthetic-outbox-invalid');
    raise exception 'forged cost was accepted'; exception when sqlstate '22023' then null; end;
  perform pg_temp.outbox_assert((select count(*)=2 from public.operations_personnel_cost_publications) and
    (select count(*)=2 from public.operations_personnel_cost_outbox),'rejected calculation leaves no partial publication/outbox');
  execute 'create trigger synthetic_outbox_failure before insert on public.operations_personnel_cost_outbox for each row execute function pg_temp.reject_outbox_insert()';
  begin perform public.publish_operations_personnel_cost_outbox_v1(f->'corrected',f->'rawCorrection',
    evidence||jsonb_build_object('raw_snapshot',(f->'rawCorrection')::text,'raw_snapshot_sha256',encode(sha256(convert_to((f->'rawCorrection')::text,'UTF8')),'hex')),2,'synthetic-outbox-failure');
    raise exception 'failed outbox insertion accepted'; exception when sqlstate '22023' then null; end;
  execute 'drop trigger synthetic_outbox_failure on public.operations_personnel_cost_outbox';
  perform pg_temp.outbox_assert((select count(*)=2 from public.operations_personnel_cost_publications) and
    (select count(*)=2 from public.operations_personnel_cost_outbox) and
    (select current_revision=2 from public.operations_personnel_cost_streams),'outbox insertion failure rolls back publication and head');
  begin update public.operations_personnel_cost_outbox set raw_body='{}';
    raise exception 'immutable body updated'; exception when sqlstate '22023' then null; end;
  begin truncate public.operations_personnel_cost_outbox;
    raise exception 'immutable outbox truncated'; exception when sqlstate '22023' then null; end;
  execute 'set local role authenticated';
  begin perform public.claim_operations_personnel_cost_outbox_v1('unauthorized',1,30);
    raise exception 'authenticated claims allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end; $$;
rollback;
\echo 'Operations durable outbox PostgreSQL checks passed'
