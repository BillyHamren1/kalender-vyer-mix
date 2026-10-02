\set ON_ERROR_STOP on
-- Native isolated administrator enrollment; no real salary/factura/attest actions.
begin;
create temporary table historical_rate_fixture(data jsonb not null);
insert into historical_rate_fixture values(:'fixture'::jsonb);
create function pg_temp.rate_admin_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'historical rate assertion failed: %',label;end if;end;$$;
create function pg_temp.rate_admin_fail_event() returns trigger language plpgsql as $$
begin raise exception 'synthetic rate event failure' using errcode='22023';end;$$;
do $$
declare worker uuid:='44444444-4444-4444-8444-444444444444';admin uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  command jsonb;result jsonb;first_receipt jsonb;zero_receipt jsonb;history jsonb;f jsonb;saved jsonb;
begin
  select data into strict f from historical_rate_fixture;
  result:=public.publish_operations_personnel_cost_v1(f->'snapshot',f->'raw',0,'synthetic-rate-admin-frozen-cost');
  select cost_snapshot into strict saved from public.operations_personnel_cost_current;
  command:=jsonb_build_object('schema','operations-personnel-rate-admin.v1','worker_id',worker,'rate_revision','admin-work-sek-v2',
    'category','work','currency','SEK','hourly_rate_minor',31000,'effective_from','2026-10-02','effective_to','2026-11-01',
    'reason','Verified signed employment schedule','source_reference','synthetic-contract-schedule-v2','idempotency_key','synthetic-rate-admin-next','expected_history_sequence',0);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('hourly_rate_minor','31000'));
    raise exception 'string rate accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_historical_rate_command' then raise;end if;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('hourly_rate_minor',31000.5));
    raise exception 'fractional rate accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_historical_rate_command' then raise;end if;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('hourly_rate_minor',null));
    raise exception 'missing rate defaulted';exception when sqlstate '22023' then if sqlerrm<>'invalid_historical_rate_command' then raise;end if;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('hourly_rate_minor',-1));
    raise exception 'negative rate accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_historical_rate_command' then raise;end if;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('actor_system_user_id',admin));
    raise exception 'caller supplied actor accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_historical_rate_command' then raise;end if;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('effective_from','today'));
    raise exception 'date keyword accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_historical_rate_command' then raise;end if;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('effective_from','2026-02-30'));
    raise exception 'impossible date accepted';exception when sqlstate '22008' then null;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('effective_to','2026-10-02'));
    raise exception 'empty date interval accepted';exception when sqlstate '22023' then if sqlerrm<>'invalid_historical_rate_interval' then raise;end if;end;
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('effective_from','2026-10-01'));
    raise exception 'existing date overlap accepted';exception when sqlstate '23505' then if sqlerrm<>'historical_rate_interval_overlap' then raise;end if;end;
  execute 'reset role';
  -- Failure after rate insertion rolls back the rate itself and its event.
  execute 'create trigger synthetic_rate_admin_event_failure before insert on public.operations_personnel_rate_admin_events for each row execute function pg_temp.rate_admin_fail_event()';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  begin perform public.enroll_operations_personnel_rate_v1(command);
    raise exception 'failed rate event accepted';exception when sqlstate '22023' then if sqlerrm<>'synthetic rate event failure' then raise;end if;end;
  execute 'reset role';execute 'drop trigger synthetic_rate_admin_event_failure on public.operations_personnel_rate_admin_events';
  perform pg_temp.rate_admin_assert((select count(*)=1 from public.operations_personnel_rate_history) and
    (select count(*)=0 from public.operations_personnel_rate_admin_events),'failed event rolls back rate and history event');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  first_receipt:=public.enroll_operations_personnel_rate_v1(command);
  result:=public.enroll_operations_personnel_rate_v1(command);
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('reason','Changed source reason'));
    raise exception 'changed idempotency accepted';exception when sqlstate '23505' then if sqlerrm<>'historical_rate_idempotency_conflict' then raise;end if;end;
  execute 'reset role';
  perform pg_temp.rate_admin_assert(first_receipt->>'status'='accepted' and result->>'status'='duplicate' and first_receipt->>'event_id'=result->>'event_id','exact retries preserve original event');
  perform pg_temp.rate_admin_assert((select e.actor_system_user_id=admin and e.reason=e.command->>'reason' and e.command->>'source_reference'=e.source_reference
    from public.operations_personnel_rate_admin_events e where e.event_id=(first_receipt->>'event_id')::uuid),'actor and provenance captured immutably');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('rate_revision','admin-work-sek-zero','hourly_rate_minor',0,
    'effective_from','2026-11-01','effective_to',null,'reason','Explicit unpaid category agreement','idempotency_key','synthetic-rate-explicit-zero'));
  execute 'reset role';perform pg_temp.rate_admin_assert(result->>'status'='stale','CAS denies stale history command without inserting');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  zero_receipt:=public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('rate_revision','admin-work-sek-zero','hourly_rate_minor',0,
    'effective_from','2026-11-01','effective_to',null,'reason','Explicit unpaid category agreement','idempotency_key','synthetic-rate-explicit-zero',
    'expected_history_sequence',(first_receipt->>'history_sequence')::bigint));
  begin perform public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('rate_revision','admin-open-end-overlap',
    'effective_from','2026-12-01','effective_to',null,'idempotency_key','synthetic-open-end-overlap','expected_history_sequence',(zero_receipt->>'history_sequence')::bigint));
    raise exception 'open-ended rate silently superseded';exception when sqlstate '23505' then if sqlerrm<>'historical_rate_interval_overlap' then raise;end if;end;
  result:=public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('rate_revision','admin-travel-sek','category','travel',
    'effective_from','2026-10-01','effective_to',null,'idempotency_key','synthetic-category-independent'));
  perform pg_temp.rate_admin_assert(result->>'status'='accepted','travel category independent from work interval');
  result:=public.enroll_operations_personnel_rate_v1(command||jsonb_build_object('rate_revision','admin-work-eur','currency','EUR',
    'effective_from','2026-10-01','effective_to',null,'idempotency_key','synthetic-currency-independent'));
  history:=public.get_operations_personnel_rate_history_v1(worker);
  execute 'reset role';
  perform pg_temp.rate_admin_assert(zero_receipt->>'status'='accepted' and (select hourly_rate_minor=0 from public.operations_personnel_rate_history where rate_revision='admin-work-sek-zero'),'explicit zero retained with provenance');
  perform pg_temp.rate_admin_assert(result->>'status'='accepted','currency has an independent rate interval');
  perform pg_temp.rate_admin_assert(history->>'schema'='operations-personnel-rate-history.v1' and jsonb_array_length(history->'rates')=5,'admin sees scoped history with source provenance');
  perform pg_temp.rate_admin_assert((select bool_and(value->'admin_event_id'='null'::jsonb and value->'reason'='null'::jsonb)
    from jsonb_array_elements(history->'rates') where value->>'rate_revision'='rate-v1'),'preexisting rates have no invented admin provenance');
  perform pg_temp.rate_admin_assert((select cost_snapshot=saved from public.operations_personnel_cost_current) and
    (select count(*)=1 from public.operations_personnel_cost_publications),'enrollment never changes existing v1 economics or publishes costs');
  perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);execute 'set local role authenticated';
  begin perform public.enroll_operations_personnel_rate_v1(command);raise exception 'project user can administer worker rate';exception when insufficient_privilege then null;end;
  begin perform public.get_operations_personnel_rate_history_v1(worker);raise exception 'project user can read raw rate history';exception when insufficient_privilege then null;end;
  begin perform (select hourly_rate_minor from public.operations_personnel_rate_history limit 1);raise exception 'raw history table readable';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);execute 'set local role authenticated';
  begin perform public.enroll_operations_personnel_rate_v1(command);raise exception 'foreign administrator can administer rate';exception when insufficient_privilege then null;end;
  begin perform public.get_operations_personnel_rate_history_v1(worker);raise exception 'foreign administrator can read rate';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);execute 'set local role authenticated';
  begin perform public.get_operations_personnel_rate_history_v1(worker);raise exception 'staff without system role can read rates';exception when insufficient_privilege then null;end;
  execute 'reset role';
  -- Guard applies even when a trusted service bypasses the enrollment RPC.
  execute 'set local role service_role';
  begin insert into public.operations_personnel_rate_history(organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
    values('11111111-1111-4111-8111-111111111111',worker,'service-overlap','work','SEK',31000,'2026-10-02','2026-10-10','synthetic-service-overlap');
    raise exception 'service insert bypasses interval guard';exception when sqlstate '23505' then if sqlerrm<>'historical_rate_interval_overlap' then raise;end if;end;
  execute 'reset role';
  delete from public.user_roles where user_id=admin and role='admin';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);execute 'set local role authenticated';
  begin perform public.get_operations_personnel_rate_history_v1(worker);raise exception 'revoked admin role still reads rates';exception when insufficient_privilege then null;end;
  begin perform public.enroll_operations_personnel_rate_v1(command);raise exception 'revoked admin role replays rate';exception when insufficient_privilege then null;end;
  execute 'reset role';
  begin update public.operations_personnel_rate_admin_events set reason='changed';raise exception 'rate event mutated';exception when sqlstate '55000' then null;end;
  begin truncate public.operations_personnel_rate_admin_events;raise exception 'rate event truncated';exception when sqlstate '55000' then null;end;
end;$$;
rollback;
\echo 'Operations historical rate administration PostgreSQL checks passed'
