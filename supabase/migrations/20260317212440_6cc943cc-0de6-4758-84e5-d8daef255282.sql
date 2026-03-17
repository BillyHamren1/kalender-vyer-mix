-- Move staff_assignments from duplicate to correct Joel record
UPDATE staff_assignments SET staff_id = 'a6765273-4452-4cb0-a03b-e84a2c5a5df1' WHERE staff_id = 'e640091d-09d0-4c05-92bb-c26bbd294743';

-- Move staff_account to correct Joel record
UPDATE staff_accounts SET staff_id = 'a6765273-4452-4cb0-a03b-e84a2c5a5df1' WHERE staff_id = 'e640091d-09d0-4c05-92bb-c26bbd294743';

-- Remove duplicate staff_member
DELETE FROM staff_members WHERE id = 'e640091d-09d0-4c05-92bb-c26bbd294743';