-- The Operations directory owns credentials. These queries are available only
-- to its server role and match identifiers literally, including % and _.
create or replace function public.time_find_staff_credentials_v1(p_identifier text)
returns table (
  "staffId" text, "organizationId" uuid, "displayName" text,
  email text, active boolean, "passwordHash" text
)
language sql stable security invoker set search_path = ''
as $$
  select s.id, s.organization_id, s.name, s.email, s.is_active, a.password_hash
  from public.staff_accounts a
  join public.staff_members s on s.id = a.staff_id and s.organization_id = a.organization_id
  join public.organizations o on o.id = s.organization_id
  where lower(a.username) = lower(p_identifier)
     or (strpos(p_identifier, '@') > 0 and lower(s.email) = lower(p_identifier))
  limit 2
$$;

create or replace function public.time_find_active_staff_v1(p_organization_id uuid, p_staff_id text)
returns table ("staffId" text, "organizationId" uuid, "displayName" text, email text)
language sql stable security invoker set search_path = ''
as $$
  select s.id, s.organization_id, s.name, s.email
  from public.staff_members s
  join public.organizations o on o.id = s.organization_id
  where s.id = p_staff_id and s.organization_id = p_organization_id and s.is_active
    and (
      select count(*) from public.staff_accounts a
      where a.staff_id = s.id and a.organization_id = s.organization_id
    ) = 1
$$;

revoke all on function public.time_find_staff_credentials_v1(text) from public, anon, authenticated;
revoke all on function public.time_find_active_staff_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.time_find_staff_credentials_v1(text) to service_role;
grant execute on function public.time_find_active_staff_v1(uuid, text) to service_role;
