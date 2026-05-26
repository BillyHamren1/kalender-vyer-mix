DELETE FROM calendar_events
WHERE id IN (
  '98d9fa42-b1dc-4535-b1fd-c9649b75b730',
  '3127b154-b7e7-475b-a1a6-eb692e277e64',
  '19f64b91-8aeb-4339-8b3a-56579d9cebf5',
  '4d6c11b3-4f1f-4274-86ff-35ad0d053a52'
);

UPDATE bookings SET rental_only = true WHERE id = '492f4f8d-c39e-4069-a275-997ca43a8783';