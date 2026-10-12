-- Isolated compatibility fixture: columns/relations used by the actual current
-- internal classification migration. No replacement classification logic.
alter table public.projects add column is_internal boolean not null default false,
 add column booking_id text, add column status text not null default 'planning';
create table public.bookings(id text primary key,organization_id uuid,is_internal boolean,internal_type text);
create table public.project_billing(project_id text,organization_id uuid,project_type text);
create table public.project_tasks(project_id uuid,completed boolean,is_info_only boolean);
create function public.ensure_internal_lager_booking(uuid) returns text language sql as $$ select null::text $$;
