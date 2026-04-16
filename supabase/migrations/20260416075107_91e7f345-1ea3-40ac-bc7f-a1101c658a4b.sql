ALTER TABLE time_reports ADD COLUMN location_id uuid REFERENCES organization_locations(id);
ALTER TABLE time_reports DROP CONSTRAINT time_reports_has_link;
ALTER TABLE time_reports ADD CONSTRAINT time_reports_has_link CHECK ((booking_id IS NOT NULL) OR (large_project_id IS NOT NULL) OR (location_id IS NOT NULL));