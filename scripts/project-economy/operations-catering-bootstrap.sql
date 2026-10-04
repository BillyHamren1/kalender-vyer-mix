-- ISOLATED schema-shaped fixture: actual current Operations project tenant/deletion columns.
create table if not exists public.projects(id uuid primary key,organization_id uuid not null,deleted_at timestamptz);
-- Service role cannot directly mutate the legacy project table.
grant select on public.projects to service_role;
