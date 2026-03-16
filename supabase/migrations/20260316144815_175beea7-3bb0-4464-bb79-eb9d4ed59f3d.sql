
-- Fix remaining bookings with wrong organization_id (Doomie Design -> Frans August AB)
UPDATE bookings 
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_products 
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_attachments 
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_changes 
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE calendar_events 
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
