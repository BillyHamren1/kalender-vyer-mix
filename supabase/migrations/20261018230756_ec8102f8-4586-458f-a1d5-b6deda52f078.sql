CREATE OR REPLACE FUNCTION public.wms_prune_changes(p_keep interval DEFAULT interval '7 days')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  safe_xmin bigint := pg_snapshot_xmin(pg_current_snapshot())::text::bigint;
BEGIN
  -- Same boundary as wms_changes_since: only finished transactions (txid < xmin).
  INSERT INTO wms_change_cursors(organization_id, retained_from_seq)
  SELECT organization_id, max(txid) FROM wms_change_events
   WHERE committed_at < now() - p_keep AND txid < safe_xmin
   GROUP BY organization_id
  ON CONFLICT (organization_id) DO UPDATE
    SET retained_from_seq = GREATEST(wms_change_cursors.retained_from_seq, EXCLUDED.retained_from_seq);
  DELETE FROM wms_change_events e USING wms_change_cursors c
   WHERE e.organization_id = c.organization_id
     AND e.txid <= c.retained_from_seq
     AND e.txid < safe_xmin;
END $$;
REVOKE ALL ON FUNCTION public.wms_prune_changes(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wms_prune_changes(interval) TO service_role;