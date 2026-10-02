-- NEW disposable actual PostgREST connection role; no public test RPCs.
begin;
do $$begin
 if current_database()<>'operations_remaining_six_read_runtime'
 or current_setting('test.remaining_six_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or session_user<>'postgres'
 or exists(select 1 from pg_roles where rolname='remaining_six_http_authenticator')
 or not exists(select 1 from public.operations_project_scope_heads where organization_id='00000000-0000-4000-8000-000000000001' and root_id='00000000-0000-4000-8000-000000000117')
 then raise exception 'remaining_six_http_fresh_guard' using errcode='42501';end if;
end$$;
create role remaining_six_http_authenticator login noinherit nosuperuser nocreatedb nocreaterole password 'synthetic-remaining-six-only';
grant anon,authenticated,service_role to remaining_six_http_authenticator;
grant connect on database operations_remaining_six_read_runtime to remaining_six_http_authenticator;
commit;
