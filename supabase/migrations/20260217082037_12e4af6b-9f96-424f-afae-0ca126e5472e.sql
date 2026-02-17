-- Remove the duplicate Björn Lidström (the one without an account)
DELETE FROM staff_assignments WHERE staff_id = '2de5b11f-a1f0-47ed-9a5f-4e85fec9fda7';
DELETE FROM staff_members WHERE id = '2de5b11f-a1f0-47ed-9a5f-4e85fec9fda7';