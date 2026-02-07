-- Delete ALL remaining non-test packing projects by explicit ID
DELETE FROM packing_task_comments WHERE task_id IN (
  SELECT id FROM packing_tasks WHERE packing_id IN ('7589c200-8855-4396-a498-87f8dbafc6a2','dc58e49e-ad84-4462-9e66-d9bdfb9b06ec','7c96fd92-bd7d-4708-b361-41515045b36b','cb976831-4e8f-406a-9678-0481247d06d3','23967eaa-056d-4e3d-aa7b-c3a6c9d5e3bf')
);
DELETE FROM packing_tasks WHERE packing_id IN ('7589c200-8855-4396-a498-87f8dbafc6a2','dc58e49e-ad84-4462-9e66-d9bdfb9b06ec','7c96fd92-bd7d-4708-b361-41515045b36b','cb976831-4e8f-406a-9678-0481247d06d3','23967eaa-056d-4e3d-aa7b-c3a6c9d5e3bf');
DELETE FROM packing_list_items WHERE packing_id IN ('7589c200-8855-4396-a498-87f8dbafc6a2','dc58e49e-ad84-4462-9e66-d9bdfb9b06ec','7c96fd92-bd7d-4708-b361-41515045b36b','cb976831-4e8f-406a-9678-0481247d06d3','23967eaa-056d-4e3d-aa7b-c3a6c9d5e3bf');
DELETE FROM packing_parcels WHERE packing_id IN ('7589c200-8855-4396-a498-87f8dbafc6a2','dc58e49e-ad84-4462-9e66-d9bdfb9b06ec','7c96fd92-bd7d-4708-b361-41515045b36b','cb976831-4e8f-406a-9678-0481247d06d3','23967eaa-056d-4e3d-aa7b-c3a6c9d5e3bf');
DELETE FROM packing_budget WHERE packing_id IN ('7589c200-8855-4396-a498-87f8dbafc6a2','dc58e49e-ad84-4462-9e66-d9bdfb9b06ec','7c96fd92-bd7d-4708-b361-41515045b36b','cb976831-4e8f-406a-9678-0481247d06d3','23967eaa-056d-4e3d-aa7b-c3a6c9d5e3bf');
DELETE FROM packing_projects WHERE id IN ('7589c200-8855-4396-a498-87f8dbafc6a2','dc58e49e-ad84-4462-9e66-d9bdfb9b06ec','7c96fd92-bd7d-4708-b361-41515045b36b','cb976831-4e8f-406a-9678-0481247d06d3','23967eaa-056d-4e3d-aa7b-c3a6c9d5e3bf');