DROP POLICY IF EXISTS anchors_staff_select_self ON public.staff_gps_day_anchors;
DROP POLICY IF EXISTS anchors_staff_insert_self ON public.staff_gps_day_anchors;
DROP POLICY IF EXISTS anchors_staff_update_self ON public.staff_gps_day_anchors;
DROP POLICY IF EXISTS staff_read_own_decision_log ON public.staff_day_decision_log;
DROP POLICY IF EXISTS staff_read_own_boosts ON public.tracking_policy_boosts;

ALTER TABLE public.staff_gps_day_anchors        ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.staff_gps_day_snapshots      ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.staff_day_decision_log       ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.staff_day_rebuild_queue      ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.staff_app_health_events      ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.staff_wake_requests          ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.time_report_ai_reviews       ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.tracking_boost_dismissals    ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.tracking_policy_boosts       ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.warehouse_assignments        ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.arrival_context_suggestions  ALTER COLUMN staff_id TYPE text USING staff_id::text;
ALTER TABLE public.location_auto_start_runs     ALTER COLUMN staff_id TYPE text USING staff_id::text;

CREATE POLICY anchors_staff_select_self
  ON public.staff_gps_day_anchors
  FOR SELECT
  TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY anchors_staff_insert_self
  ON public.staff_gps_day_anchors
  FOR INSERT
  TO authenticated
  WITH CHECK (staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY anchors_staff_update_self
  ON public.staff_gps_day_anchors
  FOR UPDATE
  TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()))
  WITH CHECK (staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE POLICY staff_read_own_decision_log
  ON public.staff_day_decision_log
  FOR SELECT
  TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE (user_id)::text = (auth.uid())::text));

CREATE POLICY staff_read_own_boosts
  ON public.tracking_policy_boosts
  FOR SELECT
  TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE (user_id)::text = (auth.uid())::text));