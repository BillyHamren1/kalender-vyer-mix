
create table public.staff_locations (
  staff_id text primary key references public.staff_members(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  speed double precision,
  updated_at timestamptz not null default now(),
  organization_id uuid not null default get_user_organization_id(auth.uid())
);

alter table public.staff_locations enable row level security;

create policy "org_filter_staff_locations"
  on public.staff_locations
  for all
  to public
  using (organization_id = get_user_organization_id(auth.uid()))
  with check (organization_id = get_user_organization_id(auth.uid()));
