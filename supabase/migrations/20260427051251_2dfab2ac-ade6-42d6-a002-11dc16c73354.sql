
-- Fix: large_projects.{start_date,event_date,end_date} är text[], inte date[].
-- Casta korrekt och hantera null arrays.

create or replace function public.sync_team_pool_to_booking_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_text text;
begin
  if (tg_op = 'INSERT') then
    v_assignment_text := new.assignment_date::text;

    -- (a) Vanliga bokningar via calendar_events för teamet på dagen.
    insert into public.booking_staff_assignments
      (booking_id, staff_id, team_id, assignment_date, role, organization_id)
    select distinct
      ce.booking_id,
      new.staff_id,
      new.team_id,
      new.assignment_date,
      'field',
      b.organization_id
    from public.calendar_events ce
    join public.bookings b on b.id = ce.booking_id
    where ce.resource_id = new.team_id
      and ce.booking_id is not null
      and coalesce(ce.source_date, (ce.start_time at time zone 'Europe/Stockholm')::date)
          = new.assignment_date
    on conflict (booking_id, staff_id, assignment_date) do nothing;

    -- (b) Stora projekt: dagen finns i någon av text[]-arraysen.
    insert into public.booking_staff_assignments
      (booking_id, staff_id, team_id, assignment_date, role, organization_id)
    select distinct
      lpb.booking_id,
      new.staff_id,
      new.team_id,
      new.assignment_date,
      'field',
      b.organization_id
    from public.large_projects lp
    join public.large_project_bookings lpb on lpb.large_project_id = lp.id
    join public.bookings b on b.id = lpb.booking_id
    where lp.deleted_at is null
      and (
        v_assignment_text = any(coalesce(lp.start_date, '{}'::text[]))
        or v_assignment_text = any(coalesce(lp.event_date, '{}'::text[]))
        or v_assignment_text = any(coalesce(lp.end_date,   '{}'::text[]))
      )
    on conflict (booking_id, staff_id, assignment_date) do nothing;

    return new;

  elsif (tg_op = 'DELETE') then
    v_assignment_text := old.assignment_date::text;

    delete from public.booking_staff_assignments bsa
    where bsa.staff_id = old.staff_id
      and bsa.team_id  = old.team_id
      and bsa.assignment_date = old.assignment_date
      and (
        exists (
          select 1
          from public.calendar_events ce
          where ce.booking_id = bsa.booking_id
            and ce.resource_id = old.team_id
            and coalesce(ce.source_date, (ce.start_time at time zone 'Europe/Stockholm')::date)
                = old.assignment_date
        )
        or exists (
          select 1
          from public.large_project_bookings lpb
          join public.large_projects lp on lp.id = lpb.large_project_id
          where lpb.booking_id = bsa.booking_id
            and lp.deleted_at is null
            and (
              v_assignment_text = any(coalesce(lp.start_date, '{}'::text[]))
              or v_assignment_text = any(coalesce(lp.event_date, '{}'::text[]))
              or v_assignment_text = any(coalesce(lp.end_date,   '{}'::text[]))
            )
        )
      );

    return old;
  end if;

  return null;
end;
$$;

-- Backfill stora projekt nu med rätt typer.
insert into public.booking_staff_assignments
  (booking_id, staff_id, team_id, assignment_date, role, organization_id)
select distinct
  lpb.booking_id,
  sa.staff_id,
  sa.team_id,
  sa.assignment_date,
  'field',
  b.organization_id
from public.staff_assignments sa
join public.large_projects lp
  on lp.deleted_at is null
 and (
    sa.assignment_date::text = any(coalesce(lp.start_date, '{}'::text[]))
    or sa.assignment_date::text = any(coalesce(lp.event_date, '{}'::text[]))
    or sa.assignment_date::text = any(coalesce(lp.end_date,   '{}'::text[]))
 )
join public.large_project_bookings lpb on lpb.large_project_id = lp.id
join public.bookings b on b.id = lpb.booking_id
on conflict (booking_id, staff_id, assignment_date) do nothing;
