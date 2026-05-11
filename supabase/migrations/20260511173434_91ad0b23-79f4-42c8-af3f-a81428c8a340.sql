-- Submissions written by mobile Time app — separate from legacy day_attestations.
create table if not exists public.staff_day_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id text not null,
  date date not null,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected','correction_requested','withdrawn')),
  requested_start_at timestamptz,
  requested_end_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  comment text,
  engine_version text,
  source_summary_json jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, date)
);

create index if not exists idx_staff_day_submissions_org_date
  on public.staff_day_submissions (organization_id, date desc);

create index if not exists idx_staff_day_submissions_staff_date
  on public.staff_day_submissions (staff_id, date desc);

alter table public.staff_day_submissions enable row level security;

-- Read within own organization (mirrors staff_day_report_cache policy)
create policy "Submissions readable within organization"
  on public.staff_day_submissions
  for select
  using (organization_id = public.get_user_organization_id(auth.uid()));

-- Writes go exclusively through edge functions running with service role.
-- (No insert/update/delete policy for normal users.)

-- updated_at trigger
create or replace function public.tg_staff_day_submissions_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_staff_day_submissions_updated_at on public.staff_day_submissions;
create trigger trg_staff_day_submissions_updated_at
  before update on public.staff_day_submissions
  for each row
  execute function public.tg_staff_day_submissions_set_updated_at();