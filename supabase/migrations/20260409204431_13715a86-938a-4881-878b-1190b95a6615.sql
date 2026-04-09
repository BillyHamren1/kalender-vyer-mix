UPDATE public.bookings
SET viewed = false
WHERE id IN (
  '018af6ab-2730-4dbf-bb0a-8841efb0b118',
  'e5d1034b-e011-493a-9498-11862564d152',
  '917b8c3c-e462-4f65-9385-34a4a1e7e26c',
  '9c955faf-a1c8-48f3-be01-5b8c69382f76',
  'b5c2dc9b-7a7e-48fb-9f12-38a18661705d',
  '22dbf9c6-a72c-4e40-b59e-0ee4286cb6aa',
  '35a070e7-d6ea-4c9a-8e2e-d28b1e668f57'
)
AND status = 'CONFIRMED'
AND assigned_to_project = false;