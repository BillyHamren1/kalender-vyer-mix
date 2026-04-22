-- Close stale open travel_time_logs row left over by the bug fixed in this deploy.
UPDATE travel_time_logs
SET end_time = now(),
    to_address = COALESCE(to_address, 'FA Warehouse')
WHERE id = '77c3968a-5e6a-421b-a4dd-975555dfabf6'
  AND end_time IS NULL;