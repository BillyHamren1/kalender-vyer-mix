-- SUPERSEDED: applied (corrected) version lives in supabase/migrations/20261018225802_f43039a2-eaa6-4a33-abfb-a8877aa1076b.sql, 20261018225911_da1c6dd7-ad94-4379-98c5-b4b0fac13872.sql and 20261018230103_654b4911-850c-49c6-adf9-2dcfc1e8f5d0.sql (allocation writer). Retention cron: wms-prune-changes-daily.
-- Kept for history only; do not apply.
-- Additive only: new tables, triggers, one invoker RPC. No business rows touched.

-- 1. Per-org cursor: the UPDATE ... RETURNING row lock is held until commit, so two
--    transactions in the same org get seq numbers in commit order (gap-safe per org;
--    a reader can never see seq N+1 committed while N is still in flight).
CREATE TABLE public.wms_change_cursors (
  organization_id uuid PRIMARY KEY,
  last_seq bigint NOT NULL DEFAULT 0,
  retained_from_seq bigint NOT NULL DEFAULT 0   -- retention watermark
);
GRANT SELECT ON public.wms_change_cursors TO authenticated;
GRANT ALL ON public.wms_change_cursors TO service_role;
ALTER TABLE public.wms_change_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY wms_cursor_org_read ON public.wms_change_cursors FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- 2. Durable events incl. tombstones (op='DELETE') and old/new window identity.
CREATE TABLE public.wms_change_events (
  organization_id uuid NOT NULL,
  seq bigint NOT NULL,
  table_name text NOT NULL,
  entity_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  packing_id uuid,           -- parent for items/allocations/assignments
  booking_id uuid,
  old_window jsonb,          -- dates before change (rigdaydate/rigdowndate/start/end/assignment_date)
  new_window jsonb,          -- dates after change; null on DELETE
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, seq)
);
GRANT SELECT ON public.wms_change_events TO authenticated;
GRANT ALL ON public.wms_change_events TO service_role;
ALTER TABLE public.wms_change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY wms_events_org_read ON public.wms_change_events FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE INDEX wms_change_events_committed_idx ON public.wms_change_events (organization_id, committed_at);

-- 3. Trigger writer. Clients have no INSERT grant on the feed, so the writer must run
--    as owner; it only appends derived metadata for the row's own organization_id
--    and never reads/returns other data (narrow, write-only definer; reads stay invoker).
CREATE OR REPLACE FUNCTION public.wms_record_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb := to_jsonb(COALESCE(NEW, OLD));
  o jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  org uuid := (r->>'organization_id')::uuid;
  next_seq bigint;
  win text[] := ARRAY['rigdaydate','rigdowndate','start_date','end_date','assignment_date','start_time','end_time','status','packing_id','staff_id','booking_id'];
BEGIN
  IF org IS NULL THEN RETURN NULL; END IF;
  INSERT INTO wms_change_cursors(organization_id) VALUES (org) ON CONFLICT DO NOTHING;
  UPDATE wms_change_cursors SET last_seq = last_seq + 1
    WHERE organization_id = org RETURNING last_seq INTO next_seq;
  INSERT INTO wms_change_events(organization_id, seq, table_name, entity_id, op, packing_id, booking_id, old_window, new_window)
  VALUES (org, next_seq, TG_TABLE_NAME, (r->>'id')::uuid, TG_OP,
    CASE WHEN TG_TABLE_NAME = 'packing_projects' THEN (r->>'id')::uuid ELSE (r->>'packing_id')::uuid END,
    CASE WHEN TG_TABLE_NAME = 'bookings' THEN (r->>'id')::uuid ELSE (r->>'booking_id')::uuid END,
    (SELECT jsonb_object_agg(k, o->k) FROM unnest(win) k WHERE o ? k),
    (SELECT jsonb_object_agg(k, n->k) FROM unnest(win) k WHERE n ? k));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.wms_record_change() FROM PUBLIC, anon, authenticated;

-- Allocations have no organization_id/packing_id: resolve via the item.
CREATE OR REPLACE FUNCTION public.wms_record_allocation_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record := COALESCE(NEW, OLD); org uuid; pid uuid; next_seq bigint;
BEGIN
  SELECT i.organization_id, i.packing_id INTO org, pid FROM packing_list_items i WHERE i.id = r.packing_list_item_id;
  IF org IS NULL THEN RETURN NULL; END IF;
  INSERT INTO wms_change_cursors(organization_id) VALUES (org) ON CONFLICT DO NOTHING;
  UPDATE wms_change_cursors SET last_seq = last_seq + 1 WHERE organization_id = org RETURNING last_seq INTO next_seq;
  INSERT INTO wms_change_events(organization_id, seq, table_name, entity_id, op, packing_id)
  VALUES (org, next_seq, TG_TABLE_NAME, r.id, TG_OP, pid);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.wms_record_allocation_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wms_feed_packing_projects AFTER INSERT OR UPDATE OR DELETE ON public.packing_projects FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_packing_list_items AFTER INSERT OR UPDATE OR DELETE ON public.packing_list_items FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_warehouse_assignments AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_assignments FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_warehouse_calendar_events AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_calendar_events FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_booking_dates AFTER UPDATE OF rigdaydate, rigdowndate, rig_start_time, rigdown_start_time, client, booking_number ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_staff_names AFTER UPDATE OF name, is_active, tags ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.wms_record_change();
CREATE TRIGGER wms_feed_allocations AFTER INSERT OR UPDATE OR DELETE ON public.packing_list_item_allocations FOR EACH ROW EXECUTE FUNCTION public.wms_record_allocation_change();

-- 4. Read-after-cursor RPC: SECURITY INVOKER, RLS applies, authenticated only.
CREATE OR REPLACE FUNCTION public.wms_changes_since(p_after bigint, p_limit int DEFAULT 500)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH c AS (SELECT * FROM wms_change_cursors WHERE organization_id = get_user_organization_id(auth.uid())),
  e AS (
    SELECT * FROM wms_change_events
    WHERE organization_id = get_user_organization_id(auth.uid()) AND seq > p_after
    ORDER BY seq LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  )
  SELECT jsonb_build_object(
    'head', COALESCE((SELECT last_seq FROM c), 0),
    'retainedFrom', COALESCE((SELECT retained_from_seq FROM c), 0),
    'events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY seq) FROM e), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.wms_changes_since(bigint, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_changes_since(bigint, int) TO authenticated;

-- 5. Retention (service_role / pg_cron): keep 7 days, advance watermark first.
CREATE OR REPLACE FUNCTION public.wms_prune_changes(p_keep interval DEFAULT interval '7 days')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE wms_change_cursors c SET retained_from_seq = COALESCE(
    (SELECT max(seq) FROM wms_change_events e WHERE e.organization_id = c.organization_id AND e.committed_at < now() - p_keep),
    c.retained_from_seq);
  DELETE FROM wms_change_events e USING wms_change_cursors c
   WHERE e.organization_id = c.organization_id AND e.seq <= c.retained_from_seq;
END $$;
REVOKE ALL ON FUNCTION public.wms_prune_changes(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wms_prune_changes(interval) TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wms_change_cursors; -- wake-up only
