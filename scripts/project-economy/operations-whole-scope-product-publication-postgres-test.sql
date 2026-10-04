-- PRIVATE isolated fixture. Reader prerequisite setup is genuine frozen native
-- setup; calculator prototype is independently frozen TEST parity source.
-- Never send the final private saved documents to public workflow stdout.
begin;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime'
 or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regclass('operations_scope_reader_permission_native.fixture') is null
 or to_regclass('public.operations_scope_invoice_kernel_native_fixture') is null
 or to_regprocedure('pg_temp.prototype_scope(jsonb)') is null
 or (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4
 or exists(select 1 from operations_whole_scope_publication_private.publications)
 or exists(select 1 from operations_whole_scope_publication_private.heads)
 or exists(select 1 from operations_whole_scope_publication_private.receipts)
 or exists(select 1 from operations_whole_scope_publication_private.gates)
 then raise exception 'fresh_isolated_product_publication_fixture_required' using errcode='22023';end if;
end;$$;
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1('{}');raise exception 'read_committed_product_writer_accepted' using errcode='22023';
 exception when sqlstate '55000' then if sqlerrm<>'coherent_product_publication_transaction_required' then raise;end if;end;
end;$$;
reset role;
rollback;

begin isolation level repeatable read;
create function pg_temp.product_assert(v boolean) returns void language plpgsql as $$begin
 if v is distinct from true then raise exception 'isolated_product_publication_assertion_failed' using errcode='22023';end if;
end;$$;
create temporary table product_commands(label text primary key,command jsonb);
insert into product_commands select 'unknown',read_request-'schema_version'-'organization_id'||jsonb_build_object('schema_version','operations-whole-scope-product-publication-command.v1','expected_publication_revision',0,'idempotency_key','product-isolated-unknown-first','reason','Synthetic current actual unknown capture') from operations_scope_reader_permission_native.fixture;
insert into product_commands select 'known',read_request-'schema_version'-'organization_id'||jsonb_build_object('schema_version','operations-whole-scope-product-publication-command.v1','expected_publication_revision',0,'idempotency_key','product-isolated-known-first','reason','Synthetic current actual positive invoices') from public.operations_scope_invoice_kernel_native_fixture;
grant select on product_commands to authenticated,service_role;
create temporary table product_results(label text primary key,receipt jsonb);
grant select,insert on product_results to authenticated;
select pg_temp.product_assert((select count(*)=2 from product_commands) and
 (select proconfig @> array['default_transaction_isolation=repeatable read'] from pg_proc where oid='public.publish_operations_whole_scope_product_v1(jsonb)'::regprocedure));
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'default_off_product_gate_accepted' using errcode='22023';
 exception when insufficient_privilege then if sqlerrm<>'product_publication_gate_disabled' then raise;end if;end;
end;$$;
reset role;
set local role service_role;
insert into operations_whole_scope_publication_private.gates select '11111111-1111-4111-8111-111111111111',(command->>'economic_scope_id')::uuid,false from product_commands;
update operations_whole_scope_publication_private.gates set enabled=true;
do $$begin
 begin update operations_whole_scope_publication_private.gates set organization_id='88888888-8888-4888-8888-888888888888';raise exception 'service_gate_identity_rewrite_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'service_product_publisher_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin perform operations_whole_scope_publication_private.calculate_scope_v1('{}');raise exception 'service_calculator_json_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin insert into operations_whole_scope_publication_private.receipts values(gen_random_uuid(),'{}');raise exception 'service_receipt_write_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
end;$$;
reset role;
-- Actual missing/leaf/foreign sessions cannot authorize this full source scope.
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'missing_actor_product_writer_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'authenticated_scope_admin_required' then raise;end if;end;
end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'leaf_actor_product_writer_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'organization_scope_admin_required' then raise;end if;end;
end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'foreign_actor_product_writer_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'product_publication_gate_disabled' then raise;end if;end;
end;$$;
reset role;
select pg_temp.product_assert(not exists(select 1 from operations_whole_scope_publication_private.publications));
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
insert into product_results select label,public.publish_operations_whole_scope_product_v1(command) from product_commands order by label;
do $$begin
 begin perform operations_whole_scope_publication_private.calculate_scope_v1('{}');raise exception 'authenticated_calculator_json_accepted' using errcode='22023';exception when insufficient_privilege then null;end;
 begin perform public.publish_operations_whole_scope_product_v1(command||'{"amount_minor":0}') from product_commands where label='known';raise exception 'caller_money_accepted' using errcode='22023';exception when invalid_parameter_value then if sqlerrm<>'exact_product_publication_command_required' then raise;end if;end;
end;$$;
reset role;
insert into public.user_roles(user_id,organization_id,role) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','admin');
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'other_actual_actor_replay_accepted' using errcode='22023';exception when unique_violation then if sqlerrm<>'product_publication_idempotency_conflict' then raise;end if;end;
end;$$;
reset role;
delete from public.user_roles where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin';
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select pg_temp.product_assert((select count(*)=2 from operations_whole_scope_publication_private.publications) and
 (select count(*)=2 from operations_whole_scope_publication_private.heads) and
 (select count(*)=2 from operations_whole_scope_publication_private.receipts) and
 not exists(select 1 from operations_whole_scope_publication_private.publications p where
 p.export_grant is not null or p.destination_raw_body is not null or (select count(*) from jsonb_object_keys(p.document))<>22 or
 p.projection is distinct from pg_temp.prototype_scope(p.capture) or p.document->'capture' is distinct from p.capture or p.document->'projection' is distinct from p.projection or
 p.document->>'calculation_version'<>'operations-whole-scope-invoice-capture-sql.v1' or
 p.projection->>'source_coverage'<>'unavailable' or p.projection->>'source_currentness'<>'saved_receiver_heads_only' or p.projection->>'membership_currentness'<>'as_of_graph' or
 p.projection->'eac_minor'<>'null'::jsonb or p.projection->'budget_minor'<>'null'::jsonb or p.projection->'margin_minor'<>'null'::jsonb or p.projection->'remaining_minor'<>'null'::jsonb or
 p.source_evidence_fingerprint<>encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-evidence-v1',p.capture)),'UTF8')),'hex') or
 p.source_publication_fingerprint<>encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-publication-v1',p.document)),'UTF8')),'hex') or
 exists(select 1 from jsonb_array_elements(p.source_manifest) m where (select count(*) from jsonb_object_keys(m))<>16 or m ? 'invoice_id' or m ? 'source_organization_id')));
-- Actual compatible unknown basis stays unknown, never a copied zero.
select pg_temp.product_assert((select projection->'known_captured_invoice_cost_minor'='null'::jsonb and projection->'resolved_source_count'='0'::jsonb from operations_whole_scope_publication_private.publications where economic_scope_id=(select (command->>'economic_scope_id')::uuid from product_commands where label='unknown')));
set local role authenticated;
insert into product_results select 'known_second',public.publish_operations_whole_scope_product_v1(command||'{"expected_publication_revision":1,"idempotency_key":"product-isolated-known-second"}') from product_commands where label='known';
insert into product_results select 'known_historical',public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command||'{"idempotency_key":"product-isolated-stale-command"}') from product_commands where label='known';raise exception 'stale_product_cas_accepted' using errcode='22023';exception when sqlstate 'PT409' then if sqlerrm<>'product_publication_revision_changed' then raise;end if;end;
 begin perform public.publish_operations_whole_scope_product_v1(command||'{"reason":"Changed immutable command"}') from product_commands where label='known';raise exception 'changed_product_idempotency_accepted' using errcode='22023';exception when unique_violation then if sqlerrm<>'product_publication_idempotency_conflict' then raise;end if;end;
end;$$;
reset role;
select pg_temp.product_assert((select count(*)=3 from operations_whole_scope_publication_private.publications) and (select receipt->>'outcome'='replayed' and receipt->'historical_only'='true'::jsonb and receipt->'publication_revision'='1'::jsonb from product_results where label='known_historical') and (select publication_revision=2 from operations_whole_scope_publication_private.heads where economic_scope_id=(select (command->>'economic_scope_id')::uuid from product_commands where label='known')));
update operations_whole_scope_publication_private.gates set enabled=false;
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'revoked_product_gate_replay_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'product_publication_gate_disabled' then raise;end if;end;
end;$$;
reset role;
update operations_whole_scope_publication_private.gates set enabled=true;
update public.projects set deleted_at=now() where id='55555555-5555-4555-8555-555555555555';
set local role authenticated;
do $$begin
 begin perform public.publish_operations_whole_scope_product_v1(command) from product_commands where label='known';raise exception 'deleted_full_project_replay_accepted' using errcode='22023';exception when insufficient_privilege then if sqlerrm<>'product_full_member_permission_denied' then raise;end if;end;
end;$$;
reset role;
update public.projects set deleted_at=null where id='55555555-5555-4555-8555-555555555555';
do $$begin
 begin update operations_whole_scope_publication_private.publications set capture='{}';raise exception 'owner_publication_rewrite_accepted' using errcode='22023';exception when sqlstate '55000' then null;end;
 begin update operations_whole_scope_publication_private.heads set publication_revision=1;raise exception 'owner_head_rewind_accepted' using errcode='22023';exception when sqlstate '55000' then null;end;
 begin execute 'truncate operations_whole_scope_publication_private.publications cascade';raise exception 'owner_history_truncate_accepted' using errcode='22023';exception when sqlstate '55000' then null;end;
end;$$;
select pg_temp.product_assert((select count(*)=3 from operations_whole_scope_publication_private.publications) and (select count(*)=3 from operations_whole_scope_publication_private.receipts) and not exists(select 1 from operations_whole_scope_publication_private.receipts where document->>'delivery_state'<>'blocked_missing_export_grant'));
-- PRIVATE crosswire catalog, not a public financial report or exported proof.
select jsonb_agg(jsonb_build_object('document',p.document,'source_evidence_fingerprint',p.source_evidence_fingerprint,'source_publication_fingerprint',p.source_publication_fingerprint) order by p.economic_scope_id,p.publication_revision) as product_publication_private_vectors from operations_whole_scope_publication_private.publications p;
rollback;
select 'operations-whole-scope-product-publication PRIVATE fixture PASS' as result;
