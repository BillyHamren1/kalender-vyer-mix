
-- Konvertera 3 felregistrerade "Pick up"-projekt till to do's (typ Upphämtning) och soft-delete projekten.

INSERT INTO public.todos (organization_id, type_id, title, scheduled_date, latitude, longitude, planning_status)
VALUES
  ('f5e5cade-f08b-4833-a105-56461f15b191', 'aeaa26ea-a8e4-44e2-86a0-2e502f76fa75', 'Pick up tross workman', '2026-05-18', NULL, NULL, 'needs_planning'),
  ('f5e5cade-f08b-4833-a105-56461f15b191', 'aeaa26ea-a8e4-44e2-86a0-2e502f76fa75', 'Pick up carpet nessim', '2026-05-18', NULL, NULL, 'needs_planning'),
  ('f5e5cade-f08b-4833-a105-56461f15b191', 'aeaa26ea-a8e4-44e2-86a0-2e502f76fa75', 'Pick up key at Kungsträdgården', '2026-05-15', 59.331478574358, 18.0713919480628, 'needs_planning');

UPDATE public.projects
SET deleted_at = now()
WHERE id IN (
  '42a4fe78-3a86-4d13-a1fb-f040622f5d87',
  '198f1d0e-e3dd-4e62-9958-1d9283b294dc',
  '01fd4bb7-5bc2-4e6f-a9ea-eb1a7194819e'
);
