-- Assign all roles to Joel Habegger
INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('0369ae48-5ce3-44c4-86ab-bde57469b8eb', 'admin'),
  ('0369ae48-5ce3-44c4-86ab-bde57469b8eb', 'forsaljning'),
  ('0369ae48-5ce3-44c4-86ab-bde57469b8eb', 'projekt'),
  ('0369ae48-5ce3-44c4-86ab-bde57469b8eb', 'lager')
ON CONFLICT (user_id, role) DO NOTHING;