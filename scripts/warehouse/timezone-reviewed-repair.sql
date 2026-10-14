-- Operator procedure, NOT a migration. Default is a read-only preview + rollback.
-- Populate reviewed with exact rows from a saved before-snapshot and independent
-- evidence of automatic creation/no later manual approval. False flags alone
-- are insufficient because the old importer reset them.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE TEMP TABLE reviewed (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL,
 old_start timestamptz NOT NULL, old_end timestamptz NOT NULL,
 old_updated_at timestamptz NOT NULL,
 evidence text NOT NULL CHECK (length(trim(evidence)) > 20)
) ON COMMIT DROP;
-- INSERT INTO reviewed VALUES (... reviewed snapshot + evidence ...);
-- Empty by default; never infer approval from matching clock times.
LOCK TABLE public.warehouse_assignments IN SHARE MODE;
SELECT e.id FROM public.warehouse_calendar_events e JOIN reviewed r
 ON r.id=e.id AND r.organization_id=e.organization_id FOR UPDATE OF e;
CREATE TEMP TABLE repair_candidates ON COMMIT DROP AS
SELECT e.id, e.organization_id, e.start_time AS old_start, e.end_time AS old_end,
 e.updated_at AS old_updated_at, r.evidence,
 (e.start_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm' AS new_start,
 (e.end_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Stockholm' AS new_end
FROM public.warehouse_calendar_events e JOIN reviewed r
 ON r.id=e.id AND r.organization_id=e.organization_id
WHERE e.start_time=r.old_start AND e.end_time=r.old_end AND e.updated_at=r.old_updated_at
 AND e.manually_adjusted IS FALSE AND e.viewed IS FALSE AND e.has_source_changes IS FALSE
 AND e.resource_id='warehouse' AND e.warehouse_project_id IS NULL
 AND e.warehouse_project_task_id IS NULL AND e.project_task_id IS NULL
 AND e.linked_internal_project_id IS NULL
 AND e.start_time > now()
 AND NOT EXISTS(SELECT 1 FROM public.warehouse_assignments a WHERE a.warehouse_event_id=e.id)
 AND EXISTS (
  SELECT 1 FROM (VALUES
   ('packing',e.source_rig_date-4,time '08:00',time '11:00'),
   ('delivery',e.source_rig_date,time '07:00',time '09:00'),
   ('event',e.source_event_date,time '09:00',time '17:00'),
   ('return',e.source_rigdown_date,time '17:00',time '19:00'),
   ('inventory',e.source_rigdown_date+1,time '08:00',time '10:00'),
   ('unpacking',e.source_rigdown_date+1,time '10:00',time '12:00')
  ) rule(kind,day,start_clock,end_clock)
  WHERE split_part(e.event_type,'_',1)=rule.kind
   AND e.start_time=(rule.day+rule.start_clock) AT TIME ZONE 'UTC'
   AND e.end_time=(rule.day+rule.end_clock) AT TIME ZONE 'UTC'
 );
-- Abort the whole batch if any reviewed row changed or became protected.
DO $$ BEGIN
 IF (SELECT count(*) FROM reviewed) <> (SELECT count(*) FROM repair_candidates)
 THEN RAISE EXCEPTION 'Warehouse repair conflict: review again'; END IF;
END $$;
SELECT * FROM repair_candidates ORDER BY id;
-- After saving the before/after preview in a durable protected audit location,
-- execute these exact statements in this same transaction, then COMMIT instead:
-- UPDATE public.warehouse_calendar_events e
-- SET start_time=c.new_start, end_time=c.new_end
-- FROM repair_candidates c WHERE e.id=c.id AND e.organization_id=c.organization_id
-- RETURNING e.id, e.start_time, e.end_time, e.updated_at;
ROLLBACK;
-- Rollback after an applied repair requires the saved old values, guarded by
-- the returned new values + updated_at, and the same no-assignment/no-plan checks.
-- Do not rerun the old importer to roll back: it can destroy manual plans.
