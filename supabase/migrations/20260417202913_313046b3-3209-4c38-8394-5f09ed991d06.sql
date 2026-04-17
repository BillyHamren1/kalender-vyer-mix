-- Add end-of-day position fields to time_report_anomalies
ALTER TABLE public.time_report_anomalies
  ADD COLUMN IF NOT EXISTS end_location_lat double precision,
  ADD COLUMN IF NOT EXISTS end_location_lng double precision,
  ADD COLUMN IF NOT EXISTS end_location_recorded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS auto_classified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.time_report_anomalies.end_location_lat IS 'GPS latitude captured at the time the user reported the absence end (end-of-day flow)';
COMMENT ON COLUMN public.time_report_anomalies.end_location_lng IS 'GPS longitude captured at the time the user reported the absence end (end-of-day flow)';
COMMENT ON COLUMN public.time_report_anomalies.auto_classified IS 'True when the anomaly was classified automatically via the end-of-day stop dialog (not via the manual classification dialog)';