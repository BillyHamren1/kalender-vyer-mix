-- Server-only receipts. Pending external outcomes never expire/retry automatically.
CREATE TABLE IF NOT EXISTS public.planning_mobile_workspace_receipts (
  organization_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  command_type text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','persisted','rejected')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,actor_user_id,project_id,idempotency_key)
);
ALTER TABLE public.planning_mobile_workspace_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planning_mobile_workspace_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.planning_mobile_workspace_receipts TO service_role;

-- SECURITY INVOKER; only the signed server adapter may call this transaction.
CREATE OR REPLACE FUNCTION public.planning_mobile_workspace_command_v1(
  p_actor_user_id uuid,p_organization_id uuid,p_project_id uuid,p_idempotency_key uuid,
  p_command jsonb,p_request_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  p public.projects%ROWTYPE;
  t public.project_tasks%ROWTYPE;
  transport public.transport_assignments%ROWTYPE;
  r public.planning_mobile_workspace_receipts%ROWTYPE;
  command_type text:=p_command->>'type';
  v_result jsonb;
  task_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor_user_id AND organization_id=p_organization_id AND role::text IN ('admin','projekt')) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO p FROM public.projects WHERE id=p_project_id AND organization_id=p_organization_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  IF p.booking_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bookings WHERE id=p.booking_id AND organization_id=p_organization_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0002';
  END IF;
  IF p_request_hash !~ '^[0-9a-f]{64}$' OR command_type NOT IN ('notes.save','task.add','task.toggle','task.delete','costs.product.save','costs.extra.save','supplier.registry.create','supplier.create_and_link','supplier.link.add','supplier.request.send','transport.create','transport.request.send','transport.set_planning_status','file.upload','file.delete') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
  END IF;
  -- Serialize the same actor/project command, also preventing concurrent adds.
  SELECT * INTO r FROM public.planning_mobile_workspace_receipts WHERE organization_id=p_organization_id AND actor_user_id=p_actor_user_id AND project_id=p_project_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF r.request_hash<>p_request_hash THEN RAISE EXCEPTION 'conflict' USING ERRCODE='40001'; END IF;
    IF r.state='persisted' THEN RETURN r.result||jsonb_build_object('replayed',true); END IF;
    IF r.state='rejected' THEN RAISE EXCEPTION 'conflict' USING ERRCODE='40001'; END IF;
    RETURN jsonb_build_object('claimed',false,'error','outcome_unknown');
  END IF;
  INSERT INTO public.planning_mobile_workspace_receipts(organization_id,actor_user_id,project_id,idempotency_key,request_hash,command_type,state)
  VALUES(p_organization_id,p_actor_user_id,p_project_id,p_idempotency_key,p_request_hash,command_type,'pending');
  IF command_type='task.add' THEN
    IF coalesce(length(trim(p_command->>'title')),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
    INSERT INTO public.project_tasks(project_id,organization_id,title) VALUES(p_project_id,p_organization_id,trim(p_command->>'title')) RETURNING id INTO task_id;
    v_result:=jsonb_build_object('persisted',true,'taskId',task_id,'replayed',false);
  ELSIF command_type IN ('task.toggle','task.delete') THEN
    SELECT * INTO t FROM public.project_tasks WHERE id=(p_command->>'taskId')::uuid AND project_id=p_project_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
    IF command_type='task.toggle' THEN
      IF jsonb_typeof(p_command->'completed') <> 'boolean' OR jsonb_typeof(p_command->'expectedCompleted') <> 'boolean' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
      IF t.completed IS DISTINCT FROM (p_command->>'expectedCompleted')::boolean THEN RAISE EXCEPTION 'conflict' USING ERRCODE='40001'; END IF;
      UPDATE public.project_tasks SET completed=(p_command->>'completed')::boolean,updated_at=now() WHERE id=t.id;
    ELSE
      IF t.updated_at IS DISTINCT FROM (p_command->>'expectedUpdatedAt')::timestamptz THEN RAISE EXCEPTION 'conflict' USING ERRCODE='40001'; END IF;
      DELETE FROM public.project_tasks WHERE id=t.id;
    END IF;
    v_result:=jsonb_build_object('persisted',true,'taskId',t.id,'replayed',false);
  ELSIF command_type='transport.set_planning_status' THEN
    IF coalesce(p_command->>'planningStatus','') NOT IN ('preliminary','confirmed') OR coalesce(p_command->>'expectedPlanningStatus','') NOT IN ('preliminary','confirmed') THEN
      RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
    END IF;
    SELECT * INTO transport FROM public.transport_assignments
      WHERE id=(p_command->>'assignmentId')::uuid AND organization_id=p_organization_id AND booking_id=p.booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
    IF transport.planning_status IS DISTINCT FROM p_command->>'expectedPlanningStatus' THEN
      RAISE EXCEPTION 'conflict' USING ERRCODE='40001';
    END IF;
    UPDATE public.transport_assignments SET planning_status=p_command->>'planningStatus' WHERE id=transport.id;
    v_result:=jsonb_build_object('persisted',true,'assignmentId',transport.id,'planningStatus',p_command->>'planningStatus','replayed',false);
  ELSIF command_type='notes.save' AND p.booking_id IS NULL THEN
    IF jsonb_typeof(p_command->'notes')<>'string' OR length(p_command->>'notes')>50000 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
    IF coalesce(p.internalnotes,'') IS DISTINCT FROM coalesce(p_command->>'expectedNotes','') THEN RAISE EXCEPTION 'conflict' USING ERRCODE='40001'; END IF;
    UPDATE public.projects SET internalnotes=p_command->>'notes',updated_at=now() WHERE id=p_project_id;
    v_result:=jsonb_build_object('persisted',true,'replayed',false);
  ELSE
    RETURN jsonb_build_object('claimed',true,'bookingId',p.booking_id);
  END IF;
  UPDATE public.planning_mobile_workspace_receipts SET state='persisted',result=v_result WHERE organization_id=p_organization_id AND actor_user_id=p_actor_user_id AND project_id=p_project_id AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.planning_mobile_workspace_command_v1(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planning_mobile_workspace_command_v1(uuid,uuid,uuid,uuid,jsonb,text) TO service_role;
