-- Commercial deletion must not erase physical packing/return obligations.
ALTER TABLE public.packing_list_items ADD COLUMN IF NOT EXISTS retired_from_booking_at timestamptz;

CREATE OR REPLACE FUNCTION public.preserve_progressed_packing_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF coalesce(OLD.quantity_packed,0) > 0 OR coalesce(OLD.quantity_returned,0) > 0
    OR OLD.packed_at IS NOT NULL OR OLD.returned_at IS NOT NULL
    OR OLD.verified_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.packing_list_item_allocations a
      WHERE a.organization_id = OLD.organization_id AND a.packing_list_item_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.packing_projects p WHERE p.id = OLD.packing_id
      AND p.organization_id = OLD.organization_id
      AND (p.signed_at IS NOT NULL OR p.control_started_at IS NOT NULL
        OR p.status IN ('packed','delivered','completed','returned')))
  THEN
    SELECT name INTO v_name FROM public.booking_products WHERE id = OLD.booking_product_id;
    -- Keep the original operational row and allocations. Do not mark excluded:
    -- outstanding equipment must remain visible in packing/return screens.
    UPDATE public.packing_list_items SET booking_product_id = NULL,
      manual_name = coalesce(manual_name, v_name, 'Borttagen bokningsrad – lageruppföljning'),
      retired_from_booking_at = coalesce(retired_from_booking_at, now()),
      notes = CASE WHEN retired_from_booking_at IS NULL THEN
        concat_ws(E'\n', notes, 'Borttagen från bokningen. Kontrollera packning och retur innan raden avslutas.') ELSE notes END
    WHERE id = OLD.id AND organization_id = OLD.organization_id;
    UPDATE public.packing_projects SET needs_packing_review = true,
      needs_packing_review_reason = 'Bokningsrad borttagen efter lagerarbete. Bevarade rader måste stämmas av.',
      updated_at = now()
    WHERE id = OLD.packing_id AND organization_id = OLD.organization_id;
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_progressed_packing_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS preserve_progressed_packing_item ON public.packing_list_items;
CREATE TRIGGER preserve_progressed_packing_item BEFORE DELETE ON public.packing_list_items
FOR EACH ROW EXECUTE FUNCTION public.preserve_progressed_packing_item();

-- Patch the existing revision- and lease-fenced transaction without replacing
-- its deployed guard logic. Abort installation if the expected body diverges.
DO $$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.apply_booking_cancellation_atomic(uuid,text,text,timestamptz,bigint,text,uuid)'::regprocedure) INTO v_def;
  v_old := 'DELETE FROM public.packing_projects
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;';
  v_new := 'UPDATE public.packing_projects
      SET needs_packing_review = true,
          needs_packing_review_reason = ''Bokningen är avbokad. Kontrollera packning, utlastning och retur.'',
          updated_at = now()
    WHERE organization_id = p_organization_id AND booking_id = p_booking_id;';
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'cancellation_function_shape_changed'; END IF;
  v_def := replace(v_def, v_old, v_new);
  v_def := replace(v_def, '''packing_projects'', m_packing,', '''packing_projects'', 0, ''packing_preserved'', m_packing,');
  EXECUTE v_def;
END;
$$;

-- A generic "approve change" cannot dismiss an outstanding physical return.
CREATE OR REPLACE FUNCTION public.guard_unresolved_retired_packing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR (OLD.needs_packing_review AND NOT NEW.needs_packing_review))
    AND EXISTS (
      SELECT 1 FROM public.packing_list_items i
      WHERE i.packing_id = OLD.id AND i.organization_id = OLD.organization_id
        AND (TG_OP = 'DELETE' OR i.retired_from_booking_at IS NOT NULL)
        AND (coalesce(i.quantity_packed,0) > coalesce(i.quantity_returned,0) OR EXISTS (
          SELECT 1 FROM public.packing_list_item_allocations a
          WHERE a.packing_list_item_id = i.id AND a.organization_id = i.organization_id
        ))
    ) THEN
    RAISE EXCEPTION 'outstanding_retired_packing_requires_return' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_unresolved_retired_packing() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_unresolved_retired_packing BEFORE UPDATE OR DELETE ON public.packing_projects
FOR EACH ROW EXECUTE FUNCTION public.guard_unresolved_retired_packing();

CREATE OR REPLACE FUNCTION public.snapshot_deleted_booking_product_label()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.packing_list_items SET manual_name = coalesce(manual_name, OLD.name)
  WHERE booking_product_id = OLD.id AND organization_id = OLD.organization_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_deleted_booking_product_label() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER snapshot_deleted_booking_product_label BEFORE DELETE ON public.booking_products
FOR EACH ROW EXECUTE FUNCTION public.snapshot_deleted_booking_product_label();

CREATE OR REPLACE FUNCTION public.guard_progressed_packing_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.quantity_to_pack IS DISTINCT FROM OLD.quantity_to_pack
      OR NEW.packing_id IS DISTINCT FROM OLD.packing_id
      OR NEW.wms_line_id IS DISTINCT FROM OLD.wms_line_id
      OR NEW.wms_item_type_id IS DISTINCT FROM OLD.wms_item_type_id
      OR NEW.source_booking_id IS DISTINCT FROM OLD.source_booking_id
      OR (NEW.booking_product_id IS DISTINCT FROM OLD.booking_product_id
        AND NOT (NEW.booking_product_id IS NULL AND NEW.retired_from_booking_at IS NOT NULL)))
    AND (OLD.quantity_packed > 0 OR OLD.quantity_returned > 0
      OR OLD.packed_at IS NOT NULL OR OLD.returned_at IS NOT NULL OR OLD.verified_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.packing_list_item_allocations a
        WHERE a.packing_list_item_id=OLD.id AND a.organization_id=OLD.organization_id)) THEN
    RAISE EXCEPTION 'packing_target_change_requires_review' USING ERRCODE='23514';
  END IF;
  IF OLD.retired_from_booking_at IS NOT NULL AND NEW.quantity_packed > OLD.quantity_packed THEN
    RAISE EXCEPTION 'retired_booking_row_cannot_be_packed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_progressed_packing_target() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_progressed_packing_target BEFORE UPDATE ON public.packing_list_items
FOR EACH ROW EXECUTE FUNCTION public.guard_progressed_packing_target();

CREATE OR REPLACE FUNCTION public.guard_retired_packing_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_retired timestamptz;
BEGIN
  SELECT retired_from_booking_at INTO v_retired FROM public.packing_list_items
    WHERE id=NEW.packing_list_item_id AND organization_id=NEW.organization_id FOR UPDATE;
  IF v_retired IS NOT NULL THEN
    RAISE EXCEPTION 'retired_booking_row_cannot_be_packed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_retired_packing_allocation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_retired_packing_allocation BEFORE INSERT OR UPDATE ON public.packing_list_item_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_retired_packing_allocation();

-- Automatic propagation records the verified commercial cancellation without
-- invoking destructive cleanup. Reuse the exact deployed revision/lease fences.
DO $$
DECLARE v_def text; v_start int; v_end int;
BEGIN
 SELECT pg_get_functiondef('public.apply_booking_cancellation_atomic(uuid,text,text,timestamptz,bigint,text,uuid)'::regprocedure) INTO v_def;
 v_def := replace(v_def, 'FUNCTION public.apply_booking_cancellation_atomic(', 'FUNCTION public.record_booking_cancellation_notice_atomic(');
 v_def := replace(v_def,
   'RETURN jsonb_build_object(''success'', false, ''outcome'', ''not_found'');',
   $missing$UPDATE public.booking_source_state SET applied_source_updated_at=p_source_updated_at,
     applied_source_version=p_source_version,applied_source_status='CANCELLED',revision_kind=v_kind,
     highest_seen_source_updated_at=greatest(highest_seen_source_updated_at,p_source_updated_at),
     highest_seen_source_version=greatest(highest_seen_source_version,p_source_version),
     pending_source_updated_at=NULL,pending_source_version=NULL,pending_source_status=NULL,
     lock_token=NULL,lock_owner_job_id=NULL,lock_acquired_at=NULL,lock_expires_at=NULL,updated_at=now()
     WHERE organization_id=p_organization_id AND booking_id=p_booking_id;
     RETURN jsonb_build_object('success',true,'outcome','cancelled','mutations',jsonb_build_object('packing_preserved',0));$missing$);
 v_start := position('DELETE FROM public.calendar_events' IN v_def);
 v_end := position('    SELECT EXISTS (' IN substring(v_def FROM v_start));
 IF v_start=0 OR v_end=0 THEN RAISE EXCEPTION 'cancellation_notice_function_shape_changed'; END IF;
 v_def := substring(v_def FOR v_start-1) || $body$
    UPDATE public.packing_projects SET needs_packing_review = true,
      needs_packing_review_reason = 'Bokningen är avbokad. Stäm av packning, utlastning och retur.', updated_at=now()
    WHERE organization_id=p_organization_id AND booking_id=p_booking_id;
    GET DIAGNOSTICS m_packing = ROW_COUNT;
    UPDATE public.projects SET status='cancelled',updated_at=now()
      WHERE organization_id=p_organization_id AND booking_id=p_booking_id AND status NOT IN ('completed','cancelled');
    UPDATE public.jobs SET status='cancelled',updated_at=now()
      WHERE organization_id=p_organization_id AND booking_id=p_booking_id AND status NOT IN ('completed','cancelled');
    UPDATE public.calendar_events SET title='[AVBOKAD] ' || title
      WHERE organization_id=p_organization_id AND booking_id=p_booking_id
        AND todo_id IS NULL AND coalesce(event_type,'') NOT IN ('activity','todo')
        AND title NOT LIKE '[AVBOKAD] %';
    UPDATE public.warehouse_calendar_events SET title='[AVBOKAD] ' || title
      WHERE organization_id=p_organization_id AND booking_id=p_booking_id AND title NOT LIKE '[AVBOKAD] %';
    UPDATE public.packing_list_items i SET retired_from_booking_at=coalesce(i.retired_from_booking_at,now())
    FROM public.packing_projects p
    WHERE p.id=i.packing_id AND p.organization_id=p_organization_id
      AND i.organization_id=p_organization_id AND p.booking_id=p_booking_id;
$body$ || substring(v_def FROM v_start+v_end-1);
 EXECUTE v_def;
END;$$;
REVOKE ALL ON FUNCTION public.record_booking_cancellation_notice_atomic(uuid,text,text,timestamptz,bigint,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_booking_cancellation_notice_atomic(uuid,text,text,timestamptz,bigint,text,uuid) TO service_role;