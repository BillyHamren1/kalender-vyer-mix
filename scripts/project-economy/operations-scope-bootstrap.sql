-- Isolated fixture additions ONLY. Actual Operations columns from exact main
-- f0565e76e071bc50011ae33535c2b97022e46293 and actual relationship migrations.
-- The shared review bootstrap already defines projects/auth/profiles/roles.
alter table public.projects add column booking_id text;
create table public.bookings(id text primary key,organization_id uuid not null,large_project_id uuid);
create table public.large_projects(id uuid primary key,organization_id uuid not null,primary_booking_id text,deleted_at timestamptz);
create table public.packing_projects(id uuid primary key,organization_id uuid not null,booking_id text,large_project_id uuid,status text not null);
create table public.large_project_bookings(id uuid primary key,organization_id uuid not null,large_project_id uuid not null,booking_id text not null);
create table public.packing_project_bookings(id uuid primary key,organization_id uuid not null,packing_id uuid not null,booking_id text not null,unique(packing_id,booking_id));
insert into public.bookings values('Legacy-Order-42','11111111-1111-4111-8111-111111111111',null);
update public.projects set booking_id='Legacy-Order-42' where organization_id='11111111-1111-4111-8111-111111111111';
insert into public.large_projects values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Legacy-Order-42',null);
insert into public.packing_projects values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','Legacy-Order-42','cccccccc-cccc-4ccc-8ccc-cccccccccccc','delivered');
insert into public.large_project_bookings values('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Legacy-Order-42');
insert into public.packing_project_bookings values('12121212-1212-4212-8212-121212121212','11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Legacy-Order-42');
