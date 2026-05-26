UPDATE bookings SET assigned_project_id = NULL, assigned_project_name = NULL, assigned_to_project = false
WHERE assigned_project_id IS NOT NULL
  AND assigned_project_id::uuid NOT IN (SELECT id FROM projects WHERE deleted_at IS NULL);

UPDATE bookings SET large_project_id = NULL
WHERE large_project_id IS NOT NULL
  AND large_project_id::uuid NOT IN (SELECT id FROM large_projects WHERE deleted_at IS NULL);