-- Delete all packing-related data except for the active test booking
-- First get the packing IDs to delete
DO $$
DECLARE
  keep_booking_id TEXT := 'f946d4e4-27de-427c-8ec2-b6cf50f3c948';
BEGIN
  -- Delete child records first to avoid FK violations
  DELETE FROM packing_task_comments WHERE task_id IN (
    SELECT id FROM packing_tasks WHERE packing_id IN (
      SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
    )
  );
  
  DELETE FROM packing_tasks WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_list_items WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_parcels WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_comments WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_files WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_labor_costs WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_purchases WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_invoices WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_quotes WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  DELETE FROM packing_budget WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL
  );
  
  -- Finally delete the packing projects themselves
  DELETE FROM packing_projects WHERE booking_id != keep_booking_id OR booking_id IS NULL;
END $$;