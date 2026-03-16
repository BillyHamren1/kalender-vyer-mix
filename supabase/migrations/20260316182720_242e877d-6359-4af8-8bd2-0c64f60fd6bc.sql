
-- Fix 2 bookings with wrong organization_id (should be Frans August AB)
-- These bookings are linked to jobs in Frans August but parent row is in Doomie Design

UPDATE bookings 
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE id IN ('6a2ebcfa-cebf-4e43-9273-dcb76ce16db5', '5ce4ef0e-9b51-4dfe-a6af-2a4a98f8878d')
  AND organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

-- Also fix any related booking_changes rows
UPDATE booking_changes
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE booking_id IN ('6a2ebcfa-cebf-4e43-9273-dcb76ce16db5', '5ce4ef0e-9b51-4dfe-a6af-2a4a98f8878d')
  AND organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
