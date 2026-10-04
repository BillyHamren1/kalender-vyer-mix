\set ON_ERROR_STOP on
-- TEST ONLY: run AFTER the unchanged private genuine-role fixture rolls back.
begin;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime'
 or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or (select count(*) from operations_whole_scope_product_native.known_fixture)<>1
 or (select count(*) from operations_whole_scope_product_native.unknown_fixture)<>1
 or exists(select 1 from operations_whole_scope_publication_private.publications)
 or exists(select 1 from operations_whole_scope_publication_private.receipts)
 or exists(select 1 from operations_whole_scope_publication_private.heads)
 or exists(select 1 from operations_whole_scope_publication_private.gates)
 then raise exception 'fresh_product_cases_required' using errcode='22023';end if;
end;$$;
create table operations_whole_scope_product_native.controls(slot text primary key check(slot='only'),admin_role jsonb not null);
insert into operations_whole_scope_product_native.controls select 'only',to_jsonb(r) from public.user_roles r where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and organization_id='11111111-1111-4111-8111-111111111111' and role='admin';
revoke all on operations_whole_scope_product_native.controls from public,anon,authenticated,service_role;
create table operations_whole_scope_product_native.commands(label text primary key,command jsonb not null);
insert into operations_whole_scope_product_native.commands
 select 'known',read_request-'schema_version'-'organization_id'||jsonb_build_object('schema_version','operations-whole-scope-product-publication-command.v1','expected_publication_revision',0,'idempotency_key','product-native-known-0','reason','Actual immutable source capture native isolation') from operations_whole_scope_product_native.known_fixture
 union all
 select 'unknown',read_request-'schema_version'-'organization_id'||jsonb_build_object('schema_version','operations-whole-scope-product-publication-command.v1','expected_publication_revision',0,'idempotency_key','product-native-unknown-0','reason','Actual nullable manual source capture native isolation') from operations_whole_scope_product_native.unknown_fixture;
revoke all on operations_whole_scope_product_native.commands from public,anon,authenticated,service_role;
-- Enables only this disposable producer fixture, through genuine configuration
-- column rights. The gate remains false in all product DDL/defaults.
set local role service_role;
insert into operations_whole_scope_publication_private.gates(organization_id,economic_scope_id,enabled) values
 ('11111111-1111-4111-8111-111111111111','90909090-9090-4909-8909-909090909090',true),
 ('11111111-1111-4111-8111-111111111111','67676767-6767-4676-8676-676767676767',true);
reset role;
-- Real absent-join graph contender: booking/project exist, economic root link
-- does not. Only the exact legacy function creates that link in the case.
insert into public.bookings(id,organization_id,large_project_id) values('product-native-phantom-order','11111111-1111-4111-8111-111111111111',null);
insert into public.projects(id,organization_id,deleted_at,booking_id) values('74747474-7474-4747-8747-747474747474','11111111-1111-4111-8111-111111111111',null,'product-native-phantom-order');
commit;
