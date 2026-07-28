-- Per-organisation sync-cursor för Booking-importen.
-- Steg 1: deduplicera säkert innan ny unik constraint sätts.
-- Regel: behåll raden med senaste updated_at (tie-break: last_sync_timestamp DESC NULLS LAST, sedan created_at DESC).
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, sync_type
      ORDER BY updated_at DESC,
               last_sync_timestamp DESC NULLS LAST,
               created_at DESC,
               id DESC
    ) AS rn
  FROM public.sync_state
)
DELETE FROM public.sync_state s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- Steg 2: släpp den gamla globala uniknyckeln på sync_type.
ALTER TABLE public.sync_state
  DROP CONSTRAINT IF EXISTS sync_state_sync_type_key;

-- Steg 3: lägg till per-organisation unik constraint.
-- Idempotent: skapas endast om den inte redan finns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sync_state'::regclass
      AND conname  = 'sync_state_org_sync_type_key'
  ) THEN
    ALTER TABLE public.sync_state
      ADD CONSTRAINT sync_state_org_sync_type_key
      UNIQUE (organization_id, sync_type);
  END IF;
END$$;

-- Steg 4: stödjande index (constraint skapar redan ett unikt index; detta är
-- endast ett kommentar-hint — inget att skapa separat).
COMMENT ON CONSTRAINT sync_state_org_sync_type_key ON public.sync_state IS
  'Per-organisation sync-cursor. Ersätter tidigare global UNIQUE(sync_type) som lät organisationer skriva över varandras cursor.';
