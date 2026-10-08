-- Disposable PostgREST authenticator only, after canonical roles exist.
do $$begin if current_database()<>'eventflow_project_evidence_http_runtime' then raise exception 'wrong_isolated_database' using errcode='42501';end if;end;$$;
create role authenticator login noinherit password 'disposable-authenticator-only';
grant anon,authenticated,service_role to authenticator;
grant usage on schema public to anon,authenticated,service_role;
