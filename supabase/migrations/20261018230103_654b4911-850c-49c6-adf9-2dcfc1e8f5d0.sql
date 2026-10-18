CREATE OR REPLACE FUNCTION public.wms_record_allocation_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.packing_list_item_allocations%ROWTYPE;
  org uuid; pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  -- 1) own org column (always present on allocations)
  org := r.organization_id;
  -- 2) parent item (gone during cascade delete -> no row, not an error)
  SELECT i.packing_id, COALESCE(org, i.organization_id) INTO pid, org
    FROM packing_list_items i WHERE i.id = r.packing_list_item_id;
  -- 3) parcel fallback (parcel keeps packing_id even when the item is already deleted)
  IF pid IS NULL AND r.parcel_id IS NOT NULL THEN
    SELECT p.packing_id, COALESCE(org, p.organization_id) INTO pid, org
      FROM packing_parcels p WHERE p.id = r.parcel_id;
  END IF;
  IF org IS NULL THEN RETURN NULL; END IF;
  INSERT INTO wms_change_events(organization_id, txid, table_name, entity_id, op, packing_id, old_window, new_window)
  VALUES (org, pg_current_xact_id()::text::bigint, TG_TABLE_NAME, r.id::text, TG_OP, pid,
    CASE WHEN TG_OP <> 'INSERT' THEN jsonb_build_object('packing_list_item_id', OLD.packing_list_item_id, 'parcel_id', OLD.parcel_id, 'packing_id', pid) END,
    CASE WHEN TG_OP <> 'DELETE' THEN jsonb_build_object('packing_list_item_id', NEW.packing_list_item_id, 'parcel_id', NEW.parcel_id) END);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.wms_record_allocation_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wms_feed_allocations ON public.packing_list_item_allocations;
CREATE TRIGGER wms_feed_allocations AFTER INSERT OR UPDATE OR DELETE ON public.packing_list_item_allocations
  FOR EACH ROW EXECUTE FUNCTION public.wms_record_allocation_change();