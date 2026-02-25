ALTER TABLE packing_projects
  ADD COLUMN signed_by TEXT,
  ADD COLUMN signed_at TIMESTAMPTZ;