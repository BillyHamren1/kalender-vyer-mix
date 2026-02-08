
-- =====================================================
-- DEEP PURGE: Remove ALL bookings + related data
-- EXCEPT booking 2602-2 and 2602-4
-- =====================================================

-- Step 1: Disable user-defined triggers on bookings (NOT system triggers)
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_update;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings DISABLE TRIGGER on_booking_delete_complete_projects;

-- Step 2: Delete in dependency order (children first)

-- 2a: Packing hierarchy
DELETE FROM public.packing_task_comments
WHERE task_id IN (
  SELECT id FROM public.packing_tasks
  WHERE packing_id IN (
    SELECT id FROM public.packing_projects
    WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
    OR booking_id IS NULL
  )
);

DELETE FROM public.packing_tasks
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_list_items
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_parcels
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_comments
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_files
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_labor_costs
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_purchases
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_invoices
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_quotes
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_budget
WHERE packing_id IN (
  SELECT id FROM public.packing_projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.packing_projects
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
OR booking_id IS NULL;

-- 2b: Calendar events
DELETE FROM public.calendar_events
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
OR booking_id IS NULL;

DELETE FROM public.warehouse_calendar_events
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
OR booking_id IS NULL;

-- 2c: Transport
DELETE FROM public.transport_assignments
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- 2d: Time reports
DELETE FROM public.time_reports
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- 2e: Booking products
DELETE FROM public.booking_products
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- 2f: Booking attachments
DELETE FROM public.booking_attachments
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- 2g: Booking changes
DELETE FROM public.booking_changes
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- 2h: Booking staff assignments
DELETE FROM public.booking_staff_assignments
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- 2i: Large project bookings
DELETE FROM public.large_project_bookings
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- 2j: Projects hierarchy
DELETE FROM public.task_comments
WHERE task_id IN (
  SELECT id FROM public.project_tasks
  WHERE project_id IN (
    SELECT id FROM public.projects
    WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
    OR booking_id IS NULL
  )
);

DELETE FROM public.project_tasks
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.project_comments
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.project_files
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.project_labor_costs
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.project_purchases
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.project_invoices
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.project_quotes
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.project_budget
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.job_completion_analytics
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.projects
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
OR booking_id IS NULL;

-- 2k: Jobs
DELETE FROM public.job_staff_assignments
WHERE job_id IN (
  SELECT id FROM public.jobs
  WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  OR booking_id IS NULL
);

DELETE FROM public.jobs
WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
OR booking_id IS NULL;

-- Step 3: Delete bookings (triggers disabled)
DELETE FROM public.bookings
WHERE id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Step 4: Re-enable triggers
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_update;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings ENABLE TRIGGER on_booking_delete_complete_projects;
