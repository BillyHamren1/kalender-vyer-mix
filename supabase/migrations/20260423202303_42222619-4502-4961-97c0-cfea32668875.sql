
CREATE TABLE IF NOT EXISTS public.ai_reality_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  situation_kind text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  ai_reasoning text NOT NULL DEFAULT '',
  ai_model text,
  situation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'uncertain'
    CHECK (status IN ('applied','asked_user','uncertain','reverted','dismissed')),
  applied_at timestamptz,
  reverted_at timestamptz,
  reverted_by uuid,
  push_sent_at timestamptz,
  push_response text CHECK (push_response IN ('yes','no','snoozed','ignored') OR push_response IS NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reality_corrections_staff_detected
  ON public.ai_reality_corrections (staff_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_reality_corrections_org_status
  ON public.ai_reality_corrections (organization_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_reality_corrections_org_detected
  ON public.ai_reality_corrections (organization_id, detected_at DESC);

DROP TRIGGER IF EXISTS trg_ai_reality_corrections_updated_at ON public.ai_reality_corrections;
CREATE TRIGGER trg_ai_reality_corrections_updated_at
  BEFORE UPDATE ON public.ai_reality_corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_reality_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own corrections"
ON public.ai_reality_corrections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.id = ai_reality_corrections.staff_id
      AND sm.user_id = auth.uid()
  )
);

CREATE POLICY "Staff revert own corrections within 7 days"
ON public.ai_reality_corrections
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.id = ai_reality_corrections.staff_id
      AND sm.user_id = auth.uid()
  )
  AND detected_at > (now() - interval '7 days')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.id = ai_reality_corrections.staff_id
      AND sm.user_id = auth.uid()
  )
);

CREATE POLICY "Org members view org corrections"
ON public.ai_reality_corrections
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE user_id = auth.uid()
  )
);

COMMENT ON TABLE public.ai_reality_corrections IS
  'Audit log for AI-driven reconciliation between GPS reality and workday logs. Auto-corrections (>0.85 conf) applied silently; medium confidence asks user via push; low confidence logs only.';
