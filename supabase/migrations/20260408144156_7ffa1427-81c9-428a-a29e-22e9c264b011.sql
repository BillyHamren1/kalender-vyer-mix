
-- Add 'org_change' to the booking_changes check constraint
ALTER TABLE public.booking_changes DROP CONSTRAINT booking_changes_change_type_check;
ALTER TABLE public.booking_changes ADD CONSTRAINT booking_changes_change_type_check 
  CHECK (change_type = ANY (ARRAY['new', 'update', 'status_change', 'delete', 'org_change']));

-- Now fix the 4 misplaced bookings
UPDATE bookings 
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_products
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE booking_id IN (
  'd7c6766f-4cbf-4337-aa7c-2be6012276a7',
  '7eb4bf48-c897-4d37-b6f9-8f7b336ddbc2',
  '864c935e-4e69-4c25-9cac-db2191b9549f',
  'e3895e9e-d637-4654-b5e1-a21d1c81abe0'
) AND organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_attachments
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE booking_id IN (
  'd7c6766f-4cbf-4337-aa7c-2be6012276a7',
  '7eb4bf48-c897-4d37-b6f9-8f7b336ddbc2',
  '864c935e-4e69-4c25-9cac-db2191b9549f',
  'e3895e9e-d637-4654-b5e1-a21d1c81abe0'
) AND organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE calendar_events
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE booking_id IN (
  'd7c6766f-4cbf-4337-aa7c-2be6012276a7',
  '7eb4bf48-c897-4d37-b6f9-8f7b336ddbc2',
  '864c935e-4e69-4c25-9cac-db2191b9549f',
  'e3895e9e-d637-4654-b5e1-a21d1c81abe0'
) AND organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE packing_projects
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE booking_id IN (
  'd7c6766f-4cbf-4337-aa7c-2be6012276a7',
  '7eb4bf48-c897-4d37-b6f9-8f7b336ddbc2',
  '864c935e-4e69-4c25-9cac-db2191b9549f',
  'e3895e9e-d637-4654-b5e1-a21d1c81abe0'
) AND organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE warehouse_calendar_events
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE booking_id IN (
  'd7c6766f-4cbf-4337-aa7c-2be6012276a7',
  '7eb4bf48-c897-4d37-b6f9-8f7b336ddbc2',
  '864c935e-4e69-4c25-9cac-db2191b9549f',
  'e3895e9e-d637-4654-b5e1-a21d1c81abe0'
) AND organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
