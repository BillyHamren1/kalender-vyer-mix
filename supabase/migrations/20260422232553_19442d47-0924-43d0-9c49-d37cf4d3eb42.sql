
CREATE OR REPLACE FUNCTION public.promote_stale_assistant_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH updated AS (
    UPDATE public.assistant_events
       SET stale_for_prompt = true,
           updated_at = now()
     WHERE stale_for_prompt = false
       AND resolution_status = 'pending'
       AND (
         (event_type = 'arrival'      AND happened_at < now() - interval '4 hours')  OR
         (event_type = 'departure'    AND happened_at < now() - interval '6 hours')  OR
         (event_type = 'home_arrival' AND happened_at < now() - interval '12 hours') OR
         (event_type = 'travel_edge'  AND happened_at < now() - interval '4 hours')
       )
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END $$;
