-- Remove the trigger that auto-creates time_reports from location_time_entries.
-- time_reports now have a single owner: mobile-app-api.createTimeReport
-- (called from useWorkSession.stopSession). location_time_entries become
-- pure presence/context data.

DROP TRIGGER IF EXISTS trg_sync_location_entry_to_time_report ON public.location_time_entries;

-- Keep the function for potential one-off manual backfill, but mark it deprecated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_location_entry_to_time_report'
  ) THEN
    EXECUTE $cmt$COMMENT ON FUNCTION public.sync_location_entry_to_time_report() IS
      'DEPRECATED 2026-04-22: trigger removed. time_reports are now created exclusively via mobile-app-api.createTimeReport (useWorkSession.stopSession). Function retained for manual one-off backfill only.'$cmt$;
  END IF;
END$$;