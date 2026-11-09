ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS parent_booking_id text,
  ADD COLUMN IF NOT EXISTS addition_number integer;

CREATE INDEX IF NOT EXISTS bookings_org_parent_booking_idx
  ON public.bookings (organization_id, parent_booking_id)
  WHERE parent_booking_id IS NOT NULL;

-- Additions never become the large-project calendar representative.
CREATE OR REPLACE FUNCTION public.lp_rep_booking_id(_lp uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT MIN(bid) FROM (
       SELECT booking_id AS bid FROM public.large_project_bookings WHERE large_project_id = _lp
       UNION
       SELECT id::text FROM public.bookings WHERE large_project_id = _lp
     ) s
     WHERE bid IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.bookings a WHERE a.id = s.bid AND a.parent_booking_id IS NOT NULL)),
    (SELECT MIN(bid) FROM (
       SELECT booking_id AS bid FROM public.large_project_bookings WHERE large_project_id = _lp
       UNION
       SELECT id::text FROM public.bookings WHERE large_project_id = _lp
     ) s2 WHERE bid IS NOT NULL)
  )
$function$;

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

  -- Tenant-scoped root lookup only. A root in another tenant is indistinguishable
  -- from a not-yet-synced root and is never attached.
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

  -- Root operational target: large project first, then active normal project.
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
       AND p.deleted_at IS NULL AND p.status NOT IN ('cancelled','completed')
     ORDER BY p.created_at DESC LIMIT 1;
  END IF;

  -- Child's current explicit assignment.
  v_child_lp := v_child.large_project_id;
  IF v_child_lp IS NULL THEN
    SELECT lpb.large_project_id INTO v_child_lp FROM public.large_project_bookings lpb
     WHERE lpb.booking_id = v_child.id AND lpb.organization_id = p_organization_id LIMIT 1;
  END IF;
  SELECT p.id INTO v_child_own_proj FROM public.projects p
   WHERE p.booking_id = v_child.id AND p.organization_id = p_organization_id
     AND p.deleted_at IS NULL AND p.status NOT IN ('cancelled','completed') LIMIT 1;

  IF v_child_own_proj IS NOT NULL
     OR (v_child_lp IS NOT NULL AND v_child_lp IS DISTINCT FROM v_lp)
     OR (v_child_lp IS NULL AND v_child.assigned_project_id IS NOT NULL
         AND v_child.assigned_project_id IS DISTINCT FROM v_proj) THEN
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
    IF v_child.assigned_project_id = v_proj THEN
      RETURN jsonb_build_object('ok', true, 'outcome', 'already_attached', 'target', 'project', 'target_id', v_proj);
    END IF;
    UPDATE public.bookings
       SET assigned_to_project = true, assigned_project_id = v_proj,
           assigned_project_name = 'Projekt: ' || COALESCE(v_proj_name, 'Projekt')
     WHERE id = v_child.id AND organization_id = p_organization_id;
    RETURN jsonb_build_object('ok', true, 'outcome', 'attached', 'target', 'project', 'target_id', v_proj);
  END IF;

  RETURN jsonb_build_object('ok', false, 'outcome', 'root_unassigned', 'retryable', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_booking_addition(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_booking_addition(uuid, text, text, integer) TO service_role;