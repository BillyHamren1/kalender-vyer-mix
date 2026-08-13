-- STEG 4D – READ-ONLY diagnostik för sync-tabellernas integritet.
-- Kör manuellt i SQL-editorn. Innehåller INGA DELETE/UPDATE/TRUNCATE.

-- 1) Blockerare för unique (organization_id, booking_id) på packing_projects
SELECT pp.organization_id, pp.booking_id, count(*) AS rows,
       array_agg(pp.id ORDER BY pp.created_at) AS packing_ids,
       array_agg(pp.status ORDER BY pp.created_at) AS statuses,
       array_agg(pp.created_at ORDER BY pp.created_at) AS created
FROM public.packing_projects pp
GROUP BY 1,2 HAVING count(*) > 1
ORDER BY rows DESC;

-- 2) Blockerare för unique (organization_id, booking_id) på projects (ej soft-deletade)
SELECT p.organization_id, p.booking_id, count(*) AS rows,
       array_agg(p.id ORDER BY p.created_at) AS project_ids,
       array_agg(p.status ORDER BY p.created_at) AS statuses
FROM public.projects p
WHERE p.booking_id IS NOT NULL AND p.deleted_at IS NULL
GROUP BY 1,2 HAVING count(*) > 1;

-- 3) Orphan-risker (endast rapport)
SELECT 'calendar_events_orphan' AS kind, c.id::text, c.booking_id, c.event_type, c.source_date
FROM public.calendar_events c
WHERE c.booking_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = c.booking_id);

-- 4) Cross-tenant-avvikelser (ska vara 0 rader)
SELECT 'calendar_events' AS tbl, c.id::text, c.organization_id, b.organization_id AS booking_org
FROM public.calendar_events c JOIN public.bookings b ON b.id = c.booking_id
WHERE c.organization_id IS DISTINCT FROM b.organization_id
UNION ALL
SELECT 'booking_products', bp.id::text, bp.organization_id, b.organization_id
FROM public.booking_products bp JOIN public.bookings b ON b.id = bp.booking_id
WHERE bp.organization_id IS DISTINCT FROM b.organization_id
UNION ALL
SELECT 'packing_list_items', i.id::text, i.organization_id, pp.organization_id
FROM public.packing_list_items i JOIN public.packing_projects pp ON pp.id = i.packing_id
WHERE i.organization_id IS DISTINCT FROM pp.organization_id;

-- 5) Sync-jobs / batcher: hängande leases och icke-terminala jobb
SELECT id, organization_id, booking_id, status, attempts, worker_id, lease_expires_at
FROM public.booking_sync_jobs
WHERE status IN ('processing','pending','retryable')
  AND (lease_expires_at IS NULL OR lease_expires_at < now())
ORDER BY received_at;

SELECT b.id, b.organization_id, b.sync_type, b.status, b.total_jobs, b.succeeded_jobs, b.failed_jobs,
       count(j.*) FILTER (WHERE j.status NOT IN ('succeeded','failed','skipped')) AS non_terminal_jobs
FROM public.sync_batches b
LEFT JOIN public.booking_sync_jobs j ON j.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id
ORDER BY b.started_at DESC;

-- 6) booking_source_state: låsta/pending revisioner
SELECT organization_id, booking_id, revision_kind, pending_started_at, lock_owner_job_id, lock_expires_at
FROM public.booking_source_state
WHERE lock_token IS NOT NULL OR pending_started_at IS NOT NULL
ORDER BY updated_at DESC;
