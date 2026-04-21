CREATE OR REPLACE FUNCTION public.track_warehouse_product_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id uuid;
  _wp RECORD;
  _change_type text;
  _product_name text;
  _old_qty numeric;
  _new_qty numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _booking_id := OLD.booking_id::uuid;
    _change_type := 'product_removed';
    _product_name := OLD.name;
  ELSIF TG_OP = 'INSERT' THEN
    _booking_id := NEW.booking_id::uuid;
    _change_type := 'product_added';
    _product_name := NEW.name;
  ELSIF TG_OP = 'UPDATE' THEN
    _booking_id := NEW.booking_id::uuid;
    IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      _change_type := 'quantity_changed';
      _product_name := NEW.name;
      _old_qty := OLD.quantity;
      _new_qty := NEW.quantity;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  FOR _wp IN
    SELECT DISTINCT wp.id, wp.organization_id
    FROM public.warehouse_projects wp
    WHERE
      wp.source_project_id IN (
        SELECT p.id FROM public.projects p WHERE p.booking_id = _booking_id::text
      )
      OR
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
$function$;