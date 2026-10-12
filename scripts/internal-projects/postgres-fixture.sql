-- Disposable test fixture only; auth identity is synthetic, not hosted Supabase.
create role anon;create role authenticated;create role service_role;create role restricted;
create schema auth;grant usage on schema auth to authenticated,restricted;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function get_user_organization_id(uuid) returns uuid language sql as $$select $1$$;
create table projects(id uuid primary key,organization_id uuid,name text,project_leader text,booking_id text,is_internal boolean default false,location_id uuid,status text,rigdaydate date,rigdowndate date);
create table bookings(id text primary key,organization_id uuid,client text,status text,is_internal boolean,internal_type text,booking_number text,eventdate date,assigned_to_project boolean);
create table project_billing(id uuid primary key,project_id text,project_type text,organization_id uuid);
create table project_tasks(id uuid primary key default gen_random_uuid(),project_id uuid references projects(id),organization_id uuid,title text,deadline date,sort_order integer,is_info_only boolean,completed boolean);
create function ensure_internal_lager_booking(uuid) returns text language sql as $$select null::text$$;
alter table projects enable row level security;alter table project_tasks enable row level security;
create policy org_projects on projects for all to authenticated using(organization_id=auth.uid()) with check(organization_id=auth.uid());
create policy org_tasks on project_tasks for all to authenticated using(organization_id=auth.uid()) with check(organization_id=auth.uid());
grant select,insert,update,delete on projects,project_tasks to authenticated;grant select on project_billing,bookings to authenticated;

grant insert,update on project_billing to authenticated;
