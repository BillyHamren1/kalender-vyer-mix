-- Clean up remaining packing projects that aren't the active test booking
DELETE FROM packing_task_comments WHERE task_id IN (
  SELECT id FROM packing_tasks WHERE packing_id IN (
    SELECT id FROM packing_projects WHERE id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56')
  )
);
DELETE FROM packing_tasks WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_list_items WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_parcels WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_comments WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_files WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_labor_costs WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_purchases WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_invoices WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_quotes WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_budget WHERE packing_id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');
DELETE FROM packing_projects WHERE id IN ('fd2b7b8d-cbb6-4b64-9343-dd2bc33e2bac', 'da7f1308-bca1-46d5-a998-3bbd0de64254', 'c76808ab-4828-4da5-9e59-a5d9b3c2ad56');