\set ON_ERROR_STOP on
-- After source-evidence+outbox+project-review migrations, transport seed and the
-- explicit auth/schema bootstrap. The fixture contains engine-computed two-project money.
begin;
create temporary table review_fixture(data jsonb not null);
insert into review_fixture values (:'fixture'::jsonb);
create function pg_temp.review_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'project review assertion failed: %',label; end if; end; $$;
insert into public.operations_personnel_target_bindings(organization_id,source_system,target_kind,external_id,target_version,source_project_id,source_booking_id,currency,source_reference)
values('11111111-1111-4111-8111-111111111111','planning','project','77777777-7777-4777-8777-777777777777','binding-v1',
 '77777777-7777-4777-8777-777777777777',null,'SEK','isolated-two-project-source');
do $$
declare f jsonb; evidence jsonb; snapshot jsonb; stream text; a uuid:='55555555-5555-4555-8555-555555555555'; b uuid:='77777777-7777-4777-8777-777777777777';
  admin uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; reviewer uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  result jsonb; grant_receipt jsonb; review_a jsonb; review_b jsonb; reopened jsonb;
begin
  select data into strict f from review_fixture;snapshot:=f->'snapshot';stream:=snapshot->>'source_time_stream_id';
  evidence:=jsonb_build_object('schema','operations-personnel-source-evidence-v1','personnel_id','99999999-9999-4999-8999-999999999999',
    'source_system','planning','external_personnel_id','44444444-4444-4444-8444-444444444444','project_review_sequence',0,
    'project_review_status','preliminary','raw_snapshot',(f->'raw')::text,'raw_snapshot_sha256',encode(sha256(convert_to((f->'raw')::text,'UTF8')),'hex'),
    'persisted_sync_state','synced','submission_state','submitted','submission_decision_sequence',0);
  result:=public.publish_operations_personnel_cost_outbox_v1(snapshot,f->'raw',evidence,0,'synthetic-two-project-source');
  perform pg_temp.review_assert(result->>'status'='accepted','actual engine source publication');
  perform pg_temp.review_assert(operations_economy_private.project_fingerprint_v1(snapshot,a)=f->>'projectAHash' and
    operations_economy_private.project_fingerprint_v1(snapshot,b)=f->>'projectBHash','SQL and JS fingerprint exact parity');
  -- Unauthenticated and caller-supplied users cannot become review actors.
  perform set_config('request.jwt.claims','{}',true);execute 'set local role authenticated';
  begin perform public.review_operations_project_personnel_v1(stream,a,1,0,'approved',null,'synthetic-no-auth');
    raise exception 'missing auth.uid accepted';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);execute 'set local role authenticated';
  begin perform public.get_operations_project_personnel_review_v1(stream,a);
    raise exception 'project role without grant read review';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  grant_receipt:=public.grant_operations_project_personnel_review_v1(a,reviewer,0,'granted','Project A responsibility','synthetic-project-a-grant');
  review_b:=public.review_operations_project_personnel_v1(stream,b,1,0,'approved',null,'synthetic-project-b-approval');
  execute 'reset role';
  perform pg_temp.review_assert(grant_receipt->>'status'='accepted','admin grants exact actual project');
  perform pg_temp.review_assert(review_b->>'status'='accepted','org admin reviews B');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);execute 'set local role authenticated';
  review_a:=public.review_operations_project_personnel_v1(stream,a,1,0,'approved',null,'synthetic-project-a-approval');
  result:=public.review_operations_project_personnel_v1(stream,a,1,0,'approved',null,'synthetic-project-a-approval');
  begin perform public.review_operations_project_personnel_v1(stream,b,1,0,'approved',null,'synthetic-cross-project');
    raise exception 'A reviewer approved B';exception when insufficient_privilege then null;end;
  begin perform public.grant_operations_project_personnel_review_v1(b,reviewer,0,'granted','Self assigned project','synthetic-self-grant');
    raise exception 'reviewer self-granted B';exception when insufficient_privilege then null;end;
  begin perform public.review_operations_project_personnel_v1(stream,a,1,0,'rejected','Changed exact key','synthetic-project-a-approval');
    raise exception 'changed retry accepted';exception when sqlstate '23505' then null;end;
  execute 'reset role';
  perform pg_temp.review_assert(review_a->>'status'='accepted' and result->>'status'='duplicate','authenticated actor and exact replay');
  perform pg_temp.review_assert((select actor_system_user_id=reviewer from public.operations_project_personnel_reviews where event_id=(review_a->>'event_id')::uuid),'actor captured auth.uid');
  perform pg_temp.review_assert((select count(*)=2 from public.operations_project_personnel_reviews),'exact duplicate did not append');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.review_operations_project_personnel_v1(stream,a,1,0,'reopened','Project A needs review','synthetic-stale-a-reopen');
  reopened:=public.review_operations_project_personnel_v1(stream,a,1,(review_a->>'review_sequence')::bigint,'reopened','Project A needs review','synthetic-project-a-reopen');
  execute 'reset role';
  perform pg_temp.review_assert(result->>'status'='stale_review' and reopened->>'status'='accepted','CAS rejects stale review head');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_operations_project_personnel_review_v1(stream,b);
  execute 'reset role';
  perform pg_temp.review_assert(result#>>'{review,decision}'='approved','reopen A leaves B approved');
  perform pg_temp.review_assert((select cost_snapshot=snapshot from public.operations_personnel_cost_publications where source_revision=1),'reviews never recalculate or mutate publication');
  -- Foreign admin and staff identity fail exact organization/role checks.
  perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);execute 'set local role authenticated';
  begin perform public.get_operations_project_personnel_review_v1(stream,a);raise exception 'foreign org read allowed';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);execute 'set local role authenticated';
  begin perform public.get_operations_project_personnel_review_v1(stream,a);raise exception 'staff without role allowed';exception when insufficient_privilege then null;end;
  execute 'reset role';
  -- Revocation is append-only and immediately enforced on the next command.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.grant_operations_project_personnel_review_v1(a,reviewer,(grant_receipt->>'grant_sequence')::bigint,'revoked','Responsibility removed','synthetic-project-a-revoke');
  execute 'reset role';
  perform pg_temp.review_assert(result->>'status'='accepted','admin revoke');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);execute 'set local role authenticated';
  begin perform public.get_operations_project_personnel_review_v1(stream,a);raise exception 'revoked grant read allowed';exception when insufficient_privilege then null;end;
  begin perform count(*) from public.operations_personnel_cost_publications;raise exception 'rate table leak';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform pg_temp.review_assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('review_operations_project_personnel_v1','grant_operations_project_personnel_review_v1','get_operations_project_personnel_review_v1')
    and exists(select 1 from unnest(p.proargnames) name where name in ('p_actor_id','p_actor_system_user_id','p_organization_id'))),'no caller actor/organization parameters');
  -- A new authoritative global correction event invalidates confirmation even
  -- when the immutable Time source and saved costs have not changed yet.
  result:=public.publish_operations_personnel_cost_outbox_v1(jsonb_set(snapshot,'{source_revision}','2'),f->'raw',
    evidence||jsonb_build_object('submission_state','correction_requested','submission_decision_sequence',8),1,'synthetic-global-correction-request');
  perform pg_temp.review_assert(result->>'status'='accepted','global correction event safely republishes saved economics');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_operations_project_personnel_review_v1(stream,b);
  begin perform public.review_operations_project_personnel_v1(stream,b,2,(review_b->>'review_sequence')::bigint,'approved',null,'synthetic-approve-correction');
    raise exception 'global correction allowed confirmation';exception when sqlstate '22023' then null;end;
  execute 'reset role';
  perform pg_temp.review_assert(result->>'status'='no_current_review','global correction hides obsolete confirmation proof');
  begin update public.operations_project_personnel_reviews set reason='Rewritten history';raise exception 'review updated';exception when sqlstate '55000' then null;end;
  begin delete from public.operations_project_personnel_review_grants;raise exception 'grant history deleted';exception when sqlstate '55000' then null;end;
  begin truncate public.operations_project_personnel_reviews cascade;raise exception 'review history truncated';exception when sqlstate '55000' then null;end;
  begin truncate public.operations_project_personnel_review_grants;raise exception 'grant history truncated';exception when sqlstate '55000' then null;end;
end; $$;
rollback;
\echo 'Operations project review PostgreSQL checks passed'
