-- ISOLATED PostgreSQL fixture ONLY: exact columns used from current Operations
-- generated schema, not the whole product schema. auth.uid models PostgREST's
-- verified JWT claim access; it is not a production replacement for Supabase Auth.
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
create table public.profiles(id uuid primary key default gen_random_uuid(),user_id uuid not null unique,organization_id uuid);
create type public.app_role as enum ('admin','forsaljning','projekt','lager');
create table public.user_roles(id uuid primary key default gen_random_uuid(),user_id uuid not null,organization_id uuid not null,role public.app_role not null);
create table public.projects(id uuid primary key,organization_id uuid not null,deleted_at timestamptz);
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), -- org admin
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), -- project user
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), -- unrelated org admin
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'); -- staff without system role
insert into public.profiles(user_id,organization_id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','88888888-8888-4888-8888-888888888888'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111');
insert into public.user_roles(user_id,organization_id,role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','projekt'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','88888888-8888-4888-8888-888888888888','admin');
insert into public.projects(id,organization_id,deleted_at) values
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',null),
 ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',null),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','88888888-8888-4888-8888-888888888888',null);
