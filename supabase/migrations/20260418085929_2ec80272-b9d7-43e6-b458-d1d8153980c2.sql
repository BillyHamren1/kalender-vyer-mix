-- Index that makes the per-booking aggregation cheap.
CREATE INDEX IF NOT EXISTS idx_job_messages_booking_created
  ON public.job_messages (booking_id, created_at DESC)
  WHERE is_archived = false;

CREATE OR REPLACE FUNCTION public.get_job_chat_summary(
  _org_id      uuid,
  _booking_ids text[],
  _my_ids      text[]
)
RETURNS TABLE (
  booking_id           text,
  last_message_content text,
  last_message_at      timestamptz,
  unread_count         bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH msgs AS (
    SELECT jm.booking_id, jm.sender_id, jm.content, jm.created_at, jm.read_by
    FROM public.job_messages jm
    WHERE jm.organization_id = _org_id
      AND jm.is_archived = false
      AND jm.booking_id = ANY(_booking_ids)
  ),
  last_per_booking AS (
    SELECT DISTINCT ON (m.booking_id)
      m.booking_id, m.content, m.created_at
    FROM msgs m
    ORDER BY m.booking_id, m.created_at DESC
  ),
  unread_per_booking AS (
    SELECT m.booking_id, COUNT(*)::bigint AS unread_count
    FROM msgs m
    WHERE m.sender_id <> ALL(_my_ids)
      -- read_by is JSONB array of text. NOT (read_by ?| _my_ids) means
      -- none of the caller's identity ids appear in the array.
      AND NOT (COALESCE(m.read_by, '[]'::jsonb) ?| _my_ids)
    GROUP BY m.booking_id
  )
  SELECT
    b.id                       AS booking_id,
    lp.content                 AS last_message_content,
    lp.created_at              AS last_message_at,
    COALESCE(up.unread_count, 0) AS unread_count
  FROM unnest(_booking_ids) AS b(id)
  LEFT JOIN last_per_booking   lp ON lp.booking_id = b.id
  LEFT JOIN unread_per_booking up ON up.booking_id = b.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_job_chat_summary(uuid, text[], text[]) TO authenticated, anon, service_role;