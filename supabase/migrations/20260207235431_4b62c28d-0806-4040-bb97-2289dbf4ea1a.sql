
-- Disable only user-defined triggers on bookings
ALTER TABLE bookings DISABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE bookings DISABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE bookings DISABLE TRIGGER bookings_track_changes_update;
ALTER TABLE bookings DISABLE TRIGGER bookings_track_deletions;
ALTER TABLE bookings DISABLE TRIGGER on_booking_delete_complete_projects;

-- Delete all related child records for bookings we're removing
-- Keep only 2602-2 and 2602-4

-- Packing related
DELETE FROM packing_task_comments WHERE task_id IN (
  SELECT id FROM packing_tasks WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  )
);
DELETE FROM packing_tasks WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_list_items WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_parcels WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_comments WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_files WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_labor_costs WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_purchases WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_invoices WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_quotes WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_budget WHERE packing_id IN (
  SELECT id FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM packing_projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Project related
DELETE FROM task_comments WHERE task_id IN (
  SELECT id FROM project_tasks WHERE project_id IN (
    SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
  )
);
DELETE FROM project_tasks WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM project_comments WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM project_files WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM project_labor_costs WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM project_purchases WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM project_invoices WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM project_quotes WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM project_budget WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM job_completion_analytics WHERE project_id IN (
  SELECT id FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92')
);
DELETE FROM projects WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Large project bookings
DELETE FROM large_project_bookings WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Direct booking children
DELETE FROM booking_changes WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM booking_attachments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM booking_staff_assignments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM calendar_events WHERE booking_id IS NOT NULL AND booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM time_reports WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM transport_assignments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM job_completion_analytics WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM booking_products WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Delete the bookings
DELETE FROM bookings WHERE id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Re-enable triggers
ALTER TABLE bookings ENABLE TRIGGER bookings_track_changes_delete;
ALTER TABLE bookings ENABLE TRIGGER bookings_track_changes_insert;
ALTER TABLE bookings ENABLE TRIGGER bookings_track_changes_update;
ALTER TABLE bookings ENABLE TRIGGER bookings_track_deletions;
ALTER TABLE bookings ENABLE TRIGGER on_booking_delete_complete_projects;
