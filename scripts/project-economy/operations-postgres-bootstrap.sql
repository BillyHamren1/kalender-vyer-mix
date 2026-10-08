-- Isolated empty PostgreSQL fixture ONLY. Never run on hosted production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
