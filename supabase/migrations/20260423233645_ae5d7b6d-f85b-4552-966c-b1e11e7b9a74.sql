-- Manually close stuck workdays for Kristaps & Raivis at 18:03 local (Europe/Stockholm)
-- Matīss already has a closed workday for 2026-04-23.
UPDATE workdays
SET ended_at = '2026-04-23 16:03:00+00',
    updated_at = now()
WHERE id IN (
  'f322b431-33ad-43d8-b5a9-a3b45335d311',  -- Kristaps Ruža
  'be6c2675-97d5-4273-bc50-04bbde89313f'   -- Raivis Minalto
)
AND ended_at IS NULL;