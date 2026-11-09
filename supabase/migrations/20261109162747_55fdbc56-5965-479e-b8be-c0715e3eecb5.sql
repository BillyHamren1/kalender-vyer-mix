CREATE OR REPLACE FUNCTION public.attach_booking_addition(
  p_organization_id uuid,
  p_child_booking_id text,
  p_root_booking_id text,
  p_addition_number integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_child public.bookings%ROWTYPE;
  v_root public.bookings%ROWTYPE;
  v_lp uuid;
  v_proj uuid;
  v_proj_name text;
  v_child_lp uuid;
  v_child_own_proj uuid;
  v_next int;
BEGIN
  IF p_organization_id IS NULL OR nullif(btrim(coalesce(p_child_booking_id,'')),'') IS NULL
     OR nullif(btrim(coalesce(p_root_booking_id,'')),'') IS NULL
     OR p_child_booking_id = p_root_booking_id
     OR (p_addition_number IS NOT NULL AND p_addition_number < 1) THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'invalid_group', 'retryable', false);
  END IF;

  SELECT * INTO v_child FROM public.bookings
   WHERE id = p_child_booking_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'child_missing', 'retryable', true);
  END IF;
  IF v_child.parent_booking_id IS NOT NULL AND v_child.parent_booking_id <> p_root_booking_id THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'parent_conflict', 'retryable', false);
  END IF;

  SELECT * INTO v_root FROM public.bookings
   WHERE id = p_root_booking_id AND organization_id = p_organization_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'root_unavailable', 'retryable', true);
  END IF;
  IF v_root.parent_booking_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'root_is_addition', 'retryable', false);
  END IF;

  UPDATE public.bookings
     SET parent_booking_id = p_root_booking_id,
         addition_number = COALESCE(p_addition_number, addition_number)
   WHERE id = v_child.id AND organization_id = p_organization_id
     AND (parent_booking_id IS DISTINCT FROM p_root_booking_id
          OR (p_addition_number IS NOT NULL AND addition_number IS DISTINCT FROM p_addition_number));

  IF v_child.status IS DISTINCT FROM 'CONFIRMED' THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'linked_not_confirmed', 'retryable', false);
  END IF;

  v_lp := v_root.large_project_id;
  IF v_lp IS NULL THEN
    SELECT lpb.large_project_id INTO v_lp FROM public.large_project_bookings lpb
     WHERE lpb.booking_id = v_root.id AND lpb.organization_id = p_organization_id LIMIT 1;
  END IF;
  IF v_lp IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.large_projects lp
        WHERE lp.id = v_lp AND lp.organization_id = p_organization_id AND lp.deleted_at IS NULL) THEN
    v_lp := NULL;
  END IF;
  IF v_lp IS NULL THEN
    SELECT p.id, p.name INTO v_proj, v_proj_name FROM public.projects p
     WHERE p.booking_id = v_root.id AND p.organization_id = p_organization_id
       AND p.deleted_at IS NULL AND p.status IS DISTINCT FROM 'cancelled'
     ORDER BY p.created_at DESC LIMIT 1;
  END IF;

  v_child_lp := v_child.large_project_id;
  IF v_child_lp IS NULL THEN
    SELECT lpb.large_project_id INTO v_child_lp FROM public.large_project_bookings lpb
     WHERE lpb.booking_id = v_child.id AND lpb.organization_id = p_organization_id LIMIT 1;
  END IF;
  SELECT p.id INTO v_child_own_proj FROM public.projects p
   WHERE p.booking_id = v_child.id AND p.organization_id = p_organization_id
     AND p.deleted_at IS NULL AND p.status IS DISTINCT FROM 'cancelled' LIMIT 1;

  IF v_child_own_proj IS NOT NULL
     OR (v_child_lp IS NOT NULL AND v_child_lp IS DISTINCT FROM v_lp)
     OR (v_child_lp IS NULL AND v_child.assigned_project_id IS NOT NULL
         AND v_child.assigned_project_id IS DISTINCT FROM v_proj::text) THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'explicit_assignment_conflict', 'retryable', false);
  END IF;

  IF v_lp IS NOT NULL THEN
    IF v_child_lp = v_lp THEN
      RETURN jsonb_build_object('ok', true, 'outcome', 'already_attached', 'target', 'large_project', 'target_id', v_lp);
    END IF;
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
      FROM public.large_project_bookings WHERE large_project_id = v_lp;
    INSERT INTO public.large_project_bookings (large_project_id, booking_id, sort_order, organization_id)
    VALUES (v_lp, v_child.id, v_next, p_organization_id);
    UPDATE public.bookings SET large_project_id = v_lp, assigned_to_project = true
     WHERE id = v_child.id AND organization_id = p_organization_id;
    RETURN jsonb_build_object('ok', true, 'outcome', 'attached', 'target', 'large_project', 'target_id', v_lp);
  END IF;

  IF v_proj IS NOT NULL THEN
    IF v_child.assigned_project_id = v_proj::text THEN
      RETURN jsonb_build_object('ok', true, 'outcome', 'already_attached', 'target', 'project', 'target_id', v_proj);
    END IF;
    UPDATE public.bookings
       SET assigned_to_project = true, assigned_project_id = v_proj::text,
           assigned_project_name = 'Projekt: ' || COALESCE(v_proj_name, 'Projekt')
     WHERE id = v_child.id AND organization_id = p_organization_id;
    RETURN jsonb_build_object('ok', true, 'outcome', 'attached', 'target', 'project', 'target_id', v_proj);
  END IF;

  RETURN jsonb_build_object('ok', false, 'outcome', 'root_unassigned', 'retryable', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_booking_addition(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_booking_addition(uuid, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_pending_booking_additions(p_organization_id uuid, p_root_booking_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_child record;
  v_n int := 0;
BEGIN
  IF p_organization_id IS NULL OR p_root_booking_id IS NULL THEN RETURN 0; END IF;
  FOR v_child IN
    SELECT b.id FROM public.bookings b
     WHERE b.organization_id = p_organization_id
       AND b.parent_booking_id = p_root_booking_id
       AND b.status = 'CONFIRMED'
       AND b.large_project_id IS NULL
       AND b.assigned_project_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.large_project_bookings l
                        WHERE l.booking_id = b.id AND l.organization_id = p_organization_id)
  LOOP
    PERFORM public.enqueue_booking_sync_job(v_child.id, p_organization_id::text, 'booking.updated');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.enqueue_pending_booking_additions(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_pending_booking_additions(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_enqueue_additions_on_root_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.booking_id IS NOT NULL AND NEW.organization_id IS NOT NULL THEN
    IF TG_TABLE_NAME = 'projects' AND (NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled') THEN
      RETURN NEW;
    END IF;
    PERFORM public.enqueue_pending_booking_additions(NEW.organization_id, NEW.booking_id);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_enqueue_additions_on_root_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enqueue_additions_on_root_project ON public.projects;
CREATE TRIGGER enqueue_additions_on_root_project
  AFTER INSERT OR UPDATE OF booking_id, status, deleted_at ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_additions_on_root_assignment();

DROP TRIGGER IF EXISTS enqueue_additions_on_root_large_project ON public.large_project_bookings;
CREATE TRIGGER enqueue_additions_on_root_large_project
  AFTER INSERT ON public.large_project_bookings
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_additions_on_root_assignment();