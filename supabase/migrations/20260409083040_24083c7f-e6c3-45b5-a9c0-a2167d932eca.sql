
ALTER TABLE large_projects 
  ALTER COLUMN start_date TYPE text[] USING CASE WHEN start_date IS NOT NULL THEN ARRAY[start_date::text] ELSE NULL END,
  ALTER COLUMN event_date TYPE text[] USING CASE WHEN event_date IS NOT NULL THEN ARRAY[event_date] ELSE NULL END,
  ALTER COLUMN end_date TYPE text[] USING CASE WHEN end_date IS NOT NULL THEN ARRAY[end_date::text] ELSE NULL END;
