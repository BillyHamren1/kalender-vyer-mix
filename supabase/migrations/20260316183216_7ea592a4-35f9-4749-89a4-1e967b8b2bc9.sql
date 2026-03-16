-- Retry with minimal safe update (avoid calendar_events trigger side effects)
UPDATE public.bookings
SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
WHERE id IN (
  '6a2ebcfa-cebf-4e43-9273-dcb76ce16db5',
  '5ce4ef0e-9b51-4dfe-a6af-2a4a98f8878d'
);