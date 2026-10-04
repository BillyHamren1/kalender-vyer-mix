-- Isolated schema subset from public.projects: actual tenant/deletion gate, not a fake RPC.
-- Applied after operations-postgres-bootstrap.sql and before the new receiver migration.
create table if not exists public.projects(id uuid primary key,organization_id uuid not null,deleted_at timestamptz);
