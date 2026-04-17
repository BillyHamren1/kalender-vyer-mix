-- ============================================================================
-- 1. Tabell: warehouse_projects
-- ============================================================================
CREATE TABLE public.warehouse_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_number text NOT NULL,
  name text NOT NULL,
  source_project_id uuid,
  source_large_project_id uuid REFERENCES public.large_projects(id) ON DELETE SET NULL,
  source_project_number text,
  status text NOT NULL DEFAULT 'planning',
  start_date date,
  end_date date,
  manager_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT warehouse_projects_status_check CHECK (status IN ('planning','in_progress','completed','cancelled')),
  CONSTRAINT warehouse_projects_org_number_unique UNIQUE (organization_id, project_number)
);

CREATE INDEX idx_warehouse_projects_org ON public.warehouse_projects(organization_id);
CREATE INDEX idx_warehouse_projects_source_project ON public.warehouse_projects(source_project_id);
CREATE INDEX idx_warehouse_projects_source_large ON public.warehouse_projects(source_large_project_id);
CREATE INDEX idx_warehouse_projects_status ON public.warehouse_projects(status);

ALTER TABLE public.warehouse_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view warehouse_projects in their org"
  ON public.warehouse_projects FOR SELECT
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert warehouse_projects in their org"
  ON public.warehouse_projects FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update warehouse_projects in their org"
  ON public.warehouse_projects FOR UPDATE
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete warehouse_projects in their org"
  ON public.warehouse_projects FOR DELETE
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER set_warehouse_projects_org
  BEFORE INSERT ON public.warehouse_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER update_warehouse_projects_updated_at
  BEFORE UPDATE ON public.warehouse_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. Tabell: warehouse_project_inbox
-- ============================================================================
CREATE TABLE public.warehouse_project_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_project_number text,
  client_name text,
  event_date date,
  status text NOT NULL DEFAULT 'new',
  warehouse_project_id uuid REFERENCES public.warehouse_projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT inbox_source_type_check CHECK (source_type IN ('project','large_project')),
  CONSTRAINT inbox_status_check CHECK (status IN ('new','converted','dismissed')),
  CONSTRAINT inbox_unique_source UNIQUE (source_type, source_id)
);

CREATE INDEX idx_warehouse_inbox_org ON public.warehouse_project_inbox(organization_id);
CREATE INDEX idx_warehouse_inbox_status ON public.warehouse_project_inbox(status);

ALTER TABLE public.warehouse_project_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inbox in their org"
  ON public.warehouse_project_inbox FOR SELECT
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert inbox in their org"
  ON public.warehouse_project_inbox FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update inbox in their org"
  ON public.warehouse_project_inbox FOR UPDATE
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete inbox in their org"
  ON public.warehouse_project_inbox FOR DELETE
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER set_warehouse_inbox_org
  BEFORE INSERT ON public.warehouse_project_inbox
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- ============================================================================
-- 3. Tabell: warehouse_project_tasks
-- ============================================================================
CREATE TABLE public.warehouse_project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_project_id uuid NOT NULL REFERENCES public.warehouse_projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  start_date date,
  end_date date,
  assigned_to uuid,
  status text NOT NULL DEFAULT 'planning',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wp_tasks_status_check CHECK (status IN ('planning','in_progress','completed','cancelled'))
);

CREATE INDEX idx_wp_tasks_project ON public.warehouse_project_tasks(warehouse_project_id);
CREATE INDEX idx_wp_tasks_org ON public.warehouse_project_tasks(organization_id);

ALTER TABLE public.warehouse_project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view wp_tasks in their org"
  ON public.warehouse_project_tasks FOR SELECT
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert wp_tasks in their org"
  ON public.warehouse_project_tasks FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update wp_tasks in their org"
  ON public.warehouse_project_tasks FOR UPDATE
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete wp_tasks in their org"
  ON public.warehouse_project_tasks FOR DELETE
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TRIGGER set_wp_tasks_org
  BEFORE INSERT ON public.warehouse_project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER update_wp_tasks_updated_at
  BEFORE UPDATE ON public.warehouse_project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. Lägg till warehouse_project_id på packing_projects
-- ============================================================================
ALTER TABLE public.packing_projects
  ADD COLUMN IF NOT EXISTS warehouse_project_id uuid REFERENCES public.warehouse_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packing_projects_warehouse_project
  ON public.packing_projects(warehouse_project_id);

-- ============================================================================
-- 5. Numreringsfunktion för lagerprojekt
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_warehouse_project_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  date_prefix TEXT;
  seq_num INT;
BEGIN
  IF NEW.project_number IS NOT NULL AND NEW.project_number <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.source_project_number IS NOT NULL AND NEW.source_project_number <> '' THEN
    NEW.project_number := 'Lager-' || NEW.source_project_number;
  ELSE
    date_prefix := to_char(now(), 'YYMMDD');
    SELECT COUNT(*) + 1 INTO seq_num
    FROM public.warehouse_projects
    WHERE organization_id = NEW.organization_id
      AND project_number LIKE 'Lager-' || date_prefix || '-Fritt%';
    NEW.project_number := 'Lager-' || date_prefix || '-Fritt' || LPAD(seq_num::TEXT, 2, '0');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_warehouse_project_number
  BEFORE INSERT ON public.warehouse_projects
  FOR EACH ROW EXECUTE FUNCTION public.generate_warehouse_project_number();

-- ============================================================================
-- 6. Trigger: nytt projekt → inbox-rad
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_warehouse_on_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _booking RECORD;
  _client text;
  _event_date date;
  _project_number text;
BEGIN
  -- Resolve booking info if linked
  IF NEW.booking_id IS NOT NULL THEN
    SELECT client, eventdate, booking_number
    INTO _booking
    FROM public.bookings
    WHERE id::text = NEW.booking_id;
    _client := _booking.client;
    _event_date := _booking.eventdate::date;
    _project_number := _booking.booking_number;
  ELSE
    _client := NEW.name;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id, source_type, source_id,
    source_project_number, client_name, event_date, status
  )
  VALUES (
    NEW.organization_id, 'project', NEW.id,
    _project_number, _client, _event_date, 'new'
  )
  ON CONFLICT (source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_warehouse_on_new_project
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_warehouse_on_new_project();

-- ============================================================================
-- 7. Trigger: nytt stort projekt → inbox-rad
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_warehouse_on_new_large_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_date date;
BEGIN
  IF NEW.event_date IS NOT NULL AND array_length(NEW.event_date, 1) > 0 THEN
    SELECT min(d::date) INTO _event_date FROM unnest(NEW.event_date) AS d WHERE d IS NOT NULL;
  END IF;

  INSERT INTO public.warehouse_project_inbox (
    organization_id, source_type, source_id,
    source_project_number, client_name, event_date, status
  )
  VALUES (
    NEW.organization_id, 'large_project', NEW.id,
    NEW.project_number, NEW.name, _event_date, 'new'
  )
  ON CONFLICT (source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_warehouse_on_new_large_project
  AFTER INSERT ON public.large_projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_warehouse_on_new_large_project();

-- ============================================================================
-- 8. Modifiera sync_packing_on_booking_change – ta bort auto-INSERT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_packing_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  packing_name TEXT;
  event_date_str TEXT;
  upper_status TEXT;
  is_consolidated BOOLEAN;
  lp_start DATE;
  lp_end DATE;
  lp_id UUID;
  has_changes BOOLEAN := false;
BEGIN
  upper_status := UPPER(COALESCE(NEW.status, ''));

  IF NEW.eventdate IS NOT NULL THEN
    event_date_str := to_char(NEW.eventdate::date, 'YYYY-MM-DD');
    packing_name := COALESCE(NEW.client, 'Okänd kund') || ' - ' || event_date_str;
  ELSE
    packing_name := COALESCE(NEW.client, 'Okänd kund');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    has_changes := (
      OLD.client IS DISTINCT FROM NEW.client OR
      OLD.rigdaydate IS DISTINCT FROM NEW.rigdaydate OR
      OLD.eventdate IS DISTINCT FROM NEW.eventdate OR
      OLD.rigdowndate IS DISTINCT FROM NEW.rigdowndate OR
      OLD.deliveryaddress IS DISTINCT FROM NEW.deliveryaddress OR
      OLD.internalnotes IS DISTINCT FROM NEW.internalnotes OR
      OLD.status IS DISTINCT FROM NEW.status OR
      OLD.rig_start_time IS DISTINCT FROM NEW.rig_start_time OR
      OLD.rig_end_time IS DISTINCT FROM NEW.rig_end_time OR
      OLD.event_start_time IS DISTINCT FROM NEW.event_start_time OR
      OLD.event_end_time IS DISTINCT FROM NEW.event_end_time OR
      OLD.rigdown_start_time IS DISTINCT FROM NEW.rigdown_start_time OR
      OLD.rigdown_end_time IS DISTINCT FROM NEW.rigdown_end_time OR
      OLD.carry_more_than_10m IS DISTINCT FROM NEW.carry_more_than_10m OR
      OLD.ground_nails_allowed IS DISTINCT FROM NEW.ground_nails_allowed OR
      OLD.exact_time_needed IS DISTINCT FROM NEW.exact_time_needed OR
      OLD.exact_time_info IS DISTINCT FROM NEW.exact_time_info
    );
  END IF;

  SELECT pp.large_project_id INTO lp_id
  FROM public.packing_projects pp
  WHERE pp.booking_id = NEW.id
    AND pp.organization_id = NEW.organization_id
    AND pp.large_project_id IS NOT NULL
  LIMIT 1;

  is_consolidated := (lp_id IS NOT NULL);

  IF is_consolidated THEN
    SELECT
      (SELECT min(d::date) FROM unnest(lp.start_date) AS d WHERE d IS NOT NULL),
      (SELECT max(d::date) FROM unnest(lp.end_date) AS d WHERE d IS NOT NULL)
    INTO lp_start, lp_end
    FROM public.large_projects lp
    WHERE lp.id = lp_id;

    UPDATE public.packing_projects
    SET start_date = lp_start,
        end_date = COALESCE(lp_end, lp_start),
        updated_at = now(),
        needs_packing_review = CASE WHEN has_changes THEN true ELSE needs_packing_review END,
        needs_packing_review_reason = CASE WHEN has_changes THEN 'booking_updated' ELSE needs_packing_review_reason END
    WHERE booking_id = NEW.id
      AND organization_id = NEW.organization_id
      AND large_project_id IS NOT NULL;

    RETURN NEW;
  END IF;

  IF upper_status = 'CANCELLED' THEN
    UPDATE public.packing_projects
    SET status = 'cancelled',
        name = packing_name,
        client_name = NEW.client,
        start_date = NEW.rigdaydate::date,
        end_date = NEW.rigdowndate::date,
        delivery_address = NEW.deliveryaddress,
        notes = NEW.internalnotes,
        updated_at = now(),
        needs_packing_review = true,
        needs_packing_review_reason = 'cancelled'
    WHERE booking_id = NEW.id
      AND organization_id = NEW.organization_id;
    RETURN NEW;
  END IF;

  -- Update existing packings only (no auto-insert)
  UPDATE public.packing_projects
  SET name = packing_name,
      client_name = NEW.client,
      start_date = NEW.rigdaydate::date,
      end_date = NEW.rigdowndate::date,
      delivery_address = NEW.deliveryaddress,
      notes = NEW.internalnotes,
      updated_at = now(),
      needs_packing_review = CASE WHEN has_changes THEN true ELSE needs_packing_review END,
      needs_packing_review_reason = CASE WHEN has_changes THEN 'booking_updated' ELSE needs_packing_review_reason END
  WHERE booking_id = NEW.id
    AND organization_id = NEW.organization_id;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 9. Realtime publication
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_project_inbox;
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_project_tasks;
ALTER TABLE public.warehouse_projects REPLICA IDENTITY FULL;
ALTER TABLE public.warehouse_project_inbox REPLICA IDENTITY FULL;
ALTER TABLE public.warehouse_project_tasks REPLICA IDENTITY FULL;