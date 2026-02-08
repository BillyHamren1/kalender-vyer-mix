
-- Temporarily replace the trigger function with a no-op
CREATE OR REPLACE FUNCTION track_booking_deletions()
RETURNS TRIGGER AS $$
BEGIN
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Now clean up orphaned data

-- Packing children
DELETE FROM packing_task_comments WHERE task_id IN (SELECT id FROM packing_tasks);
DELETE FROM packing_tasks WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_list_items WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_parcels WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_comments WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_files WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_labor_costs WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_purchases WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_invoices WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_quotes WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_budget WHERE packing_id IN (SELECT id FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92'));
DELETE FROM packing_projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Booking children
DELETE FROM booking_changes WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM booking_attachments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM booking_staff_assignments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM calendar_events WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM transport_assignments WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM time_reports WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');
DELETE FROM booking_products WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') AND parent_product_id IS NOT NULL;
DELETE FROM booking_products WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Project children
DELETE FROM task_comments WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL));
DELETE FROM project_tasks WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM project_comments WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM project_labor_costs WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM project_purchases WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM project_invoices WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM project_quotes WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM project_budget WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM job_completion_analytics WHERE project_id IN (SELECT id FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL);
DELETE FROM projects WHERE booking_id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92') OR booking_id IS NULL;

-- Delete orphaned bookings
DELETE FROM bookings WHERE id NOT IN ('cd22cd68-ee2e-4744-a43f-6cdca4956401', '195c642e-31c2-4484-a44f-c7c701c2ec92');

-- Restore the original trigger function
CREATE OR REPLACE FUNCTION track_booking_deletions()
RETURNS TRIGGER AS $$
DECLARE
  next_version INT;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM public.booking_changes
  WHERE booking_id = OLD.id;
  
  INSERT INTO public.booking_changes (
    booking_id,
    change_type,
    changed_fields,
    previous_values,
    new_values,
    version,
    changed_by
  ) VALUES (
    OLD.id,
    'delete',
    '{"deleted": true}'::JSONB,
    row_to_json(OLD)::JSONB,
    '{}'::JSONB,
    next_version,
    current_setting('app.current_user', TRUE)::TEXT
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;
