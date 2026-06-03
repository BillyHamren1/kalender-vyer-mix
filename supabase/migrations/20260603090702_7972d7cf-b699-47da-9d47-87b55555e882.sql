-- En enhet per staff: spårar senaste mobil-sessionens id per personal.
-- När en ny mobil-login sker uppdateras detta fält till en ny uuid och
-- alla tidigare mobil-tokens (som bär den gamla session_id) avvisas i
-- mobile-app-api auth-middleware med 401.

ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS active_mobile_session_id text,
  ADD COLUMN IF NOT EXISTS active_mobile_session_at timestamptz;

COMMENT ON COLUMN public.staff_members.active_mobile_session_id IS
  'Senaste mobil-login-sessionens id. Mobil-tokens med annan session_id avvisas (single-device-per-staff).';
COMMENT ON COLUMN public.staff_members.active_mobile_session_at IS
  'När senaste mobil-login skedde (UTC). För admin-synlighet/diagnostik.';