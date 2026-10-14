-- Read-only. A matching legacy shape is NOT proof of automatic ownership:
-- old imports reset manually_adjusted/viewed. Never update from this query alone.
WITH rules(kind, source_field, day_offset, start_clock, end_clock) AS (
 VALUES ('packing','rig',-4,time '08:00',time '11:00'),
 ('delivery','rig',0,time '07:00',time '09:00'),
 ('event','event',0,time '09:00',time '17:00'),
 ('return','rigdown',0,time '17:00',time '19:00'),
 ('inventory','rigdown',1,time '08:00',time '10:00'),
 ('unpacking','rigdown',1,time '10:00',time '12:00')
), candidates AS (
 SELECT e.*, r.kind,
 (CASE r.source_field WHEN 'rig' THEN e.source_rig_date WHEN 'event' THEN e.source_event_date ELSE e.source_rigdown_date END + r.day_offset) + r.start_clock AS expected_start,
 (CASE r.source_field WHEN 'rig' THEN e.source_rig_date WHEN 'event' THEN e.source_event_date ELSE e.source_rigdown_date END + r.day_offset) + r.end_clock AS expected_end,
 EXISTS(SELECT 1 FROM warehouse_assignments a WHERE a.warehouse_event_id=e.id) AS assigned
 FROM warehouse_calendar_events e JOIN rules r ON split_part(e.event_type,'_',1)=r.kind
), classified AS (
 SELECT *, CASE
 WHEN manually_adjusted OR viewed OR warehouse_project_id IS NOT NULL OR warehouse_project_task_id IS NOT NULL OR project_task_id IS NOT NULL OR assigned OR resource_id IS DISTINCT FROM 'warehouse' THEN 'protected_plan'
 WHEN start_time = expected_start AT TIME ZONE 'Europe/Stockholm' AND end_time = expected_end AT TIME ZONE 'Europe/Stockholm' THEN 'correct'
 WHEN start_time = expected_start AT TIME ZONE 'UTC' AND end_time = expected_end AT TIME ZONE 'UTC' THEN 'legacy_shape_requires_provenance'
 ELSE 'custom_or_unknown' END AS classification
 FROM candidates
)
SELECT kind, classification, count(*) AS jobs,
 count(*) FILTER (WHERE start_time >= now()) AS future_jobs,
 count(*) FILTER (WHERE created_at=updated_at) AS never_updated
FROM classified GROUP BY kind,classification ORDER BY kind,classification;
