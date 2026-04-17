-- =============================================================
-- Robust, atomic archive/unarchive for direct_messages and job_messages
-- =============================================================
-- Problem with the previous JS approach:
--   1. N separate UPDATE round-trips per conversation (slow + chatty)
--   2. read-modify-write on is_archived_by → lost-update race condition
--      when two clients archive the same thread simultaneously
--
-- Solution: server-side SET-based UPDATE that uses array_append /
-- array_remove inside Postgres. One query, atomic, idempotent
-- (UNIQUE on the resulting set). DEFINER lets us bypass RLS while
-- enforcing org/access checks via WHERE clause.
-- =============================================================

-- ---- Direct messages ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_dm_thread(
  _org_id    uuid,
  _my_ids    text[],   -- caller's identity ids (staff_id + optional user_id)
  _partner_id text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF _org_id IS NULL OR _partner_id IS NULL OR array_length(_my_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'archive_dm_thread: missing required args';
  END IF;

  -- Single atomic UPDATE: append every caller-id that isn't already present.
  WITH upd AS (
    UPDATE public.direct_messages dm
       SET is_archived_by = (
             SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
             FROM unnest(COALESCE(dm.is_archived_by, ARRAY[]::text[]) || _my_ids) AS x
           )
     WHERE dm.organization_id = _org_id
       AND (
            (dm.sender_id    = ANY(_my_ids) AND dm.recipient_id = _partner_id)
         OR (dm.sender_id    = _partner_id AND dm.recipient_id = ANY(_my_ids))
       )
       -- Idempotency: only touch rows that aren't already archived by ALL caller ids
       AND NOT (_my_ids <@ COALESCE(dm.is_archived_by, ARRAY[]::text[]))
    RETURNING 1
  )
  SELECT count(*) INTO _affected FROM upd;

  RETURN COALESCE(_affected, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_dm_thread(
  _org_id    uuid,
  _my_ids    text[],
  _partner_id text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF _org_id IS NULL OR _partner_id IS NULL OR array_length(_my_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'unarchive_dm_thread: missing required args';
  END IF;

  WITH upd AS (
    UPDATE public.direct_messages dm
       SET is_archived_by = (
             SELECT COALESCE(array_agg(x), ARRAY[]::text[])
             FROM unnest(COALESCE(dm.is_archived_by, ARRAY[]::text[])) AS x
             WHERE x <> ALL(_my_ids)
           )
     WHERE dm.organization_id = _org_id
       AND (
            (dm.sender_id    = ANY(_my_ids) AND dm.recipient_id = _partner_id)
         OR (dm.sender_id    = _partner_id AND dm.recipient_id = ANY(_my_ids))
       )
       AND COALESCE(dm.is_archived_by, ARRAY[]::text[]) && _my_ids
    RETURNING 1
  )
  SELECT count(*) INTO _affected FROM upd;

  RETURN COALESCE(_affected, 0);
END;
$$;

-- ---- Job messages -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_job_thread(
  _org_id     uuid,
  _my_ids     text[],
  _booking_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF _org_id IS NULL OR _booking_id IS NULL OR array_length(_my_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'archive_job_thread: missing required args';
  END IF;

  WITH upd AS (
    UPDATE public.job_messages jm
       SET is_archived_by = (
             SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
             FROM unnest(COALESCE(jm.is_archived_by, ARRAY[]::text[]) || _my_ids) AS x
           )
     WHERE jm.organization_id = _org_id
       AND jm.booking_id      = _booking_id
       AND NOT (_my_ids <@ COALESCE(jm.is_archived_by, ARRAY[]::text[]))
    RETURNING 1
  )
  SELECT count(*) INTO _affected FROM upd;

  RETURN COALESCE(_affected, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_job_thread(
  _org_id     uuid,
  _my_ids     text[],
  _booking_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF _org_id IS NULL OR _booking_id IS NULL OR array_length(_my_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'unarchive_job_thread: missing required args';
  END IF;

  WITH upd AS (
    UPDATE public.job_messages jm
       SET is_archived_by = (
             SELECT COALESCE(array_agg(x), ARRAY[]::text[])
             FROM unnest(COALESCE(jm.is_archived_by, ARRAY[]::text[])) AS x
             WHERE x <> ALL(_my_ids)
           )
     WHERE jm.organization_id = _org_id
       AND jm.booking_id      = _booking_id
       AND COALESCE(jm.is_archived_by, ARRAY[]::text[]) && _my_ids
    RETURNING 1
  )
  SELECT count(*) INTO _affected FROM upd;

  RETURN COALESCE(_affected, 0);
END;
$$;

-- Lock down EXECUTE: only service_role/authenticated can call these.
REVOKE ALL ON FUNCTION public.archive_dm_thread(uuid, text[], text)    FROM public;
REVOKE ALL ON FUNCTION public.unarchive_dm_thread(uuid, text[], text)  FROM public;
REVOKE ALL ON FUNCTION public.archive_job_thread(uuid, text[], uuid)   FROM public;
REVOKE ALL ON FUNCTION public.unarchive_job_thread(uuid, text[], uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.archive_dm_thread(uuid, text[], text)    TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_dm_thread(uuid, text[], text)  TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_job_thread(uuid, text[], uuid)   TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_job_thread(uuid, text[], uuid) TO service_role, authenticated;