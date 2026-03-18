ALTER TABLE travel_time_logs
ADD COLUMN IF NOT EXISTS destination_booking_id text,
ADD COLUMN IF NOT EXISTS manual_project_name text;