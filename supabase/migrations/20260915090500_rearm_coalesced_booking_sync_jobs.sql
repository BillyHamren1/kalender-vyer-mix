create or replace function public.enqueue_booking_sync_job(
  p_booking_id text,
  p_organization_id text,
  p_event_type text default 'unknown',
  p_priority integer default 0
)
returns table(
  job_id uuid,
  job_status text,
  job_event_type text,
  job_priority smallint,
  coalesced boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _job public.booking_sync_jobs%rowtype;
  _event_type text := replace(lower(trim(coalesce(p_event_type, 'unknown'))), '_', '.');
  _priority smallint := least(100, greatest(0, coalesce(p_priority, 0)))::smallint;
begin
  if nullif(trim(p_booking_id), '') is null then
    raise exception 'booking_id is required';
  end if;
  if nullif(trim(p_organization_id), '') is null then
    raise exception 'organization_id is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id || E'\\x1f' || p_booking_id, 0)
  );

  select j.*
    into _job
  from public.booking_sync_jobs j
  where j.organization_id = p_organization_id
    and j.booking_id = p_booking_id
    and j.status in ('pending', 'processing', 'retryable')
  order by j.priority desc, j.received_at asc
  limit 1
  for update;

  if found then
    update public.booking_sync_jobs j
    set priority = greatest(j.priority, _priority),
        event_type = case
          when _priority > j.priority or _priority = 100 then _event_type
          else j.event_type
        end,
        -- A fresh webhook is a fresh desired snapshot. A previously exhausted
        -- retryable job must be re-armed immediately instead of swallowing it.
        status = case when j.status = 'retryable' then 'pending' else j.status end,
        attempts = case when j.status = 'retryable' then 0 else j.attempts end,
        received_at = case
          when j.status in ('processing', 'retryable') then now()
          else j.received_at
        end,
        next_attempt_at = case
          when j.status in ('processing', 'retryable') then now()
          else j.next_attempt_at
        end,
        processed_at = case when j.status = 'retryable' then null else j.processed_at end,
        error_message = case when j.status = 'retryable' then null else j.error_message end
    where j.id = _job.id
    returning j.* into _job;

    return query select _job.id, _job.status, _job.event_type,
                        _job.priority, true;
    return;
  end if;

  insert into public.booking_sync_jobs (
    booking_id, organization_id, event_type, priority, status
  ) values (
    p_booking_id, p_organization_id, _event_type, _priority, 'pending'
  )
  returning * into _job;

  return query select _job.id, _job.status, _job.event_type,
                      _job.priority, false;
end;
$$;

comment on function public.enqueue_booking_sync_job(text,text,text,integer) is
  'Atomically enqueues/coalesces Booking sync; fresh webhooks immediately re-arm exhausted retryable jobs and mark in-flight jobs for one follow-up pass.';
