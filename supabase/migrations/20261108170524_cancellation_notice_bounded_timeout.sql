-- This existing service-only atomic owner can exceed the inherited 8s API
-- budget while database catalogue/data reads are slow. Give only this RPC a
-- bounded allowance; preserve its body, lease/revision guards and grants.
-- Supabase documents function-level timeouts for Database REST API calls:
-- https://supabase.com/docs/guides/database/postgres/timeouts#function-level
ALTER FUNCTION public.record_booking_cancellation_notice_atomic(
  uuid, text, text, timestamptz, bigint, text, uuid
) SET statement_timeout = '45s';

-- Function metadata is cached by PostgREST.
-- https://docs.postgrest.org/en/stable/references/schema_cache.html
NOTIFY pgrst, 'reload schema';
