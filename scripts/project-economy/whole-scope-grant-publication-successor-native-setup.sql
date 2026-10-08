-- TEST ONLY fresh actual APIs. No grant/event/receipt/publication positive row seeds.
begin isolation level repeatable read;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime' or current_user<>'postgres'
 or current_setting('test.whole_scope_granted_publication_isolated',true) is distinct from 'synthetic-disposable'
 or to_regnamespace('operations_whole_scope_granted_product_native') is not null
 or (select count(*) from operations_whole_scope_publication_private.publications)<>1
 or exists(select 1 from operations_whole_scope_publication_private.grant_bindings)
 or exists(select 1 from operations_whole_scope_export_grant_private.events)
 or (select count(*) from operations_whole_scope_grant_native.commands)<>2
 then raise exception 'fresh_successor_native_setup_required' using errcode='22023';end if;
end;$$;
create schema operations_whole_scope_granted_product_native;
revoke all on schema operations_whole_scope_granted_product_native from public,anon,authenticated,service_role;
create table operations_whole_scope_granted_product_native.original_null(publication jsonb not null,receipt jsonb not null);
revoke all on operations_whole_scope_granted_product_native.original_null from public,anon,authenticated,service_role;
insert into operations_whole_scope_granted_product_native.original_null select to_jsonb(p),to_jsonb(r) from operations_whole_scope_publication_private.publications p join operations_whole_scope_publication_private.receipts r using(publication_id);
-- DD is an actual isolated Auth/profile identity from the canonical bootstrap;
-- assign its genuine local admin role for the separate saved grant issuer.
insert into public.user_roles(user_id,organization_id,role) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','admin');
insert into operations_whole_scope_publication_private.granted_gates values('11111111-1111-4111-8111-111111111111','90909090-9090-4909-8909-909090909090',true);
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
do $$declare q jsonb;r jsonb;begin
 select command||jsonb_build_object('enabled',true,'idempotency_key','successor-native-initial-real-grant','reason','Actual independently authenticated saved issuer') into q from operations_whole_scope_grant_native.commands where label='known';
 execute 'set local role authenticated';r:=public.write_operations_whole_scope_product_export_grant_v1(q);execute 'reset role';
 if r->>'outcome'<>'accepted' or r->'enabled'<>'true'::jsonb or r->'revision'<>'1'::jsonb then raise exception 'actual_successor_grant_required' using errcode='22023';end if;
end;$$;
commit;
