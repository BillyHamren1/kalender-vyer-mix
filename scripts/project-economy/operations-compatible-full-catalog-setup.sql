-- Committed isolated metadata-only controls. No product monetary authority.
begin;
do $$begin
 if current_database()<>'operations_compatible_install_runtime' or current_user<>'postgres' or session_user<>'postgres'
 or current_setting('eventflow.compatible_install_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.compatible_full_catalog_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('server_version_num')<>'150019' or not (select rolsuper from pg_roles where rolname=current_user)
 or to_regnamespace('operations_full_catalog_fixture') is not null
 or not exists(select 1 from pg_namespace where nspname='operations_compatible_install_native')
 then raise exception using errcode='22023',message='full_catalog_setup_guard';end if;
end$$;
create schema operations_full_catalog_fixture authorization postgres;
revoke all on schema operations_full_catalog_fixture from public,anon,authenticated,service_role;
create view operations_full_catalog_fixture.metadata_source_a as select 1::integer as value;
create view operations_full_catalog_fixture.metadata_source_b as select 2::integer as value;
create view operations_full_catalog_fixture.metadata_view as select value from operations_full_catalog_fixture.metadata_source_a;
create table operations_full_catalog_fixture.metadata_storage(value text);
create domain operations_full_catalog_fixture.metadata_domain as integer;
create type operations_full_catalog_fixture.metadata_range as range(subtype=integer,subtype_diff=pg_catalog.int4range_subdiff);
create table operations_full_catalog_fixture.metadata_identity(id integer primary key);
create unique index metadata_identity_alternate on operations_full_catalog_fixture.metadata_identity(id);
alter table operations_full_catalog_fixture.metadata_identity replica identity using index metadata_identity_pkey;
create function operations_full_catalog_fixture.metadata_sql_standard() returns integer language sql set search_path='' begin atomic select 1;end;
revoke all on function operations_full_catalog_fixture.metadata_sql_standard() from public,anon,authenticated,service_role;
create procedure operations_full_catalog_fixture.metadata_procedure() language sql set search_path='' as $$select 1;$$;
revoke all on procedure operations_full_catalog_fixture.metadata_procedure() from public,anon,authenticated,service_role;
create role full_catalog_fixture_owner nologin noinherit;
commit;
