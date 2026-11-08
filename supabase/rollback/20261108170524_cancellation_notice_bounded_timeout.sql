-- Restore the previously inherited timeout for this RPC only.
ALTER FUNCTION public.record_booking_cancellation_notice_atomic(
  uuid, text, text, timestamptz, bigint, text, uuid
) RESET statement_timeout;
NOTIFY pgrst, 'reload schema';
