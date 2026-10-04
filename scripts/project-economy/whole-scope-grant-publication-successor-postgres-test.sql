-- Actual isolated role/source fixture; no caller money, source export or Finance admission.
-- Must follow genuine product/bootstrap/source/grant setup, never hosted/account data.
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare denied boolean:=false;begin
 execute 'set local role authenticated';
 begin perform public.publish_operations_whole_scope_granted_product_v2(null);exception when sqlstate '55000' then denied:=true;end;
 execute 'reset role';if not denied then raise exception 'direct_RC_denial_required' using errcode='22023';end if;
end;$$;
rollback;
begin isolation level repeatable read;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime' or current_setting('test.whole_scope_granted_publication_isolated',true) is distinct from 'synthetic-disposable' or current_user<>'postgres'
 or (select count(*) from operations_whole_scope_publication_private.publications)<>1
 or exists(select 1 from operations_whole_scope_export_grant_private.events)
 or exists(select 1 from operations_whole_scope_publication_private.grant_bindings)
 or exists(select 1 from operations_whole_scope_publication_private.granted_gates)
 then raise exception 'fresh_actual_successor_fixture_required' using errcode='22023';end if;
end;$$;
create function pg_temp.successor_assert(p boolean) returns void language plpgsql as $$begin if p is distinct from true then raise exception 'successor_fixture_assertion' using errcode='22023';end if;end;$$;
create function pg_temp.successor_deny(p jsonb,code text,message text default null) returns void language plpgsql as $$declare caught text;detail text;begin
 begin perform public.publish_operations_whole_scope_granted_product_v2(p);
 exception when others then get stacked diagnostics caught=returned_sqlstate,detail=message_text;
 if caught=code and (message is null or message=detail) then return;end if;
 raise exception 'successor_fixture_wrong_denial' using errcode='22023';end;
 raise exception 'successor_fixture_missing_denial' using errcode='22023';end;$$;
create temp table successor_vectors(label text primary key,document jsonb not null,receipt jsonb not null,publication_fingerprint text not null,command_fingerprint text not null);
create temp table successor_commands(label text primary key,command jsonb not null);
insert into successor_commands select 'first',read_request-'organization_id'-'schema_version'||jsonb_build_object('schema_version','operations-whole-scope-granted-product-publication-command.v2','expected_publication_revision',1,'expected_grant_revision',1,'idempotency_key','successor-new-granted-first','reason','Genuine isolated fresh captured publication') from operations_whole_scope_product_native.known_fixture where slot='only';
insert into operations_whole_scope_publication_private.granted_gates select organization_id,(command->>'economic_scope_id')::uuid,false from operations_whole_scope_grant_native.commands where label='known';
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare q jsonb;begin select command into q from successor_commands where label='first';
 execute 'set local role anon';perform pg_temp.successor_deny(q,'42501');execute 'reset role';
 execute 'set local role service_role';perform pg_temp.successor_deny(q,'42501');execute 'reset role';
 execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501','granted_publication_gate_disabled');execute 'reset role';
 perform pg_temp.successor_assert((select count(*) from operations_whole_scope_publication_private.publications)=1 and not exists(select 1 from operations_whole_scope_publication_private.grant_bindings));
end;$$;
-- Actual distinct saved issuer: existing isolated Auth/profile row, genuine role and grant API.
insert into public.user_roles(user_id,organization_id,role) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','admin');
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
do $$declare q jsonb;r jsonb;begin
 select command||jsonb_build_object('enabled',true,'idempotency_key','successor-genuine-enabled-grant','reason','Actual distinct issuer grants current complete scope') into q from operations_whole_scope_grant_native.commands where label='known';
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(q);execute 'reset role';
 perform pg_temp.successor_assert(r->'revision'='1'::jsonb and r->'enabled'='true'::jsonb);
end;$$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
update operations_whole_scope_publication_private.granted_gates set enabled=true;
-- Immutable config privileges: service may toggle only enabled, never source identity/ledger.
do $$declare denied boolean:=false;begin
 execute 'set local role service_role';
 begin update operations_whole_scope_publication_private.granted_gates set economic_scope_id='19191919-1919-4919-8919-191919191919';exception when insufficient_privilege then denied:=true;end;
 execute 'reset role';perform pg_temp.successor_assert(denied and not has_table_privilege('service_role','operations_whole_scope_publication_private.grant_bindings','INSERT') and not has_table_privilege('authenticated','operations_whole_scope_publication_private.publications','INSERT'));
end;$$;
-- Current saved issuer rights are real, not caller asserted.
delete from public.user_roles where user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and role='admin';
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501','current_grant_issuer_required');execute 'reset role';end;$$;
insert into public.user_roles(user_id,organization_id,role) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','admin');
update public.projects set deleted_at=clock_timestamp() where id='77777777-7777-4777-8777-777777777777';
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501','granted_full_member_permission_denied');execute 'reset role';end;$$;
update public.projects set deleted_at=null where id='77777777-7777-4777-8777-777777777777';
-- Genuine first-v2 save uses one physical revision2, actual source capture and copied NULL coverage.
do $$declare q jsonb;r jsonb;p operations_whole_scope_publication_private.publications%rowtype;begin
 select command into q from successor_commands where label='first';execute 'set local role authenticated';r:=public.publish_operations_whole_scope_granted_product_v2(q);execute 'reset role';
 select * into p from operations_whole_scope_publication_private.publications where publication_id=(r->>'publication_id')::uuid;
 perform pg_temp.successor_assert(r->'publication_revision'='2'::jsonb and (select count(*) from jsonb_object_keys(r))=12 and r->>'delivery_state'='blocked_missing_protected_source_export' and r->'shadow_only'='true'::jsonb and p.destination_raw_body is null and p.export_grant is not null and p.actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and p.document->'projection'->'eac_minor'='null'::jsonb);
 insert into successor_vectors values('first_granted',p.document,r,p.source_publication_fingerprint,encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-granted-product-publication-command-v2',q)),'UTF8')),'hex'));
 perform pg_temp.successor_assert((select count(*) from operations_whole_scope_publication_private.heads)=1 and (select count(*) from operations_whole_scope_publication_private.grant_bindings)=1);
end;$$;
set constraints all immediate;
set constraints all deferred;
-- Intact owner-level insert/receipt/head integrity, each negative fully rolls back.
create temp table successor_saved_history as select to_jsonb(p) publication_row,to_jsonb(b) binding_row,to_jsonb(r) receipt_row from operations_whole_scope_publication_private.publications p join operations_whole_scope_publication_private.grant_bindings b using(publication_id) join operations_whole_scope_publication_private.receipts r using(publication_id);
create function pg_temp.successor_owner_negative(mode text) returns void language plpgsql as $$declare
 p operations_whole_scope_publication_private.publications%rowtype;q jsonb;r jsonb;denied boolean:=false;
begin
 select x.* into p from operations_whole_scope_publication_private.publications x where x.document->>'schema_version'='operations-whole-scope-granted-product-publication.v2';
 q:=p.command||jsonb_build_object('expected_publication_revision',2,'idempotency_key','successor-owner-clone-'||mode);
 p.publication_id:=gen_random_uuid();p.publication_revision:=3;p.command:=q;p.idempotency_key:=q->>'idempotency_key';
 p.document:=p.document||jsonb_build_object('publication_id',p.publication_id,'publication_revision',3,'command',q);
 p.source_publication_fingerprint:=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-granted-product-publication-v2',p.document)),'UTF8')),'hex');
 if mode='wrong_column' then p.idempotency_key:='different-owner-column';
 elsif mode='wrong_fingerprint' then p.source_publication_fingerprint:=repeat('f',64);
 elsif mode='wrong_grant' then p.export_grant:=p.export_grant||jsonb_build_object('revision',2);end if;
 begin
 insert into operations_whole_scope_publication_private.publications select (p).*;
 if mode<>'missing_binding' then
 insert into operations_whole_scope_publication_private.grant_bindings values(p.publication_id,p.organization_id,p.economic_scope_id,(p.export_grant->>'event_id')::uuid);
 end if;
 if mode='wrong_receipt' then
 r:=operations_whole_scope_publication_private.receipt_granted_v2(p.publication_id)||jsonb_build_object('grant_revision',99);
 insert into operations_whole_scope_publication_private.receipts values(p.publication_id,r);
 end if;
 set constraints all immediate;
 exception when sqlstate '55000' then denied:=true;end;
 perform pg_temp.successor_assert(denied and (select count(*) from operations_whole_scope_publication_private.publications)=2 and (select count(*) from operations_whole_scope_publication_private.grant_bindings)=1 and (select count(*) from operations_whole_scope_publication_private.receipts)=2);
end;$$;
select pg_temp.successor_owner_negative(mode) from unnest(array['wrong_column','wrong_fingerprint','wrong_grant','missing_binding','missing_receipt','wrong_receipt']) mode;
do $$declare denied boolean:=false;event uuid;legacy uuid;begin
 select event_id into event from operations_whole_scope_export_grant_private.events;
 select publication_id into legacy from operations_whole_scope_publication_private.publications where export_grant is null;
 begin insert into operations_whole_scope_publication_private.grant_bindings values(legacy,'11111111-1111-4111-8111-111111111111','90909090-9090-4909-8909-909090909090',event);exception when sqlstate '55000' then denied:=true;end;perform pg_temp.successor_assert(denied);
 denied:=false;begin update operations_whole_scope_publication_private.grant_bindings set grant_event_id=gen_random_uuid();exception when sqlstate '55000' then denied:=true;end;perform pg_temp.successor_assert(denied);
 denied:=false;begin delete from operations_whole_scope_publication_private.grant_bindings;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.successor_assert(denied);
 denied:=false;begin truncate operations_whole_scope_publication_private.grant_bindings;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.successor_assert(denied);
 denied:=false;begin update operations_whole_scope_publication_private.heads set publication_revision=99;exception when sqlstate '55000' then denied:=true;end;perform pg_temp.successor_assert(denied);
end;$$;

-- Saved facts and changed-command/cross-protocol conflicts.
do $$declare q jsonb;r jsonb;original jsonb;begin
 select command into q from successor_commands where label='first';select receipt into original from successor_vectors where label='first_granted';
 execute 'set local role authenticated';r:=public.publish_operations_whole_scope_granted_product_v2(q);
 perform pg_temp.successor_deny(q||jsonb_build_object('reason','Different same-key command'),'23505','granted_publication_idempotency_conflict');
 perform pg_temp.successor_deny(q||jsonb_build_object('idempotency_key','native-grant-old-null-snapshot'),'23505','granted_publication_idempotency_conflict');
 perform pg_temp.successor_deny(q||jsonb_build_object('idempotency_key','successor-stale-publication'),'PT409','granted_publication_revision_changed');
 perform pg_temp.successor_deny(q||jsonb_build_object('expected_publication_revision',2,'expected_grant_revision',2,'idempotency_key','successor-stale-grant'),'PT409','granted_revision_changed');
 execute 'reset role';perform pg_temp.successor_assert(r=original||jsonb_build_object('outcome','replayed','historical_only',true));
end;$$;
-- A genuine unchanged v1 NULL publication advances the SAME physical head to3.
do $$declare req jsonb;r jsonb;begin select read_request into req from operations_whole_scope_product_native.known_fixture where slot='only';
 execute 'set local role authenticated';r:=public.publish_operations_whole_scope_product_v1(req-'organization_id'-'schema_version'||jsonb_build_object('schema_version','operations-whole-scope-product-publication-command.v1','expected_publication_revision',2,'idempotency_key','successor-later-legacy-null','reason','Keep one economic stream across schemas'));execute 'reset role';
 perform pg_temp.successor_assert(r->'publication_revision'='3'::jsonb and (select count(*) from operations_whole_scope_publication_private.heads)=1 and (select publication_revision from operations_whole_scope_publication_private.heads)=3 and (select count(*) from operations_whole_scope_publication_private.publications where export_grant is null)=2);
end;$$;
-- A genuine current composition advance retains existing monetary inputs but needs a NEW grant.
create temp table successor_current_composition(document jsonb not null);
do $$declare q jsonb;r jsonb;first jsonb;req jsonb;begin
 select compose_command||jsonb_build_object('expected_composition_revision',1,'idempotency_key','successor-real-composition-advance','reason','Actual unchanged baseline selection, new sharing revision') into q from operations_whole_scope_product_native.known_fixture where slot='only';
 execute 'set local role authenticated';r:=public.compose_operations_scope_obligations_v1(q);execute 'reset role';
 perform pg_temp.successor_assert(r->'composition_revision'='2'::jsonb);
 insert into successor_current_composition values(r);
 select command into first from successor_commands where label='first';
 req:=first||jsonb_build_object('expected_publication_revision',3,'expected_composition_revision',2,'expected_composition_fingerprint',r->'fingerprint','idempotency_key','successor-old-grant-new-composition');
 execute 'set local role authenticated';perform pg_temp.successor_deny(req,'PT409','granted_membership_changed');execute 'reset role';
 perform pg_temp.successor_assert((select publication_revision from operations_whole_scope_publication_private.heads)=3 and (select count(*) from operations_whole_scope_publication_private.grant_bindings)=1);
end;$$;
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
do $$declare q jsonb;r jsonb;c jsonb;begin select document into c from successor_current_composition;
 select command||jsonb_build_object('expected_grant_revision',1,'expected_composition_revision',2,'expected_composition_fingerprint',c->'fingerprint','enabled',true,'idempotency_key','successor-current-composition-grant','reason','Actual current complete membership sharing successor') into q from operations_whole_scope_grant_native.commands where label='known';
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(q);execute 'reset role';perform pg_temp.successor_assert(r->'revision'='2'::jsonb and r->'enabled'='true'::jsonb);
end;$$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare q jsonb;r jsonb;c jsonb;p operations_whole_scope_publication_private.publications%rowtype;begin
 select document into c from successor_current_composition;select command||jsonb_build_object('expected_publication_revision',3,'expected_grant_revision',2,'expected_composition_revision',2,'expected_composition_fingerprint',c->'fingerprint','idempotency_key','successor-new-current-granted','reason','Actual fresh capture for current grant and composition') into q from successor_commands where label='first';
 execute 'set local role authenticated';r:=public.publish_operations_whole_scope_granted_product_v2(q);execute 'reset role';
 select * into p from operations_whole_scope_publication_private.publications where publication_id=(r->>'publication_id')::uuid;
 perform pg_temp.successor_assert(r->'publication_revision'='4'::jsonb and r->'grant_revision'='2'::jsonb and p.destination_raw_body is null and (select count(*) from operations_whole_scope_publication_private.heads)=1);
 insert into successor_vectors values('second_granted',p.document,r,p.source_publication_fingerprint,encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-granted-product-publication-command-v2',q)),'UTF8')),'hex'));
 insert into successor_saved_history select to_jsonb(x),to_jsonb(b),to_jsonb(z) from operations_whole_scope_publication_private.publications x join operations_whole_scope_publication_private.grant_bindings b using(publication_id) join operations_whole_scope_publication_private.receipts z using(publication_id) where x.publication_id=p.publication_id;
end;$$;
set constraints all immediate;
set constraints all deferred;
-- Genuine revoke via the original grant API; historical replay cannot reactivate it.
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
do $$declare q jsonb;r jsonb;c jsonb;begin select document into c from successor_current_composition;select command||jsonb_build_object('expected_grant_revision',2,'expected_composition_revision',2,'expected_composition_fingerprint',c->'fingerprint','enabled',false,'idempotency_key','successor-genuine-grant-revoke','reason','Actual explicit revoke before historical replay') into q from operations_whole_scope_grant_native.commands where label='known';execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(q);execute 'reset role';perform pg_temp.successor_assert(r->'revision'='3'::jsonb and r->'enabled'='false'::jsonb);end;$$;
update operations_whole_scope_export_grant_private.partners set enabled=false where partner_version='16161616-1616-4616-8616-161616161616';
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$declare q jsonb;r jsonb;original jsonb;begin select command into q from successor_commands where label='first';select receipt into original from successor_vectors where label='first_granted';
 execute 'set local role authenticated';r:=public.publish_operations_whole_scope_granted_product_v2(q);execute 'reset role';
 perform pg_temp.successor_assert(r=original||jsonb_build_object('outcome','replayed','historical_only',true) and (select publication_revision from operations_whole_scope_publication_private.heads)=4 and (select revision from operations_whole_scope_export_grant_private.heads)=3 and (select count(*) from operations_whole_scope_publication_private.grant_bindings)=2);
end;$$;
-- Historical facts disclose only under current publisher AND saved issuer authority.
delete from public.user_roles where user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and role='admin';
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501','current_grant_issuer_required');execute 'reset role';end;$$;
insert into public.user_roles(user_id,organization_id,role) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','admin');
delete from public.user_roles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='admin';
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501');execute 'reset role';end;$$;
insert into public.user_roles(user_id,organization_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin');
update public.operations_scope_invoice_kernel_read_gates set enabled=false where organization_id='11111111-1111-4111-8111-111111111111';
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501');execute 'reset role';end;$$;
update public.operations_scope_invoice_kernel_read_gates set enabled=true where organization_id='11111111-1111-4111-8111-111111111111';
-- Every writer gate still controls historical disclosure.
update operations_whole_scope_export_grant_private.gates set enabled=false;
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501','grant_write_gate_disabled');execute 'reset role';end;$$;
update operations_whole_scope_export_grant_private.gates set enabled=true;
update operations_whole_scope_publication_private.gates set enabled=false;
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501','product_publication_gate_disabled');execute 'reset role';end;$$;
update operations_whole_scope_publication_private.gates set enabled=true;
update operations_whole_scope_publication_private.granted_gates set enabled=false;
do $$declare q jsonb;begin select command into q from successor_commands where label='first';execute 'set local role authenticated';perform pg_temp.successor_deny(q,'42501','granted_publication_gate_disabled');execute 'reset role';end;$$;
update operations_whole_scope_publication_private.granted_gates set enabled=true;
-- Every field of the original immutable publication/binding/receipt survives later heads/revoke.
do $$begin perform pg_temp.successor_assert((select count(*) from successor_saved_history)=2 and 2=(select count(*) from successor_saved_history h join operations_whole_scope_publication_private.publications p on to_jsonb(p)=h.publication_row join operations_whole_scope_publication_private.grant_bindings b on to_jsonb(b)=h.binding_row join operations_whole_scope_publication_private.receipts r on to_jsonb(r)=h.receipt_row));end;$$;
-- No exported raw body, route, proof, nonce or Finance record has been produced.
do $$begin perform pg_temp.successor_assert((select count(*) from operations_whole_scope_publication_private.publications)=4 and (select count(*) from operations_whole_scope_publication_private.receipts)=4 and (select count(*) from operations_whole_scope_publication_private.grant_bindings)=2 and not exists(select 1 from operations_whole_scope_publication_private.publications where destination_raw_body is not null));end;$$;
select jsonb_agg(jsonb_build_object('label',v.label,'document',v.document,'receipt',v.receipt,'publication_fingerprint',v.publication_fingerprint,'command_fingerprint',v.command_fingerprint,'grant_event',e.document,'grant_raw_body',e.raw_body,'grant_fingerprint',e.fingerprint) order by v.label) as successor_private_vectors from successor_vectors v join operations_whole_scope_export_grant_private.events e on e.event_id=(v.document->'export_grant'->>'event_id')::uuid;
rollback;
