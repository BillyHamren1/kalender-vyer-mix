-- Additive classification. NULL preserves legacy clients and existing rows.
ALTER TABLE public.projects
 ADD COLUMN project_kind text CHECK (project_kind IN ('customer','internal_project','internal_activity')),
 ADD COLUMN budget_hours numeric CHECK (budget_hours >= 0 AND budget_hours <= 1000000000),
 ADD COLUMN budget_cost_minor bigint CHECK (budget_cost_minor >= 0 AND budget_cost_minor <= 9007199254740991),
 ADD COLUMN budget_currency text CHECK (budget_currency IN ('SEK')),
 ADD COLUMN remaining_hours numeric CHECK (remaining_hours >= 0 AND remaining_hours <= 1000000000),
 ADD COLUMN remaining_cost_minor bigint CHECK (remaining_cost_minor >= 0 AND remaining_cost_minor <= 9007199254740991),
 ADD COLUMN internal_goal text,
 ADD COLUMN followup_note text,
 ADD CONSTRAINT legacy_internal_kind CHECK (NOT is_internal OR project_kind IS NULL OR project_kind = 'internal_activity'),
 ADD CONSTRAINT internal_budget_currency CHECK (project_kind IS DISTINCT FROM 'internal_project' OR budget_currency IS NOT NULL),
 ADD CONSTRAINT finite_internal_no_booking CHECK (project_kind IS DISTINCT FROM 'internal_project' OR (booking_id IS NULL AND is_internal = false));

-- No new grants/policies: existing tenant RLS remains authoritative.
-- Block billing at the database boundary, including old clients.
CREATE OR REPLACE FUNCTION public.reject_internal_project_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 -- Serialize classification changes against billing inserts.
 PERFORM 1 FROM public.projects WHERE id::text=NEW.project_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF NEW.project_type='medium' AND NOT FOUND THEN
   RAISE EXCEPTION 'Projektet saknas eller tillhör en annan organisation';
 END IF;
 IF EXISTS (
   SELECT 1 FROM public.projects p WHERE p.id::text = NEW.project_id
   AND (COALESCE(p.project_kind, CASE WHEN p.is_internal THEN 'internal_activity' ELSE 'customer' END) <> 'customer')
 ) THEN RAISE EXCEPTION 'Interna projekt får inte faktureras'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER reject_internal_project_billing BEFORE INSERT OR UPDATE ON public.project_billing
 FOR EACH ROW EXECUTE FUNCTION public.reject_internal_project_billing();

-- Do not let a billed commercial project be relabelled internal.
CREATE OR REPLACE FUNCTION public.guard_internal_project_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF TG_OP='UPDATE' AND COALESCE(OLD.project_kind,CASE WHEN OLD.is_internal THEN 'internal_activity' ELSE 'customer' END)<>'customer'
   AND COALESCE(NEW.project_kind,CASE WHEN NEW.is_internal THEN 'internal_activity' ELSE 'customer' END)='customer' THEN
   RAISE EXCEPTION 'Intern klassificering kan inte tas bort utan separat konvertering';
 END IF;
 IF NEW.project_kind = 'internal_activity' AND NEW.booking_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.bookings b WHERE b.id=NEW.booking_id AND b.organization_id=NEW.organization_id AND b.is_internal=true AND b.internal_type='warehouse'
 ) THEN RAISE EXCEPTION 'Intern aktivitet får endast kopplas till lagerbokning'; END IF;
 IF COALESCE(NEW.project_kind, CASE WHEN NEW.is_internal THEN 'internal_activity' ELSE 'customer' END) <> 'customer' AND EXISTS (
 SELECT 1 FROM public.project_billing b WHERE b.project_id = NEW.id::text
 ) THEN RAISE EXCEPTION 'Projekt med faktureringsunderlag kan inte ändras till internt'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_internal_project_classification BEFORE INSERT OR UPDATE OF project_kind, is_internal, booking_id, organization_id ON public.projects
 FOR EACH ROW EXECUTE FUNCTION public.guard_internal_project_classification();

CREATE OR REPLACE FUNCTION public.ensure_internal_lager_setup(_org_id uuid, _location_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _booking_id text;
  _project_id uuid;
  _booking_number text;
BEGIN
  IF current_setting('role', true) NOT IN ('service_role', 'none') AND (auth.uid() IS NULL OR _org_id IS DISTINCT FROM public.get_user_organization_id(auth.uid())) THEN
    RAISE EXCEPTION 'Organization access denied';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 172));
  SELECT id INTO _booking_id
  FROM public.bookings
  WHERE organization_id = _org_id AND is_internal = true AND internal_type = 'warehouse'
  LIMIT 1;

  IF _booking_id IS NULL THEN
    _booking_id := gen_random_uuid()::text;
    _booking_number := 'LAGER-' || substr(_org_id::text, 1, 8);
    INSERT INTO public.bookings (
      id, organization_id, client, status, is_internal, internal_type,
      booking_number, eventdate, assigned_to_project
    ) VALUES (
      _booking_id, _org_id, 'Lager', 'CONFIRMED', true, 'warehouse',
      _booking_number, CURRENT_DATE, true
    );
  ELSE
    UPDATE public.bookings SET assigned_to_project = true
    WHERE id = _booking_id AND (assigned_to_project IS NULL OR assigned_to_project = false);
  END IF;

  SELECT id INTO _project_id
  FROM public.projects
  WHERE organization_id = _org_id AND is_internal = true AND booking_id = _booking_id
  LIMIT 1;

  IF _project_id IS NULL THEN
    _project_id := gen_random_uuid();
    INSERT INTO public.projects (
      id, organization_id, name, is_internal, location_id, booking_id, status
    ) VALUES (
      _project_id, _org_id, 'Lager', true, _location_id, _booking_id, 'in_progress'
    );
  ELSE
    UPDATE public.projects
    SET booking_id = COALESCE(booking_id, _booking_id),
        location_id = COALESCE(location_id, _location_id)
    WHERE id = _project_id;
  END IF;

  RETURN _booking_id;
END;
$$;


-- Operational completion checks apply to direct writes as well as the UI.
CREATE OR REPLACE FUNCTION public.check_internal_operational_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF NEW.project_kind = 'internal_project' AND NEW.status = 'completed'  THEN
   IF EXISTS (SELECT 1 FROM public.project_tasks WHERE project_id=NEW.id AND completed=false AND is_info_only=false) THEN
     RAISE EXCEPTION 'Slutför projektets uppgifter före avslut';
   END IF;
   IF NEW.remaining_hours IS DISTINCT FROM 0 OR NEW.remaining_cost_minor IS DISTINCT FROM 0 THEN
     RAISE EXCEPTION 'Bekräfta att återstående arbete och kostnad är noll före avslut';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER check_internal_operational_completion BEFORE INSERT OR UPDATE OF status, project_kind, remaining_hours, remaining_cost_minor ON public.projects
 FOR EACH ROW EXECUTE FUNCTION public.check_internal_operational_completion();

REVOKE ALL ON FUNCTION public.ensure_internal_lager_setup(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_internal_lager_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_internal_lager_setup(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_internal_lager_booking(uuid) TO authenticated, service_role;
