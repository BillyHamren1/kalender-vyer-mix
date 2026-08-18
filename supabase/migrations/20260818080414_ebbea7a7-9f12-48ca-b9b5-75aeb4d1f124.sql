-- =====================================================================
-- P0-1: establishment_tasks – ta bort cross-tenant-policy
-- =====================================================================
DROP POLICY IF EXISTS "Users can manage establishment tasks for large projects" ON public.establishment_tasks;

-- =====================================================================
-- P0-2: day_attestations – admin-policies utan org-filter
-- =====================================================================
DROP POLICY IF EXISTS "Admins can view all day attestations" ON public.day_attestations;
DROP POLICY IF EXISTS "Admins can update all day attestations" ON public.day_attestations;
DROP POLICY IF EXISTS "Admins can insert day attestations" ON public.day_attestations;

CREATE POLICY "Admins can view org day attestations"
  ON public.day_attestations FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update org day attestations"
  ON public.day_attestations FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can insert org day attestations"
  ON public.day_attestations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
              AND public.has_role('admin'::app_role, auth.uid()));

-- =====================================================================
-- P0-3: staff_gps_day_anchors – admin utan org-filter
-- =====================================================================
DROP POLICY IF EXISTS "anchors_admin_all" ON public.staff_gps_day_anchors;
CREATE POLICY "anchors_admin_all" ON public.staff_gps_day_anchors
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND public.has_role('admin'::app_role))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
              AND public.has_role('admin'::app_role));

-- =====================================================================
-- P0-4: staff_accounts – admin utan org-filter
-- =====================================================================
DROP POLICY IF EXISTS "staff_accounts_select_admin_only" ON public.staff_accounts;
CREATE POLICY "staff_accounts_select_admin_only" ON public.staff_accounts
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND public.has_role('admin'::app_role, auth.uid()));

-- =====================================================================
-- P0-5: location_auto_start_runs – admin utan org-filter
-- =====================================================================
DROP POLICY IF EXISTS "Admins read auto-start runs" ON public.location_auto_start_runs;
CREATE POLICY "Admins read auto-start runs" ON public.location_auto_start_runs
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND public.has_role('admin'::app_role, auth.uid()));

-- =====================================================================
-- Fail-closed skyddsnät: RESTRICTIVE org-isolering.
-- Restriktiva policies AND:as med allt annat, så ingen framtida permissiv
-- policy kan öppna tabellen över organisationsgränsen.
-- service_role har BYPASSRLS och påverkas inte.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'day_attestations',
    'staff_gps_day_anchors',
    'staff_accounts',
    'location_auto_start_runs',
    'establishment_tasks',
    'establishment_task_comments',
    'ai_reality_corrections',
    'arrival_prompt_log',
    'assistant_events',
    'staff_day_decision_log',
    'staff_home_observations'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation_%1$s ON public.%1$I', t
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%1$s ON public.%1$I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (organization_id = public.get_user_organization_id(auth.uid())) '
      'WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()))', t
    );
  END LOOP;
END $$;

-- =====================================================================
-- P0-6: get_unseen_booking_updates saknade org-filter
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_unseen_booking_updates()
 RETURNS TABLE(booking_id text, assigned_project_id text, large_project_id uuid, last_change_at timestamp with time zone, change_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT public.get_user_organization_id(auth.uid()) AS org_id
  ),
  latest AS (
    SELECT bc.booking_id::text AS booking_id,
           MAX(bc.changed_at) AS last_change_at,
           COUNT(*)::int AS change_count
    FROM public.booking_changes bc, me
    WHERE bc.change_type IN ('update','status_change')
      AND bc.changed_by IN ('service_role','booking-import','booking-webhook')
      AND bc.organization_id = me.org_id
    GROUP BY bc.booking_id
  ),
  seen AS (
    SELECT booking_id, last_seen_at
    FROM public.booking_change_views
    WHERE user_id = auth.uid()
  )
  SELECT b.id::text,
         b.assigned_project_id::text,
         lpb.large_project_id,
         l.last_change_at,
         l.change_count
  FROM public.bookings b
  CROSS JOIN me
  JOIN latest l ON l.booking_id = b.id::text
  LEFT JOIN seen s ON s.booking_id = b.id::text
  LEFT JOIN public.large_project_bookings lpb
         ON lpb.booking_id::text = b.id::text
        AND lpb.organization_id = me.org_id
  WHERE me.org_id IS NOT NULL
    AND b.organization_id = me.org_id
    AND (b.assigned_project_id IS NOT NULL OR lpb.large_project_id IS NOT NULL)
    AND (s.last_seen_at IS NULL OR s.last_seen_at < l.last_change_at);
$function$;

-- =====================================================================
-- P0-7: interna worker-/underhållsfunktioner får inte anropas från klienten.
-- De körs av edge functions med service_role (BYPASSRLS) och behöver
-- därför inga klient-grants.
-- =====================================================================
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'claim_sync_jobs','complete_sync_job','fail_sync_job','finalize_sync_batch',
        'advance_booking_source_revision','apply_booking_cancellation_atomic',
        'auto_close_open_location_entries','cleanup_staff_location_history',
        'cleanup_non_rep_lp_calendar_events','cleanup_duplicate_calendar_events',
        'promote_stale_assistant_events','sync_all_phase_times','handle_booking_move',
        'auto_create_project_for_orphan_booking',
        'ensure_internal_project','ensure_internal_warehouse_project',
        'ensure_internal_lager_setup','ensure_internal_lager_booking',
        'archive_dm_thread','unarchive_dm_thread','archive_job_thread',
        'unarchive_job_thread','mark_job_thread_read','mark_day_timeline_dirty'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.sig);
  END LOOP;
END $$;

-- Publika hjälpfunktioner ska inte gå att anropa anonymt
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('get_unseen_booking_updates','mark_booking_changes_seen',
                        'lp_rep_booking_id','recompute_booking_staff_for_day',
                        'recompute_booking_staff_for_day_v2','upsert_task_calendar_event',
                        'compute_workday_review_status')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
  END LOOP;
END $$;

-- =====================================================================
-- P1: vy utan security_invoker kör med ägarens rättigheter (kringgår RLS)
-- =====================================================================
ALTER VIEW public.confirmed_bookings SET (security_invoker = on);