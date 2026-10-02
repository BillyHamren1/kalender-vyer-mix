-- Genuine direct-role prerequisite fixture, not native concurrency or export proof.
-- Run only in the fresh existing product test namespace after actual known/unknown
-- receiver/baseline/binding/policy/scope/composition setup. Everything rolls back.
begin isolation level repeatable read;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime'
 or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('test.whole_scope_export_grant_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or (select count(*) from operations_whole_scope_product_native.known_fixture)<>1
 or (select count(*) from operations_whole_scope_product_native.unknown_fixture)<>1
 or exists(select 1 from operations_whole_scope_export_grant_private.events)
 or exists(select 1 from operations_whole_scope_export_grant_private.owners)
 or exists(select 1 from operations_whole_scope_export_grant_private.heads)
 or exists(select 1 from operations_whole_scope_export_grant_private.receipts)
 or exists(select 1 from operations_whole_scope_export_grant_private.gates)
 or exists(select 1 from operations_whole_scope_export_grant_private.partners)
 then raise exception 'fresh_actual_grant_fixture_required' using errcode='22023';end if;
end;$$;
create temporary table grant_event_vectors(label text primary key,document jsonb not null,raw_body text not null,fingerprint text not null,command_fingerprint text not null);
create temporary table grant_commands(slot text primary key,command jsonb not null);
create function pg_temp.grant_assert(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'grant fixture assertion: %',label;end if;end;$$;
create function pg_temp.grant_expect(p jsonb,state text,message text) returns void language plpgsql as $$declare got_state text;got_message text;begin
 begin perform public.write_operations_whole_scope_product_export_grant_v1(p);
 exception when others then get stacked diagnostics got_state=returned_sqlstate,got_message=message_text;end;
 if got_state is distinct from state or got_message is distinct from message then raise exception 'grant expected exact denial missing' using errcode='22023';end if;
end;$$;
revoke all on function pg_temp.grant_expect(jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function pg_temp.grant_expect(jsonb,text,text) to authenticated,service_role;

-- Actual commands use server-saved canonical selectors; mapping tokens are only
-- explicit isolated metadata declarations, never actual Finance admission facts.
do $$declare req jsonb;cmd jsonb;begin
 select read_request into req from operations_whole_scope_product_native.known_fixture where slot='only';
 cmd:=jsonb_build_object('schema_version','operations-whole-scope-product-export-grant-command.v1','economic_scope_id',req->'economic_scope_id','partner_version','16161616-1616-4616-8616-161616161616','destination_organization_id','99999999-9999-4999-8999-999999999999','destination_scope_id','17171717-1717-4717-8717-171717171717','destination_mapping_id','ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF','destination_mapping_revision','1.0'::jsonb,'destination_mapping_fingerprint',repeat('f',64),'expected_scope_revision',req->'expected_scope_revision','expected_membership_fingerprint',req->'expected_membership_fingerprint','expected_composition_revision',req->'expected_composition_revision','expected_composition_fingerprint',req->'expected_composition_fingerprint','expected_grant_revision',0,'enabled',false,'idempotency_key','isolated-grant-first-disabled','reason',E'Quote " and newline\nÅ😀');
 insert into grant_commands values('first',cmd);
 select read_request into req from operations_whole_scope_product_native.unknown_fixture where slot='only';
 insert into grant_commands values('contender',cmd||jsonb_build_object('economic_scope_id',req->'economic_scope_id','partner_version','19191919-1919-4919-8919-191919191919','expected_scope_revision',req->'expected_scope_revision','expected_membership_fingerprint',req->'expected_membership_fingerprint','expected_composition_revision',req->'expected_composition_revision','expected_composition_fingerprint',req->'expected_composition_fingerprint','idempotency_key','isolated-grant-other-scope'));
end;$$;
insert into operations_whole_scope_export_grant_private.gates select '11111111-1111-4111-8111-111111111111',(command->>'economic_scope_id')::uuid,false from grant_commands;
insert into operations_whole_scope_export_grant_private.partners(partner_version,organization_id,economic_scope_id,destination_organization_id,destination_scope_id)
 select (command->>'partner_version')::uuid,'11111111-1111-4111-8111-111111111111',(command->>'economic_scope_id')::uuid,(command->>'destination_organization_id')::uuid,(command->>'destination_scope_id')::uuid from grant_commands;
insert into operations_whole_scope_export_grant_private.partners(partner_version,organization_id,economic_scope_id,destination_organization_id,destination_scope_id,enabled)
 select '20202020-2020-4020-8020-202020202020',organization_id,economic_scope_id,destination_organization_id,destination_scope_id,false from operations_whole_scope_export_grant_private.partners where partner_version='16161616-1616-4616-8616-161616161616';
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);

-- Default gates/partner cannot reserve even a disabled event.
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';
 execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'42501','grant_write_gate_disabled');execute 'reset role';
 perform pg_temp.grant_assert(not exists(select 1 from operations_whole_scope_export_grant_private.events),'disabled gate no event');
end;$$;
update operations_whole_scope_export_grant_private.gates set enabled=true;
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';
 execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'42501','enabled_grant_partner_required');execute 'reset role';
 perform pg_temp.grant_assert(not exists(select 1 from operations_whole_scope_export_grant_private.owners),'disabled first partner no reservation');
end;$$;
update operations_whole_scope_export_grant_private.partners set enabled=true where partner_version in ('16161616-1616-4616-8616-161616161616','19191919-1919-4919-8919-191919191919');

-- Actual accepted metadata-only first event and permanent owner.
do $$declare cmd jsonb;r jsonb;begin select command into cmd from grant_commands where slot='first';
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(cmd);execute 'reset role';
 perform pg_temp.grant_assert(r->>'outcome'='accepted' and r->'revision'='1'::jsonb and r->'enabled'='false'::jsonb and r->>'export_state'='blocked_missing_export_writer' and (select count(*) from jsonb_object_keys(r))=11,'first actual immutable receipt11');
 insert into grant_event_vectors select 'first_disabled',document,raw_body,fingerprint,command_fingerprint from operations_whole_scope_export_grant_private.events where event_id=(r->>'event_id')::uuid;
 perform pg_temp.grant_assert((select count(*) from operations_whole_scope_export_grant_private.owners)=1 and (select count(*) from operations_whole_scope_export_grant_private.events)=1 and (select count(*) from operations_whole_scope_export_grant_private.heads)=1 and (select count(*) from operations_whole_scope_export_grant_private.receipts)=1,'first all four tables atomic');
end;$$;

-- Same command is historical-only; conflicting metadata/actor never rewrites it.
do $$declare cmd jsonb;r jsonb;begin select command into cmd from grant_commands where slot='first';
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(cmd);perform pg_temp.grant_expect(cmd||jsonb_build_object('reason','Conflicting same-key reason'),'23505','grant_idempotency_conflict');execute 'reset role';
 perform pg_temp.grant_assert(r->>'outcome'='replayed' and r->'historical_only'='true'::jsonb and r->'revision'='1'::jsonb,'first exact replay historical only');
 perform pg_temp.grant_assert((select count(*) from operations_whole_scope_export_grant_private.events)=1,'no replay event');
end;$$;
insert into public.user_roles(user_id,organization_id,role) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','admin');
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'23505','grant_idempotency_conflict');execute 'reset role';end;$$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);

-- Two real current source scopes cannot share one whole destination owner.
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='contender';execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'23505','grant_destination_permanent_owner_conflict');execute 'reset role';
 perform pg_temp.grant_assert((select count(*) from operations_whole_scope_export_grant_private.events)=1 and (select count(*) from operations_whole_scope_export_grant_private.owners)=1,'contender no partial owner or event');
end;$$;

-- Live project, actual user role and gate revoke are real rows, not supplied booleans.
update public.projects set deleted_at=clock_timestamp() where id='77777777-7777-4777-8777-777777777777';
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'42501','grant_full_member_permission_denied');execute 'reset role';end;$$;
update public.projects set deleted_at=null where id='77777777-7777-4777-8777-777777777777';
update public.projects set organization_id='88888888-8888-4888-8888-888888888888' where id='77777777-7777-4777-8777-777777777777';
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'42501','grant_full_member_permission_denied');execute 'reset role';end;$$;
update public.projects set organization_id='11111111-1111-4111-8111-111111111111' where id='77777777-7777-4777-8777-777777777777';
delete from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='admin';
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'42501','organization_scope_admin_required');execute 'reset role';end;$$;
insert into public.user_roles(user_id,organization_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin');

-- Enabled successor remains metadata only; stale expected revision has nonretryable conflict.
do $$declare cmd jsonb;r jsonb;begin select command into cmd from grant_commands where slot='first';
 cmd:=cmd||jsonb_build_object('expected_grant_revision',1,'enabled',true,'idempotency_key','isolated-grant-enabled-successor');insert into grant_commands values('enabled',cmd);
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(cmd);
 perform pg_temp.grant_expect(cmd||jsonb_build_object('expected_grant_revision',0,'idempotency_key','isolated-grant-stale-head'),'PT409','grant_revision_changed');execute 'reset role';
 perform pg_temp.grant_assert(r->'revision'='2'::jsonb and r->'enabled'='true'::jsonb and r->>'export_state'='blocked_missing_export_writer','enabled metadata blocked');
 insert into grant_event_vectors select 'enabled_successor',document,raw_body,fingerprint,command_fingerprint from operations_whole_scope_export_grant_private.events where event_id=(r->>'event_id')::uuid;
end;$$;

-- Disable after partner revocation works only for the exact locked current version.
update operations_whole_scope_export_grant_private.partners set enabled=false where partner_version='16161616-1616-4616-8616-161616161616';
do $$declare cmd jsonb;r jsonb;begin select command into cmd from grant_commands where slot='enabled';
 cmd:=cmd||jsonb_build_object('expected_grant_revision',2,'enabled',false,'idempotency_key','isolated-grant-recorded-revoke');
 execute 'set local role authenticated';perform pg_temp.grant_expect(cmd||jsonb_build_object('partner_version','20202020-2020-4020-8020-202020202020','idempotency_key','isolated-grant-disabled-new-version'),'42501','enabled_grant_partner_required');
 r:=public.write_operations_whole_scope_product_export_grant_v1(cmd);
 perform pg_temp.grant_expect(cmd||jsonb_build_object('expected_grant_revision',3,'enabled',true,'idempotency_key','isolated-grant-reenable-disabled'),'42501','enabled_grant_partner_required');execute 'reset role';
 perform pg_temp.grant_assert(r->'revision'='3'::jsonb and r->'enabled'='false'::jsonb,'same disabled partner explicit successor');
 insert into grant_commands values('revoke',cmd);
 insert into grant_event_vectors select 'recorded_revoke',document,raw_body,fingerprint,command_fingerprint from operations_whole_scope_export_grant_private.events where event_id=(r->>'event_id')::uuid;
end;$$;

-- Historical first command after current rev3 never returns a new usable grant.
do $$declare cmd jsonb;r jsonb;begin select command into cmd from grant_commands where slot='first';execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(cmd);execute 'reset role';
 perform pg_temp.grant_assert(r->'revision'='1'::jsonb and r->'historical_only'='true'::jsonb and r->>'outcome'='replayed','historical facts retained after revocation');
 perform pg_temp.grant_assert((select revision from operations_whole_scope_export_grant_private.heads where economic_scope_id=(cmd->>'economic_scope_id')::uuid)=3 and (select count(*) from operations_whole_scope_export_grant_private.events)=3,'historical replay never reactivates');
end;$$;

-- Composition advance is genuine authenticated state; replay uses current context
-- and does not re-authorize the old event's snapshot or rewrite any document.
do $$declare compose jsonb;r jsonb;cmd jsonb;begin
 select compose_command into compose from operations_whole_scope_product_native.known_fixture where slot='only';
 compose:=compose||jsonb_build_object('expected_composition_revision',1,'idempotency_key','isolated-grant-current-composition','reason','Actual new current composition for historical metadata replay');
 execute 'set local role authenticated';r:=public.compose_operations_scope_obligations_v1(compose);execute 'reset role';
 perform pg_temp.grant_assert(r->'composition_revision'='2'::jsonb,'actual composition advanced');
 select command into cmd from grant_commands where slot='first';
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(cmd);execute 'reset role';
 perform pg_temp.grant_assert(r->'revision'='1'::jsonb and r->'historical_only'='true'::jsonb and (select count(*) from operations_whole_scope_export_grant_private.events)=3,'historical replay after actual composition advance');
end;$$;
update operations_whole_scope_export_grant_private.partners set enabled=true where partner_version in ('16161616-1616-4616-8616-161616161616','20202020-2020-4020-8020-202020202020');
do $$declare cmd jsonb;r jsonb;c public.operations_scope_obligation_compositions%rowtype;first_owner uuid;begin
 select command into cmd from grant_commands where slot='first';
 select first_event_id into first_owner from operations_whole_scope_export_grant_private.owners where economic_scope_id=(cmd->>'economic_scope_id')::uuid;
 execute 'set local role authenticated';perform pg_temp.grant_expect(cmd||jsonb_build_object('expected_grant_revision',3,'enabled',true,'idempotency_key','isolated-grant-stale-composition'),'PT409','current_grant_composition_required');execute 'reset role';
 select c0.* into c from public.operations_scope_obligation_composition_heads h join public.operations_scope_obligation_compositions c0 on c0.organization_id=h.organization_id and c0.economic_scope_id=h.economic_scope_id and c0.composition_revision=h.current_revision where h.organization_id='11111111-1111-4111-8111-111111111111' and h.economic_scope_id=(cmd->>'economic_scope_id')::uuid;
 cmd:=cmd||jsonb_build_object('partner_version','20202020-2020-4020-8020-202020202020','expected_grant_revision',3,'expected_composition_revision',c.composition_revision,'expected_composition_fingerprint',c.fingerprint,'enabled',true,'idempotency_key','isolated-grant-version-rotation');
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(cmd);execute 'reset role';
 perform pg_temp.grant_assert(r->'revision'='4'::jsonb and (select first_event_id from operations_whole_scope_export_grant_private.owners where economic_scope_id=(cmd->>'economic_scope_id')::uuid)=first_owner and (select count(*) from operations_whole_scope_export_grant_private.owners)=1,'version rotation keeps permanent owner');
 insert into grant_event_vectors select 'version_rotation',document,raw_body,fingerprint,command_fingerprint from operations_whole_scope_export_grant_private.events where event_id=(r->>'event_id')::uuid;
end;$$;

-- Rights boundaries: service can change only enabled configuration, never identity
-- or private ledgers; authenticated has only the defended function entry.
do $$declare blocked boolean;actual_event uuid;begin
 select event_id into actual_event from operations_whole_scope_export_grant_private.heads;
 perform pg_temp.grant_assert(has_column_privilege('service_role','operations_whole_scope_export_grant_private.partners','enabled','UPDATE') and not has_column_privilege('service_role','operations_whole_scope_export_grant_private.partners','destination_scope_id','UPDATE'),'column-only config privileges');
 perform pg_temp.grant_assert(not has_function_privilege('service_role','public.write_operations_whole_scope_product_export_grant_v1(jsonb)','EXECUTE') and not has_function_privilege('service_role','operations_whole_scope_export_grant_private.write_v1(jsonb)','EXECUTE') and not has_function_privilege('anon','public.write_operations_whole_scope_product_export_grant_v1(jsonb)','EXECUTE'),'actual writer execution roles');
 execute 'set local role service_role';
 update operations_whole_scope_export_grant_private.partners set enabled=true where partner_version='20202020-2020-4020-8020-202020202020';
 blocked:=false;begin update operations_whole_scope_export_grant_private.partners set destination_scope_id='21212121-2121-4121-8121-212121212121' where partner_version='20202020-2020-4020-8020-202020202020';exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'service config identity unexpectedly writable' using errcode='22023';end if;
 blocked:=false;begin perform public.write_operations_whole_scope_product_export_grant_v1('{}');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'service writer unexpectedly executable' using errcode='22023';end if;
 blocked:=false;begin update operations_whole_scope_export_grant_private.heads set revision=revision+1;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'service head unexpectedly writable' using errcode='22023';end if;
 blocked:=false;begin perform 1 from operations_whole_scope_export_grant_private.events;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'service private event unexpectedly readable' using errcode='22023';end if;
 blocked:=false;begin insert into operations_whole_scope_export_grant_private.receipts(event_id,document) values(actual_event,'{}');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'service receipt unexpectedly writable' using errcode='22023';end if;
 blocked:=false;begin insert into operations_whole_scope_export_grant_private.events(event_id) values(actual_event);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'service event unexpectedly writable' using errcode='22023';end if;
 execute 'reset role';
 perform pg_temp.grant_assert(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='operations_whole_scope_export_grant_private' and c.relname in ('events','owners','heads','receipts') and (has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))),'actual ledger privileges closed');
end;$$;

-- Owner-level trigger negatives test integrity even after the role barrier.
do $$declare denied boolean;begin
 denied:=false;begin update operations_whole_scope_export_grant_private.partners set destination_scope_id='21212121-2121-4121-8121-212121212121' where partner_version='20202020-2020-4020-8020-202020202020';exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'owner config identity guard');
 denied:=false;begin update operations_whole_scope_export_grant_private.owners set destination_scope_id='21212121-2121-4121-8121-212121212121';exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'owner permanent tuple guard');
 denied:=false;begin update operations_whole_scope_export_grant_private.heads set revision=3;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'head rewind guard');
 denied:=false;begin update operations_whole_scope_export_grant_private.heads set revision=5;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'head matching saved event required');
 denied:=false;begin delete from operations_whole_scope_export_grant_private.events;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'event history cannot delete');
 denied:=false;begin delete from operations_whole_scope_export_grant_private.receipts;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'receipt history cannot delete');
 denied:=false;begin truncate operations_whole_scope_export_grant_private.heads;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'head cannot truncate');
 denied:=false;begin insert into operations_whole_scope_export_grant_private.receipts select event_id,document||jsonb_build_object('enabled',not(document->>'enabled')::boolean) from operations_whole_scope_export_grant_private.receipts limit 1;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.grant_assert(denied,'receipt exact immutable binding');
end;$$;

-- Intact owner INSERT guards independently bind lookup identity and immutable
-- partner identity, not merely the writer's earlier authorization checks.
do $$declare row operations_whole_scope_export_grant_private.events%rowtype;message text;denied boolean;begin
 select * into row from operations_whole_scope_export_grant_private.events where revision=4;
 row.idempotency_key:='mismatched-column-lookup-key';denied:=false;
 begin insert into operations_whole_scope_export_grant_private.events select (row).*;
 exception when sqlstate '55000' then get stacked diagnostics message=message_text;denied:=message='saved_grant_idempotency_required';end;
 perform pg_temp.grant_assert(denied,'exact column command idempotency binding');
 select * into row from operations_whole_scope_export_grant_private.events where revision=4;
 -- This partner row is genuinely saved but declares a different permanent
 -- destination. Normalize every other event/command/hash field consistently.
 insert into operations_whole_scope_export_grant_private.partners(partner_version,organization_id,economic_scope_id,destination_organization_id,destination_scope_id)
 values('23232323-2323-4323-8323-232323232323',row.organization_id,row.economic_scope_id,row.destination_organization_id,'24242424-2424-4242-8242-242424242424');
 row.event_id:=gen_random_uuid();row.revision:=5;row.partner_version:='23232323-2323-4323-8323-232323232323';row.idempotency_key:='mismatched-partner-event-key';
 row.command:=row.command||jsonb_build_object('partner_version',row.partner_version,'expected_grant_revision',4,'idempotency_key',row.idempotency_key);
 row.command_fingerprint:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-grant-command-v1',row.command)),'UTF8')),'hex');
 row.document:=row.document||jsonb_build_object('event_id',row.event_id,'revision',row.revision,'partner_version',row.partner_version,'command',row.command,'command_fingerprint',row.command_fingerprint);
 row.raw_body:=operations_economy_private.canonical_json_v1(row.document);
 row.fingerprint:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-grant-event-v1',row.document)),'UTF8')),'hex');
 denied:=false;begin insert into operations_whole_scope_export_grant_private.events select (row).*;
 exception when sqlstate '55000' then get stacked diagnostics message=message_text;denied:=message='saved_grant_partner_identity_required';end;
 perform pg_temp.grant_assert(denied and (select count(*) from operations_whole_scope_export_grant_private.events)=4 and (select count(*) from operations_whole_scope_export_grant_private.receipts)=4,'exact saved partner identity independent insert guard');
end;$$;

-- Historical actor deletion is not blocked by a new grant FK. Current actual
-- auth deletion and cascading role revoke deny replay, preserving immutable facts.
delete from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'42501','authenticated_scope_admin_required');execute 'reset role';
 perform pg_temp.grant_assert((select count(*) from operations_whole_scope_export_grant_private.events)=4,'actor deletion preserves actual grant history');end;$$;
insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.user_roles(user_id,organization_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin');
update operations_whole_scope_export_grant_private.gates set enabled=false;
do $$declare cmd jsonb;begin select command into cmd from grant_commands where slot='first';execute 'set local role authenticated';perform pg_temp.grant_expect(cmd,'42501','grant_write_gate_disabled');execute 'reset role';end;$$;
update operations_whole_scope_export_grant_private.gates set enabled=true;

-- All metadata is still blocked; the old product columns and financial domains
-- are not altered. Deferred actual owner-first-event bindings are checked now.
set constraints all immediate;
do $$begin
 perform pg_temp.grant_assert((select count(*) from operations_whole_scope_export_grant_private.owners)=1 and (select count(*) from operations_whole_scope_export_grant_private.events)=4 and (select count(*) from operations_whole_scope_export_grant_private.heads)=1 and (select count(*) from operations_whole_scope_export_grant_private.receipts)=4,'exact final private ledger counts');
 perform pg_temp.grant_assert(not exists(select 1 from operations_whole_scope_publication_private.publications where export_grant is not null or destination_raw_body is not null),'original product export remains NULL');
 perform pg_temp.grant_assert(not exists(select 1 from operations_whole_scope_export_grant_private.receipts where document->>'export_state'<>'blocked_missing_export_writer' or document->'shadow_only'<>'true'::jsonb),'metadata never usable export');
 perform pg_temp.grant_assert((select count(*) from grant_event_vectors)=4,'four actual SQL event vectors');
end;$$;
-- PRIVATE runner capture only: raw document metadata must not be echoed in CI.
select jsonb_agg(jsonb_build_object('label',label,'document',document,'raw_body',raw_body,'fingerprint',fingerprint,'command_fingerprint',command_fingerprint) order by label) as grant_event_private_vectors from grant_event_vectors;
rollback;

-- A function-level default sets PostgREST's NEW transaction metadata, not a
-- preexisting direct READ COMMITTED transaction. Actual guard denies it first.
begin isolation level read committed;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare denied boolean:=false;message text;begin
 execute 'set local role authenticated';
 begin perform public.write_operations_whole_scope_product_export_grant_v1('{}');
 exception when sqlstate '55000' then get stacked diagnostics message=message_text;denied:=message='coherent_grant_transaction_required';end;
 execute 'reset role';
 if not denied or exists(select 1 from operations_whole_scope_export_grant_private.events) or exists(select 1 from operations_whole_scope_export_grant_private.owners) then raise exception 'actual RC denial before writes required' using errcode='22023';end if;
end;$$;
rollback;
