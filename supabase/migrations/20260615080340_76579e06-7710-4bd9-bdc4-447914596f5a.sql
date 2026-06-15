SET session_replication_role = replica;

DO $$
DECLARE
  v_lp_id uuid := '5c94ebcc-f797-442a-9ec8-cb53105574bb';
  v_wp_id uuid := 'b3bb02cb-3199-42b7-864c-1e032bc25c5a';
  v_pp_id uuid := 'a2568c55-4eaa-4d71-af4f-1b85048f573a';
  v_bookings_count int;
BEGIN
  SELECT COUNT(*) INTO v_bookings_count
  FROM large_project_bookings WHERE large_project_id = v_lp_id;
  IF v_bookings_count > 0 THEN
    RAISE EXCEPTION 'Aborting: large_project % has % bookings', v_lp_id, v_bookings_count;
  END IF;

  DELETE FROM packing_list_item_allocations
    WHERE packing_list_item_id IN (SELECT id FROM packing_list_items WHERE packing_id = v_pp_id);
  DELETE FROM packing_control_session_items WHERE packing_id = v_pp_id;
  DELETE FROM packing_control_sessions WHERE packing_id = v_pp_id;
  DELETE FROM packing_work_session_events WHERE packing_id = v_pp_id;
  DELETE FROM packing_work_sessions WHERE packing_id = v_pp_id;
  DELETE FROM packing_list_items WHERE packing_id = v_pp_id;
  DELETE FROM packing_parcels WHERE packing_id = v_pp_id;
  DELETE FROM packing_task_comments
    WHERE task_id IN (SELECT id FROM packing_tasks WHERE packing_id = v_pp_id);
  DELETE FROM packing_tasks WHERE packing_id = v_pp_id;
  DELETE FROM packing_comments WHERE packing_id = v_pp_id;
  DELETE FROM packing_files WHERE packing_id = v_pp_id;
  DELETE FROM packing_invoices WHERE packing_id = v_pp_id;
  DELETE FROM packing_quotes WHERE packing_id = v_pp_id;
  DELETE FROM packing_budget WHERE packing_id = v_pp_id;
  DELETE FROM packing_labor_costs WHERE packing_id = v_pp_id;
  DELETE FROM packing_purchases WHERE packing_id = v_pp_id;
  DELETE FROM packing_project_bookings WHERE packing_id = v_pp_id;
  DELETE FROM packing_sync_log WHERE packing_id = v_pp_id;
  DELETE FROM warehouse_assignments WHERE packing_id = v_pp_id;
  DELETE FROM packing_projects WHERE id = v_pp_id;

  DELETE FROM warehouse_project_tasks WHERE warehouse_project_id = v_wp_id;
  DELETE FROM warehouse_project_changes WHERE warehouse_project_id = v_wp_id;
  DELETE FROM warehouse_projects WHERE id = v_wp_id;

  DELETE FROM warehouse_project_inbox
    WHERE source_id = v_lp_id AND source_type = 'large_project';

  -- Detach calendar_event_id pointers first (and remove their calendar_events)
  DELETE FROM calendar_events
    WHERE id IN (SELECT calendar_event_id FROM establishment_tasks WHERE large_project_id = v_lp_id AND calendar_event_id IS NOT NULL);
  DELETE FROM establishment_task_comments
    WHERE task_id IN (SELECT id FROM establishment_tasks WHERE large_project_id = v_lp_id);
  DELETE FROM establishment_tasks WHERE large_project_id = v_lp_id;

  DELETE FROM large_project_booking_plan_items WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_team_assignments WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_cost_lines WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_gantt_steps WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_view_config WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_budget WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_purchases WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_staff WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_tasks WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_files WHERE large_project_id = v_lp_id;
  DELETE FROM large_project_bookings WHERE large_project_id = v_lp_id;

  DELETE FROM large_projects WHERE id = v_lp_id;
END $$;

SET session_replication_role = DEFAULT;