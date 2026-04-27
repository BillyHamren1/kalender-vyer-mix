
-- ─────────────────────────────────────────────────────────────────────────
-- 1) BACKFILL: Speglar staff_assignments (team-pool per dag) till
--    booking_staff_assignments (jobb-tilldelningar) för varje booking
--    som teamet har en calendar_event på den dagen.
--
--    Detta återställer alla jobb som "försvunnit" från mobilen efter
--    att den ursprungliga auto-spegling slutade triggas från frontend.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.booking_staff_assignments
  (booking_id, staff_id, team_id, assignment_date, role, organization_id)
select
  tb.booking_id,
  tp.staff_id,
  tp.team_id,
  tp.assignment_date,
  'field' as role,
  b.organization_id
from public.staff_assignments tp
join (
  select distinct
    ce.booking_id,
    ce.resource_id as team_id,
    (ce.start_time at time zone 'UTC')::date as ev_date,
    ce.organization_id
  from public.calendar_events ce
  where ce.booking_id is not null
) tb
  on tb.team_id = tp.team_id
 and tb.ev_date  = tp.assignment_date
join public.bookings b
  on b.id = tb.booking_id
left join public.booking_staff_assignments existing
  on existing.staff_id = tp.staff_id
 and existing.booking_id = tb.booking_id
 and existing.assignment_date = tp.assignment_date
where existing.id is null
  and b.organization_id = tb.organization_id;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) TRIGGER: håller speglingen levande framöver. När en rad läggs in i
--    staff_assignments (person läggs i team för en dag) skapas en
--    motsvarande BSA-rad för varje booking som teamet har på den dagen.
--    När raden tas bort, tas BSA-raderna bort.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.sync_team_pool_to_booking_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if (tg_op = 'INSERT') then
    -- Skapa BSA för varje booking som teamet har på den här dagen.
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
      and (ce.start_time at time zone 'UTC')::date = new.assignment_date
    on conflict (booking_id, staff_id, assignment_date) do nothing;

    return new;

  elsif (tg_op = 'DELETE') then
    -- När personen tas ur teamet för dagen, ta bort BSA för precis
    -- de bokningar som tillhörde det teamet på den dagen.
    delete from public.booking_staff_assignments bsa
    using public.calendar_events ce
    where bsa.staff_id = old.staff_id
      and bsa.assignment_date = old.assignment_date
      and bsa.team_id = old.team_id
      and bsa.booking_id = ce.booking_id
      and ce.resource_id = old.team_id
      and (ce.start_time at time zone 'UTC')::date = old.assignment_date;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_team_pool_to_bsa on public.staff_assignments;

create trigger trg_sync_team_pool_to_bsa
after insert or delete on public.staff_assignments
for each row execute function public.sync_team_pool_to_booking_assignments();
