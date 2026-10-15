-- Operations owns the display state. Web and signed mobile reads consume this
-- invoker view, retaining table RLS and same-organization booking joins.
CREATE OR REPLACE VIEW public.operations_project_states
WITH (security_invoker = true) AS
WITH phases AS (
  SELECT 'small'::text AS project_kind, j.id AS project_id, j.organization_id,
    j.status::text AS stored_status, b.rigdaydate::date AS rig_date,
    b.eventdate::date AS event_date, b.rigdowndate::date AS derig_date,
    false AS is_internal
  FROM public.jobs j
  LEFT JOIN public.bookings b ON b.id = j.booking_id AND b.organization_id = j.organization_id
  WHERE j.deleted_at IS NULL
  UNION ALL
  SELECT 'medium', p.id, p.organization_id, p.status::text,
    coalesce(p.rigdaydate::date, b.rigdaydate::date), coalesce(p.eventdate::date, b.eventdate::date),
    coalesce(p.rigdowndate::date, b.rigdowndate::date), coalesce(p.is_internal, false)
  FROM public.projects p
  LEFT JOIN public.bookings b ON b.id = p.booking_id AND b.organization_id = p.organization_id
  WHERE p.deleted_at IS NULL
  UNION ALL
  SELECT 'large', l.id, l.organization_id, l.status::text,
    l.start_date[1]::date, l.event_date[1]::date,
    coalesce(l.end_date[array_length(l.end_date, 1)]::date, l.event_date[array_length(l.event_date, 1)]::date), false
  FROM public.large_projects l WHERE l.deleted_at IS NULL
), classified AS (
  SELECT phases.*, (now() AT TIME ZONE 'Europe/Stockholm')::date AS as_of_date,
    CASE
      WHEN stored_status = 'cancelled' THEN 'cancelled'
      WHEN stored_status = 'completed'
        OR coalesce(derig_date, event_date) < (now() AT TIME ZONE 'Europe/Stockholm')::date THEN 'completed'
      WHEN coalesce(rig_date, event_date) <= (now() AT TIME ZONE 'Europe/Stockholm')::date THEN 'in_progress'
      ELSE 'planning'
    END AS status
  FROM phases
)
SELECT project_kind, project_id, organization_id, stored_status, status,
  CASE WHEN status IN ('completed', 'cancelled') THEN status ELSE 'active' END AS lifecycle,
  ARRAY['all']::text[]
    || CASE WHEN status IN ('planning', 'in_progress') THEN ARRAY['all_active'] ELSE ARRAY[]::text[] END
    || ARRAY[status]
    || CASE WHEN status IN ('planning', 'in_progress') AND NOT is_internal
          AND coalesce(CASE WHEN project_kind = 'large' THEN coalesce(derig_date, rig_date) ELSE event_date END, as_of_date) < as_of_date
       THEN ARRAY['closing'] ELSE ARRAY[]::text[] END AS status_tabs,
  rig_date, event_date, derig_date, as_of_date
FROM classified;
REVOKE ALL ON public.operations_project_states FROM anon, PUBLIC;
GRANT SELECT ON public.operations_project_states TO authenticated, service_role;
