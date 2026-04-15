UPDATE bookings
SET assigned_to_project = true
WHERE id IN (
  '46594fb3-37b0-4920-a052-bd03a29f05f0',
  'b5eb2322-68dc-4c1a-b8f7-627640cdfd52',
  '5ce4ef0e-9b51-4dfe-a6af-2a4a98f8878d',
  '6a2ebcfa-cebf-4e43-9273-dcb76ce16db5',
  'a0863f21-8825-476a-951e-abe20abde209',
  '8e8cbfc3-09cc-40d9-86b4-7a55605d3a0f',
  'ab56b4f6-5eaa-4182-b444-115671442a7f',
  'cd22cd68-ee2e-4744-a43f-6cdca4956401'
);