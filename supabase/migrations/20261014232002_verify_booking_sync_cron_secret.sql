-- Cron and its verifier use the same Vault authority. Do not return or copy
-- the secret into Edge environment variables, responses or migration text.
CREATE OR REPLACE FUNCTION public.verify_booking_sync_cron_secret(p_candidate text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_candidate IS NOT NULL AND length(p_candidate) >= 32 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET' AND decrypted_secret = p_candidate
  );
$$;
REVOKE ALL ON FUNCTION public.verify_booking_sync_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_booking_sync_cron_secret(text) TO service_role;
