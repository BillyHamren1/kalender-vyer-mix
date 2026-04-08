
-- 1. Create booking_import_audit table for permanent import tracing
CREATE TABLE public.booking_import_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  booking_number text,
  source text NOT NULL DEFAULT 'unknown',
  request_organization_id uuid NOT NULL,
  external_organization_id uuid,
  resolved_organization_id uuid NOT NULL,
  org_match boolean NOT NULL DEFAULT true,
  action text NOT NULL DEFAULT 'insert',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by booking
CREATE INDEX idx_booking_import_audit_booking_id ON public.booking_import_audit(booking_id);
CREATE INDEX idx_booking_import_audit_org_match ON public.booking_import_audit(org_match) WHERE NOT org_match;
CREATE INDEX idx_booking_import_audit_created_at ON public.booking_import_audit(created_at);

-- RLS
ALTER TABLE public.booking_import_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit for their org"
  ON public.booking_import_audit FOR SELECT TO authenticated
  USING (resolved_organization_id = public.get_user_organization_id(auth.uid()));

-- 2. Add organization_id tracking to booking_changes trigger
-- This ensures we catch org_id changes going forward
CREATE OR REPLACE FUNCTION public.track_booking_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  changed_fields_json JSONB := '{}';
  previous_values_json JSONB := '{}';
  new_values_json JSONB := '{}';
  change_type_value TEXT := 'update';
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version 
  FROM public.booking_changes 
  WHERE booking_id = NEW.id;
  
  NEW.version := next_version;
  
  IF TG_OP = 'INSERT' THEN
    change_type_value := 'new';
    new_values_json := row_to_json(NEW)::JSONB;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      change_type_value := 'status_change';
    ELSIF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
      change_type_value := 'org_change';
    ELSE
      change_type_value := 'update';
    END IF;
    
    -- Track organization_id changes (CRITICAL for multi-tenant safety)
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
      changed_fields_json := changed_fields_json || '{"organization_id": true}';
      previous_values_json := previous_values_json || jsonb_build_object('organization_id', OLD.organization_id);
      new_values_json := new_values_json || jsonb_build_object('organization_id', NEW.organization_id);
    END IF;

    IF OLD.client IS DISTINCT FROM NEW.client THEN
      changed_fields_json := changed_fields_json || '{"client": true}';
      previous_values_json := previous_values_json || jsonb_build_object('client', OLD.client);
      new_values_json := new_values_json || jsonb_build_object('client', NEW.client);
    END IF;
    IF OLD.rigdaydate IS DISTINCT FROM NEW.rigdaydate THEN
      changed_fields_json := changed_fields_json || '{"rigdaydate": true}';
      previous_values_json := previous_values_json || jsonb_build_object('rigdaydate', OLD.rigdaydate);
      new_values_json := new_values_json || jsonb_build_object('rigdaydate', NEW.rigdaydate);
    END IF;
    IF OLD.eventdate IS DISTINCT FROM NEW.eventdate THEN
      changed_fields_json := changed_fields_json || '{"eventdate": true}';
      previous_values_json := previous_values_json || jsonb_build_object('eventdate', OLD.eventdate);
      new_values_json := new_values_json || jsonb_build_object('eventdate', NEW.eventdate);
    END IF;
    IF OLD.rigdowndate IS DISTINCT FROM NEW.rigdowndate THEN
      changed_fields_json := changed_fields_json || '{"rigdowndate": true}';
      previous_values_json := previous_values_json || jsonb_build_object('rigdowndate', OLD.rigdowndate);
      new_values_json := new_values_json || jsonb_build_object('rigdowndate', NEW.rigdowndate);
    END IF;
    IF OLD.rig_start_time IS DISTINCT FROM NEW.rig_start_time THEN
      changed_fields_json := changed_fields_json || '{"rig_start_time": true}';
      previous_values_json := previous_values_json || jsonb_build_object('rig_start_time', OLD.rig_start_time);
      new_values_json := new_values_json || jsonb_build_object('rig_start_time', NEW.rig_start_time);
    END IF;
    IF OLD.rig_end_time IS DISTINCT FROM NEW.rig_end_time THEN
      changed_fields_json := changed_fields_json || '{"rig_end_time": true}';
      previous_values_json := previous_values_json || jsonb_build_object('rig_end_time', OLD.rig_end_time);
      new_values_json := new_values_json || jsonb_build_object('rig_end_time', NEW.rig_end_time);
    END IF;
    IF OLD.event_start_time IS DISTINCT FROM NEW.event_start_time THEN
      changed_fields_json := changed_fields_json || '{"event_start_time": true}';
      previous_values_json := previous_values_json || jsonb_build_object('event_start_time', OLD.event_start_time);
      new_values_json := new_values_json || jsonb_build_object('event_start_time', NEW.event_start_time);
    END IF;
    IF OLD.event_end_time IS DISTINCT FROM NEW.event_end_time THEN
      changed_fields_json := changed_fields_json || '{"event_end_time": true}';
      previous_values_json := previous_values_json || jsonb_build_object('event_end_time', OLD.event_end_time);
      new_values_json := new_values_json || jsonb_build_object('event_end_time', NEW.event_end_time);
    END IF;
    IF OLD.rigdown_start_time IS DISTINCT FROM NEW.rigdown_start_time THEN
      changed_fields_json := changed_fields_json || '{"rigdown_start_time": true}';
      previous_values_json := previous_values_json || jsonb_build_object('rigdown_start_time', OLD.rigdown_start_time);
      new_values_json := new_values_json || jsonb_build_object('rigdown_start_time', NEW.rigdown_start_time);
    END IF;
    IF OLD.rigdown_end_time IS DISTINCT FROM NEW.rigdown_end_time THEN
      changed_fields_json := changed_fields_json || '{"rigdown_end_time": true}';
      previous_values_json := previous_values_json || jsonb_build_object('rigdown_end_time', OLD.rigdown_end_time);
      new_values_json := new_values_json || jsonb_build_object('rigdown_end_time', NEW.rigdown_end_time);
    END IF;
    IF OLD.assigned_project_id IS DISTINCT FROM NEW.assigned_project_id THEN
      changed_fields_json := changed_fields_json || '{"assigned_project_id": true}';
      previous_values_json := previous_values_json || jsonb_build_object('assigned_project_id', OLD.assigned_project_id);
      new_values_json := new_values_json || jsonb_build_object('assigned_project_id', NEW.assigned_project_id);
    END IF;
    IF OLD.assigned_project_name IS DISTINCT FROM NEW.assigned_project_name THEN
      changed_fields_json := changed_fields_json || '{"assigned_project_name": true}';
      previous_values_json := previous_values_json || jsonb_build_object('assigned_project_name', OLD.assigned_project_name);
      new_values_json := new_values_json || jsonb_build_object('assigned_project_name', NEW.assigned_project_name);
    END IF;
    IF OLD.assigned_to_project IS DISTINCT FROM NEW.assigned_to_project THEN
      changed_fields_json := changed_fields_json || '{"assigned_to_project": true}';
      previous_values_json := previous_values_json || jsonb_build_object('assigned_to_project', OLD.assigned_to_project);
      new_values_json := new_values_json || jsonb_build_object('assigned_to_project', NEW.assigned_to_project);
    END IF;
    IF OLD.deliveryaddress IS DISTINCT FROM NEW.deliveryaddress THEN
      changed_fields_json := changed_fields_json || '{"deliveryaddress": true}';
      previous_values_json := previous_values_json || jsonb_build_object('deliveryaddress', OLD.deliveryaddress);
      new_values_json := new_values_json || jsonb_build_object('deliveryaddress', NEW.deliveryaddress);
    END IF;
    IF OLD.delivery_city IS DISTINCT FROM NEW.delivery_city THEN
      changed_fields_json := changed_fields_json || '{"delivery_city": true}';
      previous_values_json := previous_values_json || jsonb_build_object('delivery_city', OLD.delivery_city);
      new_values_json := new_values_json || jsonb_build_object('delivery_city', NEW.delivery_city);
    END IF;
    IF OLD.delivery_postal_code IS DISTINCT FROM NEW.delivery_postal_code THEN
      changed_fields_json := changed_fields_json || '{"delivery_postal_code": true}';
      previous_values_json := previous_values_json || jsonb_build_object('delivery_postal_code', OLD.delivery_postal_code);
      new_values_json := new_values_json || jsonb_build_object('delivery_postal_code', NEW.delivery_postal_code);
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      changed_fields_json := changed_fields_json || '{"status": true}';
      previous_values_json := previous_values_json || jsonb_build_object('status', OLD.status);
      new_values_json := new_values_json || jsonb_build_object('status', NEW.status);
    END IF;
    IF OLD.carry_more_than_10m IS DISTINCT FROM NEW.carry_more_than_10m THEN
      changed_fields_json := changed_fields_json || '{"carry_more_than_10m": true}';
      previous_values_json := previous_values_json || jsonb_build_object('carry_more_than_10m', OLD.carry_more_than_10m);
      new_values_json := new_values_json || jsonb_build_object('carry_more_than_10m', NEW.carry_more_than_10m);
    END IF;
    IF OLD.ground_nails_allowed IS DISTINCT FROM NEW.ground_nails_allowed THEN
      changed_fields_json := changed_fields_json || '{"ground_nails_allowed": true}';
      previous_values_json := previous_values_json || jsonb_build_object('ground_nails_allowed', OLD.ground_nails_allowed);
      new_values_json := new_values_json || jsonb_build_object('ground_nails_allowed', NEW.ground_nails_allowed);
    END IF;
    IF OLD.exact_time_needed IS DISTINCT FROM NEW.exact_time_needed THEN
      changed_fields_json := changed_fields_json || '{"exact_time_needed": true}';
      previous_values_json := previous_values_json || jsonb_build_object('exact_time_needed', OLD.exact_time_needed);
      new_values_json := new_values_json || jsonb_build_object('exact_time_needed', NEW.exact_time_needed);
    END IF;
    IF OLD.exact_time_info IS DISTINCT FROM NEW.exact_time_info THEN
      changed_fields_json := changed_fields_json || '{"exact_time_info": true}';
      previous_values_json := previous_values_json || jsonb_build_object('exact_time_info', OLD.exact_time_info);
      new_values_json := new_values_json || jsonb_build_object('exact_time_info', NEW.exact_time_info);
    END IF;
    IF OLD.internalnotes IS DISTINCT FROM NEW.internalnotes THEN
      changed_fields_json := changed_fields_json || '{"internalnotes": true}';
      previous_values_json := previous_values_json || jsonb_build_object('internalnotes', OLD.internalnotes);
      new_values_json := new_values_json || jsonb_build_object('internalnotes', NEW.internalnotes);
    END IF;
    IF OLD.delivery_latitude IS DISTINCT FROM NEW.delivery_latitude OR OLD.delivery_longitude IS DISTINCT FROM NEW.delivery_longitude THEN
      changed_fields_json := changed_fields_json || '{"location": true}';
      previous_values_json := previous_values_json || jsonb_build_object('delivery_latitude', OLD.delivery_latitude, 'delivery_longitude', OLD.delivery_longitude);
      new_values_json := new_values_json || jsonb_build_object('delivery_latitude', NEW.delivery_latitude, 'delivery_longitude', NEW.delivery_longitude);
    END IF;
  END IF;
  
  IF change_type_value = 'new' OR jsonb_object_keys_array(changed_fields_json) <> '{}' THEN
    INSERT INTO public.booking_changes (
      booking_id,
      change_type,
      changed_fields,
      previous_values,
      new_values,
      version,
      changed_by,
      organization_id
    ) VALUES (
      NEW.id,
      change_type_value,
      changed_fields_json,
      previous_values_json,
      new_values_json,
      next_version,
      current_setting('app.current_user', TRUE)::TEXT,
      NEW.organization_id
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
