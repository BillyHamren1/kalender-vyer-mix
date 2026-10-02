-- NEW native TEST fixture: actual source APIs, no copied proof or caller money.
begin isolation level repeatable read;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime'
 or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('test.whole_scope_export_grant_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_whole_scope_grant_native') is not null
 or (select count(*) from operations_whole_scope_product_native.known_fixture)<>1
 or (select count(*) from operations_whole_scope_product_native.unknown_fixture)<>1
 or (select count(*) from public.operations_project_scope_heads)<>2
 or exists(select 1 from operations_whole_scope_export_grant_private.owners)
 or exists(select 1 from operations_whole_scope_export_grant_private.events)
 or exists(select 1 from operations_whole_scope_export_grant_private.heads)
 or exists(select 1 from operations_whole_scope_export_grant_private.receipts)
 or exists(select 1 from operations_whole_scope_export_grant_private.gates)
 or exists(select 1 from operations_whole_scope_export_grant_private.partners)
 then raise exception 'fresh_actual_native_grant_setup_required' using errcode='22023';end if;
end;$$;
create schema operations_whole_scope_grant_native;
revoke all on schema operations_whole_scope_grant_native from public,anon,authenticated,service_role;
create table operations_whole_scope_grant_native.commands(label text primary key,organization_id uuid not null,actor_id uuid not null,command jsonb not null);
revoke all on operations_whole_scope_grant_native.commands from public,anon,authenticated,service_role;
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
insert into public.operations_scope_invoice_kernel_read_gates values('88888888-8888-4888-8888-888888888888',true);
insert into public.operations_invoice_obligation_kernel_read_gates values('88888888-8888-4888-8888-888888888888',true);
do $$declare preview jsonb;b jsonb;c jsonb;r jsonb;capture jsonb;scope uuid:='25252525-2525-4252-8252-252525252525';begin
 execute 'set local role authenticated';
 preview:=public.preview_operations_project_scope_v1('project','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 if preview#>'{membership,source_project_ids}' is distinct from '["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]'::jsonb then raise exception 'real_cross_org_member_required' using errcode='22023';end if;
 r:=public.enroll_operations_project_scope_v1(jsonb_build_object('schema','operations-project-scope-enroll.v1','economic_scope_id',scope,'root_kind','project','root_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','expected_revision',0,'expected_membership_fingerprint',preview->'membership_fingerprint','idempotency_key','native-grant-cross-org-enroll','reason','Explicit independent actual source scope'));
 b:=public.append_operations_manual_obligation_baseline_v1(jsonb_build_object('schema_version','operations-obligation-manual-baseline.v1','project_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','obligation_id','26262626-2626-4262-8262-262626262626','expected_revision',0,'currency','SEK','category','supplier','cost_basis','invoice','estimate_minor',null,'committed_minor',null,'idempotency_key','native-grant-cross-org-baseline','reason','Actual unknown baseline only'));
 c:=public.compose_operations_scope_obligations_v1(jsonb_build_object('schema_version','operations-scope-obligation-compose.v1','economic_scope_id',scope,'expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',0,'currency','SEK','baseline_event_ids',jsonb_build_array(b->'event_id'),'idempotency_key','native-grant-cross-org-compose','reason','Actual current unknown manual obligation'));
 execute 'reset role';
 r:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-read.v1','organization_id','88888888-8888-4888-8888-888888888888','economic_scope_id',scope,'expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',1,'expected_composition_fingerprint',c->'fingerprint');
 execute 'set local role service_role';capture:=public.read_operations_scope_invoice_kernel_evidence_v1(r);execute 'reset role';
 if jsonb_array_length(capture->'members')<>1 or capture->'source_inventory' is distinct from '[]'::jsonb or capture->'eac_minor' is distinct from 'null'::jsonb or capture->'budget_minor' is distinct from 'null'::jsonb or capture->'source_coverage' is distinct from '"unavailable"'::jsonb then raise exception 'cross_org_unknown_capture_required' using errcode='22023';end if;
 insert into operations_whole_scope_grant_native.commands values('other_org','88888888-8888-4888-8888-888888888888','cccccccc-cccc-4ccc-8ccc-cccccccccccc',jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-command.v1','economic_scope_id',scope,'partner_version','29292929-2929-4292-8292-292929292929','destination_organization_id','99999999-9999-4999-8999-999999999999','destination_scope_id','17171717-1717-4717-8717-171717171717','destination_mapping_id','abcdefab-cdef-4abc-8def-abcdefabcdef','destination_mapping_revision',1,'destination_mapping_fingerprint',repeat('f',64),'expected_scope_revision',1,'expected_membership_fingerprint',preview->'membership_fingerprint','expected_composition_revision',1,'expected_composition_fingerprint',c->'fingerprint','expected_grant_revision',0,'enabled',false,'idempotency_key','native-grant-cross-org-first','reason','Explicit synthetic independent permanent owner contender'));
end;$$;

do $$declare req jsonb;begin
 select read_request into req from operations_whole_scope_product_native.known_fixture where slot='only';
 insert into operations_whole_scope_grant_native.commands values('known','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-command.v1','economic_scope_id',req->'economic_scope_id','partner_version','16161616-1616-4616-8616-161616161616','destination_organization_id','99999999-9999-4999-8999-999999999999','destination_scope_id','17171717-1717-4717-8717-171717171717','destination_mapping_id','abcdefab-cdef-4abc-8def-abcdefabcdef','destination_mapping_revision',1,'destination_mapping_fingerprint',repeat('f',64),'expected_scope_revision',req->'expected_scope_revision','expected_membership_fingerprint',req->'expected_membership_fingerprint','expected_composition_revision',req->'expected_composition_revision','expected_composition_fingerprint',req->'expected_composition_fingerprint','expected_grant_revision',0,'enabled',false,'idempotency_key','native-grant-known-first','reason','Actual source captured metadata only'));
end;$$;
insert into operations_whole_scope_export_grant_private.gates select organization_id,(command->>'economic_scope_id')::uuid,true from operations_whole_scope_grant_native.commands;
insert into operations_whole_scope_export_grant_private.partners(partner_version,organization_id,economic_scope_id,destination_organization_id,destination_scope_id,enabled)
 select (command->>'partner_version')::uuid,organization_id,(command->>'economic_scope_id')::uuid,(command->>'destination_organization_id')::uuid,(command->>'destination_scope_id')::uuid,true from operations_whole_scope_grant_native.commands;
-- Produce a real unchanged old product snapshot; its SQL NULL constraints are
-- asserted against an actual row rather than an empty table.
insert into operations_whole_scope_publication_private.gates values('11111111-1111-4111-8111-111111111111','90909090-9090-4909-8909-909090909090',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare req jsonb;receipt jsonb;begin
 select read_request into req from operations_whole_scope_product_native.known_fixture where slot='only';
 execute 'set local role authenticated';receipt:=public.publish_operations_whole_scope_product_v1(req-'schema_version'-'organization_id'||jsonb_build_object('schema_version','operations-whole-scope-product-publication-command.v1','expected_publication_revision',0,'idempotency_key','native-grant-old-null-snapshot','reason','Assert unchanged product NULL export barrier'));execute 'reset role';
 if receipt->>'delivery_state' is distinct from 'blocked_missing_export_grant' or (select count(*) from operations_whole_scope_publication_private.publications)<>1 or exists(select 1 from operations_whole_scope_publication_private.publications where export_grant is not null or destination_raw_body is not null) then raise exception 'actual_old_product_null_barrier_required' using errcode='22023';end if;
end;$$;
commit;
