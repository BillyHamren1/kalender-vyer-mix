-- An internal project and its initial tasks commit together. No privileged bypass.
ALTER TABLE public.projects ADD COLUMN internal_creation_hash text;
CREATE FUNCTION public.create_internal_project_atomic(p_id uuid, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 org uuid;
 existing public.projects%rowtype;
 result public.projects%rowtype;
 fingerprint text;
 task jsonb;
 task_index integer:=0;
 start_date date;
 end_date date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 org:=public.get_user_organization_id(auth.uid());
 IF org IS NULL THEN RAISE EXCEPTION 'Organization required'; END IF;
 IF p_request->>'expected_actor_id' IS DISTINCT FROM auth.uid()::text OR p_request->>'expected_organization_id' IS DISTINCT FROM org::text THEN RAISE EXCEPTION 'Create request session changed'; END IF;
 IF p_id IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid create request' USING ERRCODE='22023'; END IF;
 IF COALESCE(trim(p_request->>'name'),'')='' OR COALESCE(trim(p_request->>'project_leader'),'')='' THEN RAISE EXCEPTION 'Name and responsible person required' USING ERRCODE='22023'; END IF;
 start_date:=(p_request->>'rigdaydate')::date;
 end_date:=(p_request->>'rigdowndate')::date;
 IF start_date IS NULL OR end_date IS NULL OR end_date<start_date THEN RAISE EXCEPTION 'Invalid project dates' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'tasks') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'tasks')>1000 THEN RAISE EXCEPTION 'Invalid tasks' USING ERRCODE='22023'; END IF;
 fingerprint:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 -- Serializes two deliveries of the same create request, including unknown commit retries.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,173));
 SELECT * INTO existing FROM public.projects WHERE id=p_id;
 IF FOUND THEN
  IF existing.organization_id IS DISTINCT FROM org OR existing.project_kind IS DISTINCT FROM 'internal_project' OR existing.internal_creation_hash IS DISTINCT FROM fingerprint THEN
    RAISE EXCEPTION 'Create request identity conflict';
  END IF;
  RETURN to_jsonb(existing);
 END IF;
 INSERT INTO public.projects(id,organization_id,name,project_leader,booking_id,is_internal,project_kind,status,
  rigdaydate,rigdowndate,budget_hours,budget_cost_minor,budget_currency,internal_goal,internal_creation_hash)
 VALUES(p_id,org,trim(p_request->>'name'),trim(p_request->>'project_leader'),NULL,false,'internal_project','planning',
  start_date,end_date,(p_request->>'budget_hours')::numeric,(p_request->>'budget_cost_minor')::bigint,'SEK',NULLIF(trim(p_request->>'internal_goal'),''),fingerprint)
 RETURNING * INTO result;
 FOR task IN SELECT value FROM jsonb_array_elements(p_request->'tasks') LOOP
  IF COALESCE(trim(task->>'title'),'')='' THEN RAISE EXCEPTION 'Task title required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.project_tasks(project_id,organization_id,title,deadline,sort_order,is_info_only,completed)
  VALUES(p_id,org,trim(task->>'title'),(task->>'deadline')::date,task_index,COALESCE((task->>'is_info_only')::boolean,false),false);
  task_index:=task_index+1;
 END LOOP;
 RETURN to_jsonb(result);
END; $$;
REVOKE ALL ON FUNCTION public.create_internal_project_atomic(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_internal_project_atomic(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.preserve_internal_creation_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.internal_creation_hash IS DISTINCT FROM OLD.internal_creation_hash THEN
   RAISE EXCEPTION 'Internal create request identity is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER preserve_internal_creation_identity BEFORE UPDATE OF internal_creation_hash ON public.projects
 FOR EACH ROW EXECUTE FUNCTION public.preserve_internal_creation_identity();
