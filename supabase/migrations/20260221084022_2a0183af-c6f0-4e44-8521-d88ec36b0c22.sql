
-- =============================================
-- PROMPT D: Triggers + RLS cleanup + search_path
-- =============================================

-- 1. Add set_org_id trigger to 15 tables missing it
CREATE TRIGGER set_org_id BEFORE INSERT ON public.staff_accounts FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.staff_assignments FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.staff_availability FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.staff_job_affinity FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.sync_state FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.time_reports FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.transport_assignments FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.transport_email_log FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.vehicle_gps_history FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.warehouse_calendar_events FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER set_org_id BEFORE INSERT ON public.webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- 2. Drop old permissive "always true" policies (keep the restrictive org_filter ones)
DROP POLICY IF EXISTS "Allow all access to staff_members" ON public.staff_members;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.staff_members;
DROP POLICY IF EXISTS "Allow all access to task_comments" ON public.task_comments;
DROP POLICY IF EXISTS "Allow all operations on time_reports" ON public.time_reports;
DROP POLICY IF EXISTS "Allow all operations on warehouse_calendar_events" ON public.warehouse_calendar_events;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.webhook_subscriptions;
DROP POLICY IF EXISTS "Authenticated users can read email logs" ON public.transport_email_log;
DROP POLICY IF EXISTS "Service role can insert email logs" ON public.transport_email_log;

-- 3. Add permissive grant policies that work WITH the restrictive org_filter
-- staff_members: authenticated users within their org can do all ops
CREATE POLICY "Authenticated users can access staff_members"
  ON public.staff_members FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- task_comments: same pattern (restrictive org_filter already gates it)
CREATE POLICY "Authenticated users can access task_comments"
  ON public.task_comments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- time_reports
CREATE POLICY "Authenticated users can access time_reports"
  ON public.time_reports FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- warehouse_calendar_events
CREATE POLICY "Authenticated users can access warehouse_calendar_events"
  ON public.warehouse_calendar_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- webhook_subscriptions
CREATE POLICY "Authenticated users can access webhook_subscriptions"
  ON public.webhook_subscriptions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- transport_email_log: authenticated can SELECT within org, service can INSERT within org
CREATE POLICY "Authenticated users can read transport_email_log"
  ON public.transport_email_log FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert transport_email_log"
  ON public.transport_email_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- 4. Fix functions with mutable search_path
CREATE OR REPLACE FUNCTION public.cleanup_duplicate_calendar_events()
RETURNS TABLE(booking_id_result text, event_type_result text, duplicates_removed integer)
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
DECLARE
  rec RECORD;
  duplicate_count integer;
BEGIN
  FOR rec IN 
    SELECT ce.booking_id, ce.event_type, COUNT(*) as event_count
    FROM calendar_events ce 
    WHERE ce.booking_id IS NOT NULL
    GROUP BY ce.booking_id, ce.event_type
    HAVING COUNT(*) > 1
  LOOP
    WITH events_to_delete AS (
      SELECT ce.id
      FROM calendar_events ce
      WHERE ce.booking_id = rec.booking_id 
      AND ce.event_type = rec.event_type
      ORDER BY ce.created_at DESC
      OFFSET 1
    )
    DELETE FROM calendar_events 
    WHERE id IN (SELECT id FROM events_to_delete);
    
    GET DIAGNOSTICS duplicate_count = ROW_COUNT;
    
    booking_id_result := rec.booking_id;
    event_type_result := rec.event_type;
    duplicates_removed := duplicate_count;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_booking_move(p_booking_id text, p_old_team_id text, p_new_team_id text, p_old_date date, p_new_date date)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
DECLARE
  affected_staff TEXT[];
  conflicts JSONB := '[]'::JSONB;
  staff_record RECORD;
BEGIN
  SELECT ARRAY_AGG(DISTINCT staff_id) INTO affected_staff
  FROM public.booking_staff_assignments
  WHERE booking_id = p_booking_id AND assignment_date = p_old_date;
  
  DELETE FROM public.booking_staff_assignments
  WHERE booking_id = p_booking_id AND assignment_date = p_old_date;
  
  FOR staff_record IN SELECT UNNEST(affected_staff) as staff_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_assignments 
      WHERE staff_id = staff_record.staff_id AND team_id = p_new_team_id AND assignment_date = p_new_date
    ) THEN
      conflicts := conflicts || jsonb_build_object(
        'staff_id', staff_record.staff_id, 'reason', 'not_assigned_to_team',
        'old_team', p_old_team_id, 'new_team', p_new_team_id, 'date', p_new_date
      );
    ELSE
      INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
      VALUES (p_booking_id, staff_record.staff_id, p_new_team_id, p_new_date)
      ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('affected_staff', affected_staff, 'conflicts', conflicts, 'success', jsonb_array_length(conflicts) = 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_booking_staff_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'staff_assignments' THEN
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM public.booking_staff_assignments WHERE staff_id = OLD.staff_id AND assignment_date = OLD.assignment_date;
    END IF;
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.booking_staff_assignments WHERE staff_id = OLD.staff_id AND assignment_date = OLD.assignment_date;
      RETURN OLD;
    END IF;
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
    SELECT DISTINCT ce.booking_id, NEW.staff_id, NEW.team_id, NEW.assignment_date
    FROM public.calendar_events ce
    WHERE ce.resource_id = NEW.team_id AND ce.booking_id IS NOT NULL AND DATE(ce.start_time) = NEW.assignment_date
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'calendar_events' THEN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.booking_id IS DISTINCT FROM NEW.booking_id) THEN
      DELETE FROM public.booking_staff_assignments WHERE booking_id = OLD.booking_id AND assignment_date = DATE(OLD.start_time);
    END IF;
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.booking_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.booking_staff_assignments (booking_id, staff_id, team_id, assignment_date)
    SELECT DISTINCT NEW.booking_id, sa.staff_id, sa.team_id, sa.assignment_date
    FROM public.staff_assignments sa
    WHERE sa.team_id = NEW.resource_id AND sa.assignment_date = DATE(NEW.start_time)
    ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
