CREATE TABLE IF NOT EXISTS public.time_report_ai_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  date DATE NOT NULL,
  block_id TEXT NOT NULL,
  engine_version TEXT,
  review_status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (review_status IN ('suggested','accepted','rejected','superseded','needs_human_review')),
  current_classification TEXT,
  current_kind TEXT,
  current_confidence TEXT,
  suggested_classification TEXT,
  suggested_kind TEXT,
  suggested_label TEXT,
  suggested_minutes INTEGER,
  confidence TEXT,
  confidence_score NUMERIC,
  reasoning_summary TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  concerns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_used_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_model TEXT,
  ai_raw_response JSONB,
  admin_feedback TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_traireviews_org_staff_date ON public.time_report_ai_reviews (organization_id, staff_id, date);
CREATE INDEX IF NOT EXISTS idx_traireviews_block ON public.time_report_ai_reviews (block_id);
CREATE INDEX IF NOT EXISTS idx_traireviews_status ON public.time_report_ai_reviews (organization_id, review_status);

CREATE OR REPLACE FUNCTION public.set_time_report_ai_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_traireviews_updated_at ON public.time_report_ai_reviews;
CREATE TRIGGER trg_traireviews_updated_at
BEFORE UPDATE ON public.time_report_ai_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_time_report_ai_reviews_updated_at();

CREATE OR REPLACE FUNCTION public.supersede_old_time_report_ai_reviews()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.review_status = 'suggested' THEN
    UPDATE public.time_report_ai_reviews
       SET review_status = 'superseded', updated_at = now()
     WHERE block_id = NEW.block_id
       AND organization_id = NEW.organization_id
       AND id <> NEW.id
       AND review_status = 'suggested';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_traireviews_supersede ON public.time_report_ai_reviews;
CREATE TRIGGER trg_traireviews_supersede
AFTER INSERT ON public.time_report_ai_reviews
FOR EACH ROW EXECUTE FUNCTION public.supersede_old_time_report_ai_reviews();

ALTER TABLE public.time_report_ai_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reviews_select_same_org"
  ON public.time_report_ai_reviews FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "ai_reviews_update_decision_same_org"
  ON public.time_report_ai_reviews FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND public.has_role('admin'::app_role, auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );