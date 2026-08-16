-- Supabase-liknande bootstrap för lokal isolerad testdatabas
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser login; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin login; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_storage_admin') then create role supabase_storage_admin login; end if;
  if not exists (select 1 from pg_roles where rolname='dashboard_user') then create role dashboard_user nologin; end if;
  if not exists (select 1 from pg_roles where rolname='pgbouncer') then create role pgbouncer nologin; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists graphql_public;
create schema if not exists realtime;
create schema if not exists supabase_functions;
create schema if not exists cron;
create schema if not exists net;
create schema if not exists vault;

grant usage on schema auth, storage, extensions to anon, authenticated, service_role;

create table if not exists auth.users(
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  deleted_at timestamptz
);
create table if not exists auth.identities(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text, identity_data jsonb, created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- storage-shim
create table if not exists storage.buckets(id text primary key, name text, public boolean default false, created_at timestamptz default now());
create table if not exists storage.objects(
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;

-- cron/net/vault-shims (lokal testmiljö saknar pg_cron/pg_net)
create table if not exists cron.job(jobid bigserial primary key, schedule text, command text, jobname text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$ insert into cron.job(schedule, command, jobname) values ($2,$3,$1) returning jobid $$;
create or replace function cron.schedule(schedule text, command text) returns bigint
language sql as $$ insert into cron.job(schedule, command) values ($1,$2) returning jobid $$;
create or replace function cron.unschedule(job_name text) returns boolean
language sql as $$ delete from cron.job where jobname = $1; select true $$;
create or replace function cron.unschedule(job_id bigint) returns boolean
language sql as $$ delete from cron.job where jobid = $1; select true $$;
create table if not exists net._http_response(id bigserial primary key, status_code int, content text, created timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 0::bigint $$;
create or replace function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 0::bigint $$;
create table if not exists vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, secret text, created_at timestamptz default now());
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;

-- supabase_realtime publication
do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
