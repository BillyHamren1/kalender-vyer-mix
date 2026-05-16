-- App health events for diagnostics only (never feeds Time Engine).
CREATE TABLE IF NOT EXISTS public.staff_app_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  battery_level numeric NULL,
  battery_percent integer NULL,
  is_charging boolean NULL,
  app_state text NULL,
  platform text NULL,
  app_version text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_app_health_events_event_type_check CHECK (event_type IN (
    'app_start',
    'app_foreground',
    'app_background',
    'workday_timer_started',
    'workday_timer_stopped',
    'location_permission_denied',
    'location_permission_restored',
    'battery_snapshot'
  )),
  CONSTRAINT staff_app_health_events_battery_level_range CHECK (
    battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 1)
  ),
  CONSTRAINT staff_app_health_events_battery_percent_range CHECK (
    battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_app_health_events_staff_occurred
  ON public.staff_app_health_events (staff_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_app_health_events_org_occurred
  ON public.staff_app_health_events (organization_id, occurred_at DESC);

ALTER TABLE public.staff_app_health_events ENABLE ROW LEVEL SECURITY;

-- Read access: any authenticated user in the same organization (mirrors raw ping debug).
CREATE POLICY "Org members can read app health events"
  ON public.staff_app_health_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = staff_app_health_events.organization_id
    )
  );

-- Write access: only the edge function (service_role) inserts.
CREATE POLICY "Service role can insert app health events"
  ON public.staff_app_health_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);
