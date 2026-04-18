CREATE OR REPLACE FUNCTION public.mark_job_thread_read(
  _org_id     uuid,
  _booking_id text,
  _my_ids     text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF _org_id IS NULL OR _booking_id IS NULL OR array_length(_my_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'mark_job_thread_read: missing required args';
  END IF;

  -- Single set-based UPDATE: append every caller-id that isn't already in read_by.
  -- read_by is JSONB array of text. We keep it as JSONB to match existing schema.
  -- Idempotent: WHERE clause skips rows where every caller-id is already present.
  WITH upd AS (
    UPDATE public.job_messages jm
       SET read_by = (
             SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
             FROM (
               SELECT jsonb_array_elements_text(COALESCE(jm.read_by, '[]'::jsonb)) AS x
               UNION
               SELECT unnest(_my_ids) AS x
             ) s
           )
     WHERE jm.organization_id = _org_id
       AND jm.booking_id      = _booking_id
       AND jm.sender_id <> ALL(_my_ids)
       -- Skip rows already fully covered by caller ids
       AND NOT (COALESCE(jm.read_by, '[]'::jsonb) ?& _my_ids)
    RETURNING 1
  )
  SELECT count(*) INTO _affected FROM upd;

  RETURN COALESCE(_affected, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_job_thread_read(uuid, text, text[]) TO authenticated, anon, service_role;