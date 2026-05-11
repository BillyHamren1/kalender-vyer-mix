-- Tidrapport AI 1: AI-granskning av oklara report-block
-- Skapar audit-tabell, lägger på AI-signatur på cache och en trigger som
-- automatiskt anropar edge-funktionen ai-review-time-report-blocks.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 1. Audit-tabell ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_report_ai_block_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  staff_id TEXT NOT NULL,
  date DATE NOT NULL,
  engine_version TEXT NOT NULL,
  cache_id UUID NOT NULL REFERENCES public.staff_day_report_cache(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('auto_applied','uncertain','skipped','failed')),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  original_block_json JSONB,
  ai_result_json JSONB,
  updated_block_json JSONB,
  confidence_score NUMERIC,
  suggested_kind TEXT,
  applied_kind TEXT,
  reasoning_summary TEXT,
  evidence_used_json JSONB,
  safety_flags_json JSONB,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_block_audit_lookup
  ON public.time_report_ai_block_audit (organization_id, staff_id, date, engine_version)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_ai_block_audit_cache
  ON public.time_report_ai_block_audit (cache_id, is_current);

ALTER TABLE public.time_report_ai_block_audit ENABLE ROW LEVEL SECURITY;

-- Admins och projektledare i organisationen läser allt
DROP POLICY IF EXISTS "ai_block_audit_admin_read" ON public.time_report_ai_block_audit;
CREATE POLICY "ai_block_audit_admin_read"
  ON public.time_report_ai_block_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = time_report_ai_block_audit.organization_id
    )
  );

-- Service role får skriva (edge function); ingen annan får skriva
DROP POLICY IF EXISTS "ai_block_audit_no_client_write" ON public.time_report_ai_block_audit;
CREATE POLICY "ai_block_audit_no_client_write"
  ON public.time_report_ai_block_audit FOR ALL
  USING (false)
  WITH CHECK (false);

-- ── 2. Signatur på cachen för idempotens ───────────────────────────────────
ALTER TABLE public.staff_day_report_cache
  ADD COLUMN IF NOT EXISTS ai_review_signature TEXT,
  ADD COLUMN IF NOT EXISTS ai_review_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_review_at TIMESTAMPTZ;

-- ── 3. Trigger som anropar edge-funktionen via pg_net ──────────────────────
-- Skickar bara om dagen INTE är submitted/approved och om signaturen ändrats.
CREATE OR REPLACE FUNCTION public.enqueue_ai_review_time_report_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_blocks JSONB;
  v_has_review BOOLEAN := FALSE;
  v_signature TEXT;
  v_blocked BOOLEAN := FALSE;
  v_anon_key TEXT;
  v_function_url TEXT := 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/ai-review-time-report-blocks';
BEGIN
  v_blocks := COALESCE(NEW.report_candidate_blocks_json, '[]'::jsonb);

  -- Snabbtest: finns det något block som behöver granskas?
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_blocks) b
    WHERE COALESCE(b->>'reviewState','') = 'needs_review'
       OR COALESCE(b->>'kind','') IN ('unknown','needs_review')
  ) INTO v_has_review;

  IF NOT v_has_review THEN
    RETURN NEW;
  END IF;

  -- Skydd: hoppa över om dagen är submitted/approved
  SELECT EXISTS (
    SELECT 1 FROM public.staff_day_submissions s
    WHERE s.organization_id = NEW.organization_id
      AND s.staff_id = NEW.staff_id
      AND s.date = NEW.date
      AND s.status IN ('submitted','approved')
  ) INTO v_blocked;

  IF v_blocked THEN
    RETURN NEW;
  END IF;

  -- Bygg en stabil signatur av input. Om identisk → AI har redan kört på detta.
  v_signature := md5(coalesce(v_blocks::text,'') || '|' || coalesce(NEW.engine_version,''));
  IF NEW.ai_review_signature IS NOT DISTINCT FROM v_signature THEN
    RETURN NEW;
  END IF;

  -- Markera pending så vi inte trippel-triggar inom samma sekund
  UPDATE public.staff_day_report_cache
     SET ai_review_pending = TRUE
   WHERE id = NEW.id;

  -- Hämta service-role från vault så funktionen kan auth:as
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  -- pg_net är fire-and-forget; svar landar i net._http_response (debug)
  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_anon_key,'')
    ),
    body := jsonb_build_object(
      'cacheId', NEW.id,
      'expectedSignature', v_signature
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Triggern får ALDRIG blockera cache-skrivningar
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_review_time_report_blocks ON public.staff_day_report_cache;
CREATE TRIGGER trg_ai_review_time_report_blocks
  AFTER INSERT OR UPDATE OF report_candidate_blocks_json
  ON public.staff_day_report_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_ai_review_time_report_blocks();