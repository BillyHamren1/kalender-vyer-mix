
-- SECOND CLEANUP: Remove bookings re-imported by sync during deployment
-- Keep ONLY 2602-2 and 2602-4

-- Disable user triggers
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_changes_update;
ALTER TABLE public.bookings DISABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings DISABLE TRIGGER on_booking_delete_complete_projects;

-- Packing hierarchy
DELETE FROM public.packing_task_comments
WHERE task_id IN (
  SELECT id FROM public.packing_tasks WHERE packing_id IN (
    SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
  )
);
DELETE FROM public.packing_tasks WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_list_items WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_parcels WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_comments WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_files WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_labor_costs WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_purchases WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_invoices WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_quotes WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_budget WHERE packing_id IN (
  SELECT id FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL
);
DELETE FROM public.packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL;

-- Calendar & warehouse events
DELETE FROM public.calendar_events WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL;
DELETE FROM public.warehouse_calendar_events WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL;

-- Transport, time reports
DELETE FROM public.transport_assignments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM public.time_reports WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Booking children
DELETE FROM public.booking_products WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM public.booking_attachments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM public.booking_changes WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM public.booking_staff_assignments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM public.large_project_bookings WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Projects hierarchy
DELETE FROM public.task_comments WHERE task_id IN (SELECT id FROM public.project_tasks WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL));
DELETE FROM public.project_tasks WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.project_comments WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.project_files WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.project_labor_costs WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.project_purchases WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.project_invoices WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.project_quotes WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.project_budget WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.job_completion_analytics WHERE project_id IN (SELECT id FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL;

-- Jobs
DELETE FROM public.job_staff_assignments WHERE job_id IN (SELECT id FROM public.jobs WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM public.jobs WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL;

-- Bookings themselves
DELETE FROM public.bookings WHERE id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Re-enable triggers
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_changes_update;
ALTER TABLE public.bookings ENABLE TRIGGER bookings_track_deletions;
ALTER TABLE public.bookings ENABLE TRIGGER on_booking_delete_complete_projects;
