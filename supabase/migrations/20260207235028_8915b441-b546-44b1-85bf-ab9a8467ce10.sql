-- Final cleanup: delete ALL packing projects and their children, keeping none
-- The test booking's packing was also deleted by the earlier migration
-- We'll let the user create fresh ones as needed
DELETE FROM packing_task_comments WHERE task_id IN (SELECT id FROM packing_tasks WHERE packing_id IN (SELECT id FROM packing_projects));
DELETE FROM packing_tasks WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_list_items WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_parcels WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_comments WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_files WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_labor_costs WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_purchases WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_invoices WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_quotes WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_budget WHERE packing_id IN (SELECT id FROM packing_projects);
DELETE FROM packing_projects;