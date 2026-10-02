\set ON_ERROR_STOP on
-- All direct-fixture economic, policy and test-ledger changes roll back.
begin;
do $$begin
 if current_database() !~ '^eventflow_scope_publication_[a-z0-9_]+$'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regprocedure('pg_temp.publish_scope_native(jsonb)') is null
 or (select count(*) from operations_scope_publication_native.gates)<>1
 or exists(select 1 from operations_scope_publication_native.gates where enabled or fault_after_publication or pause_after_barriers)
 or exists(select 1 from operations_scope_publication_native.publications)
 or exists(select 1 from operations_scope_publication_native.heads)
 then raise exception 'fresh_disposable_native_publication_direct_fixture_required' using errcode='22023';end if;
end;$$;
create temporary table native_publication_command(data jsonb not null);
insert into native_publication_command
 select (read_request-'organization_id')||jsonb_build_object('schema_version','operations-scope-publication-native.v1','expected_publication_revision',0,'idempotency_key','native-publication-direct-first','reason','Trusted actual Operations source capture and kernel transaction')
 from public.operations_scope_invoice_kernel_native_fixture;
grant select on native_publication_command to authenticated;
create function pg_temp.publication_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'native_publication_assertion_failed:%',label;end if;
end;$$;
create function pg_temp.publication_denied(command jsonb,code text,message text) returns void language plpgsql as $$begin
 begin perform pg_temp.publish_scope_native(command);raise exception 'unexpected_native_publication_success';
 exception when others then if sqlstate is distinct from code or sqlerrm is distinct from message then raise;end if;end;
end;$$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare cmd jsonb;receipt jsonb;replay jsonb;old_stamp timestamptz;next_cmd jsonb;key text;begin
 select data into strict cmd from native_publication_command;
 execute 'set local role authenticated';perform pg_temp.publication_denied(cmd,'42501','native_publication_gate_disabled');execute 'reset role';
 perform pg_temp.publication_assert(not exists(select 1 from operations_scope_publication_native.heads),'default gate creates no head');
 update operations_scope_publication_native.gates set enabled=true;
 execute 'set local role authenticated';
 perform pg_temp.publication_denied(cmd||jsonb_build_object('actor_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'22023','exact_native_publication_command_required');
 perform pg_temp.publication_denied(cmd||jsonb_build_object('organization_id','11111111-1111-4111-8111-111111111111'),'22023','exact_native_publication_command_required');
 perform pg_temp.publication_denied(jsonb_set(cmd,'{economic_scope_id}','["90909090-9090-4909-8909-909090909090"]'),'22023','invalid_native_publication_identity');
 foreach key in array array['expected_scope_revision','expected_composition_revision','expected_publication_revision'] loop
 perform pg_temp.publication_denied(jsonb_set(cmd,array[key],to_jsonb(cmd->>key)),'22023','invalid_native_publication_revision');
 perform pg_temp.publication_denied(jsonb_set(cmd,array[key],'0.5'),'22023','invalid_native_publication_revision');end loop;
 perform pg_temp.publication_denied(jsonb_set(cmd,'{expected_publication_revision}','9007199254740991'),'22023','invalid_native_publication_revision');
 perform pg_temp.publication_denied(jsonb_set(cmd,'{reason}','" surrounding spaces "'),'22023','invalid_native_publication_audit');
 perform pg_temp.publication_denied(jsonb_set(cmd,'{reason}',to_jsonb(E'\nInvalid line'::text)),'22023','invalid_native_publication_audit');
 perform pg_temp.publication_denied(jsonb_set(cmd,'{expected_publication_revision}','1'),'PT409','native_publication_revision_changed');
 execute 'reset role';
 perform pg_temp.publication_assert(not exists(select 1 from operations_scope_publication_native.heads) and not exists(select 1 from operations_scope_publication_native.publications),'initial stale creates no ghost');
 perform pg_temp.publication_assert((select count(*)=1 and bool_and(system_user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and project_id='55555555-5555-4555-8555-555555555555' and decision='granted') from public.operations_project_personnel_review_grants),'actual leaf grant cannot authorize full publication');
 select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true) into key;
 execute 'set local role authenticated';perform pg_temp.publication_denied(cmd,'42501','organization_scope_admin_required');execute 'reset role';
 select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true) into key;
 execute 'set local role authenticated';perform pg_temp.publication_denied(cmd,'42501','native_publication_gate_disabled');execute 'reset role';
 select set_config('request.jwt.claims','{}',true) into key;
 execute 'set local role authenticated';perform pg_temp.publication_denied(cmd,'42501','authenticated_scope_admin_required');execute 'reset role';
 select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true) into key;
 update operations_scope_publication_native.gates set fault_after_publication=true;
 execute 'set local role authenticated';perform pg_temp.publication_denied(cmd,'22023','native_publication_injected_after_insert');execute 'reset role';
 perform pg_temp.publication_assert(not exists(select 1 from operations_scope_publication_native.publications) and not exists(select 1 from operations_scope_publication_native.heads) and not exists(select 1 from operations_scope_publication_native.receipts) and not exists(select 1 from operations_scope_publication_native.blocked_controls),'all four roll back after first insert');
 update operations_scope_publication_native.gates set fault_after_publication=false;
 execute 'set local role authenticated';receipt:=pg_temp.publish_scope_native(cmd);replay:=pg_temp.publish_scope_native(cmd);
 perform pg_temp.publication_denied(cmd||jsonb_build_object('reason','Changed under the same key'),'23505','native_publication_idempotency_conflict');
 perform pg_temp.publication_denied(cmd||jsonb_build_object('idempotency_key','native-publication-stale-distinct'),'PT409','native_publication_revision_changed');execute 'reset role';
 perform pg_temp.publication_assert(receipt->>'outcome'='accepted' and receipt->>'publication_revision'='1' and receipt->'historical_only'='false' and replay=receipt||jsonb_build_object('outcome','replayed','historical_only',true),'exact historical receipt');
 select observed_at into strict old_stamp from operations_scope_publication_native.publications;
 perform pg_temp.publication_assert((select count(*)=1 from operations_scope_publication_native.publications) and (select count(*)=1 from operations_scope_publication_native.blocked_controls),'one publication one blocked control');
 -- Actual policy change occurs through its unchanged authenticated authority.
 execute 'set local role authenticated';perform public.append_operations_obligation_source_policy_v1(policy_command) from public.operations_scope_invoice_kernel_native_fixture;
 replay:=pg_temp.publish_scope_native(cmd);execute 'reset role';
 perform pg_temp.publication_assert(replay=receipt||jsonb_build_object('outcome','replayed','historical_only',true) and (select observed_at=old_stamp from operations_scope_publication_native.publications),'retry after source policy correction remains saved historical');
 next_cmd:=cmd||jsonb_build_object('expected_publication_revision',1,'idempotency_key','native-publication-direct-second');
 execute 'set local role authenticated';replay:=pg_temp.publish_scope_native(next_cmd);execute 'reset role';
 perform pg_temp.publication_assert(replay->>'publication_revision'='2' and replay->>'outcome'='accepted' and (select count(*)=2 from operations_scope_publication_native.publications) and (select count(*)=2 from operations_scope_publication_native.receipts) and (select count(*)=2 from operations_scope_publication_native.blocked_controls) and (select publication_revision=2 from operations_scope_publication_native.heads),'real second immutable revision and atomic records');
 perform pg_temp.publication_assert(not exists(select 1 from operations_scope_publication_native.blocked_controls where destination_id is not null or wire_payload is not null or state<>'blocked_missing_authoritative_destination'),'no fake Finance destination');
 perform pg_temp.publication_assert(not exists(select 1 from operations_scope_publication_native.publications where projection->'eac_minor'<>'null' or projection->'budget_minor'<>'null' or projection->'credit_eligible'<>'false' or projection->>'source_coverage'<>'unavailable'),'unknowns never promoted');
 -- A source protocol correction does not turn a historical retry current.
 execute 'set local role service_role';perform public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'native_publication_direct_source',raw_source_correction) from public.operations_scope_invoice_kernel_native_fixture;execute 'reset role';
 execute 'set local role authenticated';replay:=pg_temp.publish_scope_native(cmd);execute 'reset role';
 perform pg_temp.publication_assert(replay->>'publication_revision'='1' and replay->'historical_only'='true' and (select publication_revision=2 from operations_scope_publication_native.heads),'old retry neither current nor head rewrite');
 begin update operations_scope_publication_native.publications set projection='{}';raise exception 'mutation accepted';exception when sqlstate '55000' then if sqlerrm<>'operations_personnel_evidence_is_append_only' then raise;end if;end;
 begin delete from operations_scope_publication_native.receipts;raise exception 'receipt delete accepted';exception when sqlstate '55000' then if sqlerrm<>'operations_personnel_evidence_is_append_only' then raise;end if;end;
 begin truncate operations_scope_publication_native.blocked_controls;raise exception 'control truncate accepted';exception when sqlstate '55000' then if sqlerrm<>'operations_personnel_evidence_is_append_only' then raise;end if;end;
 begin update operations_scope_publication_native.heads set publication_revision=1;raise exception 'head rewind accepted';exception when sqlstate '55000' then if sqlerrm<>'native_publication_head_immutable' then raise;end if;end;
 execute 'set local role service_role';begin perform 1 from operations_scope_publication_native.heads;raise exception 'service direct access accepted';exception when insufficient_privilege then null;end;execute 'reset role';
end;$$;
select jsonb_agg(jsonb_build_object('label','direct_'||publication_revision,'capture',capture::text,'projection',projection::text,'document',document::text,'evidence_fingerprint',evidence_fingerprint,'publication_fingerprint',publication_fingerprint) order by publication_revision)::text as native_publication_vectors
 from operations_scope_publication_native.publications;
rollback;
\echo 'whole-scope-publication-transaction-direct PASS actual_sources_atomic_saved_kernel_historical_replay_blocked_delivery'
