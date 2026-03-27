
create table public.establishment_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  title text not null,
  category text not null default 'installation',
  start_date date not null,
  end_date date not null,
  completed boolean default false,
  sort_order int default 0,
  notes text,
  assigned_to text references public.staff_members(id),
  source text default 'manual',
  source_product_id uuid references public.booking_products(id) on delete set null,
  organization_id uuid not null default (public.get_user_organization_id(auth.uid())) references public.organizations(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.establishment_tasks enable row level security;

create policy "Users can view establishment tasks in their org"
  on public.establishment_tasks for select to authenticated
  using (organization_id = public.get_user_organization_id(auth.uid()));

create policy "Users can insert establishment tasks in their org"
  on public.establishment_tasks for insert to authenticated
  with check (organization_id = public.get_user_organization_id(auth.uid()));

create policy "Users can update establishment tasks in their org"
  on public.establishment_tasks for update to authenticated
  using (organization_id = public.get_user_organization_id(auth.uid()));

create policy "Users can delete establishment tasks in their org"
  on public.establishment_tasks for delete to authenticated
  using (organization_id = public.get_user_organization_id(auth.uid()));

create trigger set_establishment_tasks_org_id
  before insert on public.establishment_tasks
  for each row execute function public.set_organization_id();

create trigger update_establishment_tasks_updated_at
  before update on public.establishment_tasks
  for each row execute function public.update_updated_at_column();

create index idx_establishment_tasks_booking_id on public.establishment_tasks(booking_id);
