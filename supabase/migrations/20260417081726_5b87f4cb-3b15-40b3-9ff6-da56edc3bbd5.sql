-- Create warehouse_project_changes table
CREATE TABLE public.warehouse_project_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  warehouse_project_id uuid NOT NULL REFERENCES public.warehouse_projects(id) ON DELETE CASCADE,
  source_booking_id uuid,
  change_type text NOT NULL, -- 'product_added' | 'product_removed' | 'quantity_changed' | 'date_changed'
  field_name text,
  old_value text,
  new_value text,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wpc_org ON public.warehouse_project_changes(organization_id);
CREATE INDEX idx_wpc_project ON public.warehouse_project_changes(warehouse_project_id);
CREATE INDEX idx_wpc_unack ON public.warehouse_project_changes(organization_id, acknowledged) WHERE acknowledged = false;

ALTER TABLE public.warehouse_project_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view changes in their org"
ON public.warehouse_project_changes FOR SELECT
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert changes in their org"
ON public.warehouse_project_changes FOR INSERT
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update changes in their org"
ON public.warehouse_project_changes FOR UPDATE
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete changes in their org"
ON public.warehouse_project_changes FOR DELETE
USING (organization_id = public.get_user_organization_id(auth.uid()));

-- Helper: find warehouse_projects that source from a given booking_id (uuid)
-- Source path: warehouse_projects.source_project_id -> projects.id; projects.booking_id (text) = booking.id::text
-- Or via large_projects: warehouse_projects.source_large_project_id -> large_projects.id; bookings.large_project_id = large_projects.id

-- Trigger function for booking_products changes
CREATE OR REPLACE FUNCTION public.track_warehouse_product_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _booking_id uuid;
  _wp RECORD;
  _change_type text;
  _product_name text;
  _old_qty numeric;
  _new_qty numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _booking_id := OLD.booking_id;
    _change_type := 'product_removed';
    _product_name := OLD.name;
  ELSIF TG_OP = 'INSERT' THEN
    _booking_id := NEW.booking_id;
    _change_type := 'product_added';
    _product_name := NEW.name;
  ELSIF TG_OP = 'UPDATE' THEN
    _booking_id := NEW.booking_id;
    -- Only quantity changes matter (ignore prices)
    IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      _change_type := 'quantity_changed';
      _product_name := NEW.name;
      _old_qty := OLD.quantity;
      _new_qty := NEW.quantity;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Find all warehouse_projects linked to this booking
  FOR _wp IN
    SELECT DISTINCT wp.id, wp.organization_id
    FROM public.warehouse_projects wp
    WHERE
      -- via projects.booking_id (text)
      wp.source_project_id IN (
        SELECT p.id FROM public.projects p WHERE p.booking_id = _booking_id::text
      )
      OR
      -- via large_projects -> bookings.large_project_id
      wp.source_large_project_id IN (
        SELECT b.large_project_id FROM public.bookings b WHERE b.id = _booking_id AND b.large_project_id IS NOT NULL
      )
  LOOP
    INSERT INTO public.warehouse_project_changes (
      organization_id, warehouse_project_id, source_booking_id,
      change_type, field_name, old_value, new_value
    ) VALUES (
      _wp.organization_id, _wp.id, _booking_id,
      _change_type, _product_name,
      CASE WHEN _change_type = 'quantity_changed' THEN _old_qty::text ELSE NULL END,
      CASE WHEN _change_type = 'quantity_changed' THEN _new_qty::text
           WHEN _change_type = 'product_added' THEN NEW.quantity::text
           ELSE NULL END
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER track_warehouse_product_changes_trg
AFTER INSERT OR UPDATE OR DELETE ON public.booking_products
FOR EACH ROW EXECUTE FUNCTION public.track_warehouse_product_changes();

-- Trigger function for booking date changes
CREATE OR REPLACE FUNCTION public.track_warehouse_date_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _wp RECORD;
  _changed jsonb := '[]'::jsonb;
  _field text;
  _old text;
  _new text;
  _entry jsonb;
BEGIN
  IF OLD.eventdate IS DISTINCT FROM NEW.eventdate THEN
    _changed := _changed || jsonb_build_object('field', 'eventdate', 'old', OLD.eventdate::text, 'new', NEW.eventdate::text);
  END IF;
  IF OLD.rigdaydate IS DISTINCT FROM NEW.rigdaydate THEN
    _changed := _changed || jsonb_build_object('field', 'rigdaydate', 'old', OLD.rigdaydate::text, 'new', NEW.rigdaydate::text);
  END IF;
  IF OLD.rigdowndate IS DISTINCT FROM NEW.rigdowndate THEN
    _changed := _changed || jsonb_build_object('field', 'rigdowndate', 'old', OLD.rigdowndate::text, 'new', NEW.rigdowndate::text);
  END IF;

  IF jsonb_array_length(_changed) = 0 THEN
    RETURN NEW;
  END IF;

  FOR _wp IN
    SELECT DISTINCT wp.id, wp.organization_id
    FROM public.warehouse_projects wp
    WHERE
      wp.source_project_id IN (
        SELECT p.id FROM public.projects p WHERE p.booking_id = NEW.id::text
      )
      OR (
        NEW.large_project_id IS NOT NULL
        AND wp.source_large_project_id = NEW.large_project_id
      )
  LOOP
    FOR _entry IN SELECT * FROM jsonb_array_elements(_changed) LOOP
      INSERT INTO public.warehouse_project_changes (
        organization_id, warehouse_project_id, source_booking_id,
        change_type, field_name, old_value, new_value
      ) VALUES (
        _wp.organization_id, _wp.id, NEW.id,
        'date_changed', _entry->>'field', _entry->>'old', _entry->>'new'
      );
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER track_warehouse_date_changes_trg
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.track_warehouse_date_changes();

-- Realtime
ALTER TABLE public.warehouse_project_changes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_project_changes;