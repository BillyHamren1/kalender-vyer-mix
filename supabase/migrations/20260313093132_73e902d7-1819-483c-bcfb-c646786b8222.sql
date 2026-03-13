-- Fix the booking that was assigned to wrong organization
UPDATE bookings SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE id = 'ea1ada07-e57f-46f3-baa5-ee81f5cb0b89';

-- Also fix any related records
UPDATE booking_products SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE booking_id = 'ea1ada07-e57f-46f3-baa5-ee81f5cb0b89';
UPDATE booking_attachments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE booking_id = 'ea1ada07-e57f-46f3-baa5-ee81f5cb0b89';
UPDATE calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE booking_id = 'ea1ada07-e57f-46f3-baa5-ee81f5cb0b89';
UPDATE booking_changes SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE booking_id = 'ea1ada07-e57f-46f3-baa5-ee81f5cb0b89';
UPDATE packing_projects SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE booking_id = 'ea1ada07-e57f-46f3-baa5-ee81f5cb0b89';