CREATE TABLE IF NOT EXISTS public.staff_gps_day_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  date date NOT NULL,
  anchor_type text NOT NULL CHECK (anchor_type IN ('start', 'end')),
  suggested_at timestamptz NULL,
  confirmed_at timestamptz NULL,
  source text NOT NULL DEFAULT 'mobile_time_v2',
  confirmation_mode text NOT NULL DEFAULT 'confirmed'
    CHECK (confirmation_mode IN ('confirmed', 'adjusted', 'dismissed')),
  reason text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_gps_day_anchors_unique UNIQUE (staff_id, date, anchor_type)
);

CREATE INDEX IF NOT EXISTS idx_staff_gps_day_anchors_staff_date
  ON public.staff_gps_day_anchors (staff_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_gps_day_anchors_anchor_type
  ON public.staff_gps_day_anchors (anchor_type);
CREATE INDEX IF NOT EXISTS idx_staff_gps_day_anchors_confirmed_at
  ON public.staff_gps_day_anchors (confirmed_at);
CREATE INDEX IF NOT EXISTS idx_staff_gps_day_anchors_org
  ON public.staff_gps_day_anchors (organization_id, date);

CREATE TRIGGER trg_staff_gps_day_anchors_updated_at
  BEFORE UPDATE ON public.staff_gps_day_anchors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.staff_gps_day_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anchors_org_isolation"
  ON public.staff_gps_day_anchors
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT sm.organization_id FROM public.staff_members sm WHERE sm.user_id = auth.uid()
    )
    OR public.has_role('admin'::app_role)
  )
  WITH CHECK (
    organization_id IN (
      SELECT sm.organization_id FROM public.staff_members sm WHERE sm.user_id = auth.uid()
    )
    OR public.has_role('admin'::app_role)
  );

CREATE POLICY "anchors_staff_select_self"
  ON public.staff_gps_day_anchors
  FOR SELECT
  TO authenticated
  USING (staff_id::text IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY "anchors_staff_insert_self"
  ON public.staff_gps_day_anchors
  FOR INSERT
  TO authenticated
  WITH CHECK (staff_id::text IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY "anchors_staff_update_self"
  ON public.staff_gps_day_anchors
  FOR UPDATE
  TO authenticated
  USING (staff_id::text IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()))
  WITH CHECK (staff_id::text IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY "anchors_admin_all"
  ON public.staff_gps_day_anchors
  FOR ALL
  TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));