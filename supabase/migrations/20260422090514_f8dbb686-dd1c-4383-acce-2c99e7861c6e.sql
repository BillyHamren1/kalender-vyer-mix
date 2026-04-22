-- Reopen the three lager-presence timers that were incorrectly auto-closed
-- by handleStartTravelLog at ~07:21 today (2026-04-22). The travel-log
-- auto-close fired because of GPS jitter while the staff were still
-- standing inside the FA Warehouse geofence. Setting exited_at = NULL
-- causes the sync_location_entry_to_time_report trigger to delete the
-- bogus auto-generated time_report row, and the timer continues from
-- the original entered_at as if the close never happened.
UPDATE public.location_time_entries
SET exited_at = NULL
WHERE id IN (
  'a2b3817b-682a-4d96-8cc2-0c9de20adebb',  -- Raivis Minalto, entered 06:57
  '6c4853ff-b7f1-40c5-9df9-aedbbc575eb8',  -- Armands Birznieks, entered 06:58
  'c0c94474-48e9-4b09-a0d1-87d3caad9a71'   -- Kristaps Ruža, entered 07:01
);