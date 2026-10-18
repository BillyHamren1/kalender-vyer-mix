CREATE TABLE public.wms_change_cursors (
  organization_id uuid PRIMARY KEY,
  retained_from_seq bigint NOT NULL DEFAULT 0
);
GRANT SELECT ON public.wms_change_cursors TO authenticated;
GRANT ALL ON public.wms_change_cursors TO service_role;
ALTER TABLE public.wms_change_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY wms_cursor_org_read ON public.wms_change_cursors FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE TABLE public.wms_change_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL,
  txid bigint NOT NULL,
  table_name text NOT NULL,
  entity_id text NOT NULL,
  op text NOT NULL,
  packing_id uuid,
  booking_id text,
  old_window jsonb,
  new_window jsonb,
  committed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wms_change_events TO authenticated;
GRANT ALL ON public.wms_change_events TO service_role;
ALTER TABLE public.wms_change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY wms_events_org_read ON public.wms_change_events FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE INDEX wms_change_events_org_tx_idx ON public.wms_change_events (organization_id, txid, id);
CREATE INDEX wms_change_events_committed_idx ON public.wms_change_events (committed_at);

CREATE OR REPLACE FUNCTION public.wms_record_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb := to_jsonb(COALESCE(NEW, OLD));
  o jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  org uuid;
  pid uuid;
  win text[] := ARRAY['rigdaydate','rigdowndate','rig_start_time','rigdown_start_time','start_date','end_date','assignment_date','start_time','end_time','status','packing_id','staff_id','booking_id','is_active'];
BEGIN
  org := NULLIF(r->>'organization_id','')::uuid;
  IF TG_TABLE_NAME = 'packing_projects' THEN
    pid := (r->>'id')::uuid;
  ELSIF TG_TABLE_NAME = 'packing_list_item_allocations' THEN
    SELECT i.packing_id, COALESCE(org, i.organization_id) INTO pid, org
      FROM packing_list_items i WHERE i.id = (r->>'packing_list_item_id')::uuid;
  ELSE
    pid := NULLIF(r->>'packing_id','')::uuid;
  END IF;
  IF org IS NULL THEN RETURN NULL; END IF;
  INSERT INTO wms_change_events(organization_id, txid, table_name, entity_id, op, packing_id, booking_id, old_window, new_window)
  VALUES (org, pg_current_xact_id()::text::bigint, TG_TABLE_NAME, r->>'id', TG_OP, pid,
    CASE WHEN TG_TABLE_NAME = 'bookings' THEN r->>'id' ELSE r->>'booking_id' END,
    (SELECT jsonb_object_agg(k, o->k) FROM unnest(win) k WHERE o ? k),
    (SELECT jsonb_object_agg(k, n->k) FROM unnest(win) k WHERE n ? k));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.wms_record_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wms_feed_packing_projects AFTER INSERT OR UPDATE OR DELETE ON public.packing_projects FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_packing_list_items AFTER INSERT OR UPDATE OR DELETE ON public.packing_list_items FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_allocations AFTER INSERT OR UPDATE OR DELETE ON public.packing_list_item_allocations FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_warehouse_assignments AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_assignments FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_warehouse_calendar_events AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_calendar_events FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_booking_dates AFTER UPDATE OF rigdaydate, rigdowndate, rig_start_time, rigdown_start_time, client, booking_number, status ON public.bookings
  FOR EACH ROW WHEN ((OLD.rigdaydate, OLD.rigdowndate, OLD.rig_start_time, OLD.rigdown_start_time, OLD.client, OLD.booking_number, OLD.status)
    IS DISTINCT FROM (NEW.rigdaydate, NEW.rigdowndate, NEW.rig_start_time, NEW.rigdown_start_time, NEW.client, NEW.booking_number, NEW.status))
  EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_staff_names AFTER UPDATE OF name, is_active, tags ON public.staff_members
  FOR EACH ROW WHEN ((OLD.name, OLD.is_active, OLD.tags) IS DISTINCT FROM (NEW.name, NEW.is_active, NEW.tags))
  EXECUTE FUNCTION public.wms_record_change();

-- Cursor = transaction id watermark. Only transactions below the snapshot xmin are
-- returned; all of them are finished, so a later commit can never land behind the cursor.
-- Whole transactions are returned per page (seq = txid), so paging never splits one.
CREATE OR REPLACE FUNCTION public.wms_changes_since(p_after bigint, p_limit int DEFAULT 500)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH org AS (SELECT public.get_user_organization_id(auth.uid()) AS id),
  safe AS (SELECT pg_snapshot_xmin(pg_current_snapshot())::text::bigint - 1 AS head),
  tx AS (
    SELECT DISTINCT e.txid FROM wms_change_events e, org, safe
    WHERE e.organization_id = org.id AND e.txid > p_after AND e.txid <= safe.head
    ORDER BY e.txid LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  ),
  ev AS (
    SELECT e.* FROM wms_change_events e JOIN tx ON tx.txid = e.txid, org
    WHERE e.organization_id = org.id
  )
  SELECT jsonb_build_object(
    'head', CASE WHEN (SELECT id FROM org) IS NULL THEN 0 ELSE (SELECT head FROM safe) END,
    'retainedFrom', COALESCE((SELECT c.retained_from_seq FROM wms_change_cursors c, org WHERE c.organization_id = org.id), 0),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'seq', ev.txid, 'table_name', ev.table_name, 'entity_id', ev.entity_id, 'op', ev.op,
        'packing_id', ev.packing_id, 'booking_id', ev.booking_id,
        'old_window', ev.old_window, 'new_window', ev.new_window) ORDER BY ev.txid, ev.id) FROM ev), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.wms_changes_since(bigint, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_changes_since(bigint, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.wms_prune_changes(p_keep interval DEFAULT interval '7 days')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO wms_change_cursors(organization_id, retained_from_seq)
  SELECT organization_id, max(txid) FROM wms_change_events
   WHERE committed_at < now() - p_keep GROUP BY organization_id
  ON CONFLICT (organization_id) DO UPDATE
    SET retained_from_seq = GREATEST(wms_change_cursors.retained_from_seq, EXCLUDED.retained_from_seq);
  DELETE FROM wms_change_events e USING wms_change_cursors c
   WHERE e.organization_id = c.organization_id AND e.txid <= c.retained_from_seq;
END $$;
REVOKE ALL ON FUNCTION public.wms_prune_changes(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wms_prune_changes(interval) TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wms_change_events;