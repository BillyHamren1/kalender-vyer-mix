
CREATE TABLE public.travel_time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT get_user_organization_id(auth.uid()) REFERENCES public.organizations(id),
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  hours_worked numeric NOT NULL DEFAULT 0,
  from_address text,
  from_latitude double precision,
  from_longitude double precision,
  to_address text,
  to_latitude double precision,
  to_longitude double precision,
  description text,
  auto_detected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.travel_time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on travel_time_logs"
  ON public.travel_time_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "org_filter_travel_time_logs"
  ON public.travel_time_logs
  FOR ALL
  TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE TRIGGER update_travel_time_logs_updated_at
  BEFORE UPDATE ON public.travel_time_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
