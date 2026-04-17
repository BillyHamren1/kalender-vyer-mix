DO $$ BEGIN
  CREATE TYPE public.anomaly_classification AS ENUM ('break', 'work');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.time_report_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  location_id uuid REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  booking_id text,
  large_project_id uuid REFERENCES public.large_projects(id) ON DELETE SET NULL,
  time_report_id uuid REFERENCES public.time_reports(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_minutes integer GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NULL THEN NULL
         ELSE GREATEST(0, EXTRACT(EPOCH FROM (ended_at - started_at))::int / 60)
    END
  ) STORED,
  classification public.anomaly_classification,
  work_description text,
  classified_at timestamptz,
  source text NOT NULL DEFAULT 'geofence',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_staff_open
  ON public.time_report_anomalies (staff_id, ended_at)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_anomalies_staff_unclassified
  ON public.time_report_anomalies (staff_id, classification)
  WHERE classification IS NULL AND ended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anomalies_time_report
  ON public.time_report_anomalies (time_report_id)
  WHERE time_report_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_anomaly_per_staff_location
  ON public.time_report_anomalies (staff_id, location_id)
  WHERE ended_at IS NULL AND location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_anomaly_per_staff_booking
  ON public.time_report_anomalies (staff_id, booking_id)
  WHERE ended_at IS NULL AND booking_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_time_report_anomalies_updated_at ON public.time_report_anomalies;
CREATE TRIGGER trg_time_report_anomalies_updated_at
BEFORE UPDATE ON public.time_report_anomalies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_time_report_anomalies_set_org ON public.time_report_anomalies;
CREATE TRIGGER trg_time_report_anomalies_set_org
BEFORE INSERT ON public.time_report_anomalies
FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE OR REPLACE FUNCTION public.validate_anomaly_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.classification = 'work'
     AND NEW.duration_minutes IS NOT NULL
     AND NEW.duration_minutes > 10
     AND (NEW.work_description IS NULL OR length(trim(NEW.work_description)) = 0)
  THEN
    RAISE EXCEPTION 'work_description is required when classification=work and duration > 10 minutes';
  END IF;

  IF NEW.classification IS NOT NULL AND NEW.classified_at IS NULL THEN
    NEW.classified_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_anomaly ON public.time_report_anomalies;
CREATE TRIGGER trg_validate_anomaly
BEFORE INSERT OR UPDATE ON public.time_report_anomalies
FOR EACH ROW EXECUTE FUNCTION public.validate_anomaly_classification();

ALTER TABLE public.time_report_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own anomalies"
ON public.time_report_anomalies
FOR SELECT
USING (
  staff_id IN (
    SELECT id FROM public.staff_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins view org anomalies"
ON public.time_report_anomalies
FOR SELECT
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND (public.has_role('admin'::app_role) OR public.has_role('projekt'::app_role))
);

CREATE POLICY "Staff insert own anomalies"
ON public.time_report_anomalies
FOR INSERT
WITH CHECK (
  staff_id IN (
    SELECT id FROM public.staff_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff update own anomalies"
ON public.time_report_anomalies
FOR UPDATE
USING (
  staff_id IN (
    SELECT id FROM public.staff_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins manage org anomalies"
ON public.time_report_anomalies
FOR ALL
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_role('admin'::app_role)
);