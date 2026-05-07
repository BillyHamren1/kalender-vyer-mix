CREATE TABLE public.unclear_segment_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,
  segment_id text NOT NULL,
  segment_date date NOT NULL,
  segment_start_ts timestamptz NOT NULL,
  segment_end_ts timestamptz NOT NULL,
  segment_kind text NOT NULL,
  suggested_type text NOT NULL CHECK (suggested_type IN ('other_place','transport','needs_user_input')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  needs_user_input boolean NOT NULL DEFAULT false,
  user_question text,
  explanation text NOT NULL,
  model text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, segment_id)
);

CREATE INDEX idx_unclear_seg_ai_org_date ON public.unclear_segment_ai_analyses (organization_id, segment_date);
CREATE INDEX idx_unclear_seg_ai_staff_date ON public.unclear_segment_ai_analyses (staff_id, segment_date);

ALTER TABLE public.unclear_segment_ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_unclear_seg_ai"
  ON public.unclear_segment_ai_analyses FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())
    AND (
      public.has_role('admin'::app_role, auth.uid())
      OR public.has_role('projekt'::app_role, auth.uid())
      OR public.has_role('lager'::app_role, auth.uid())
    )
  );

CREATE POLICY "staff_read_own_unclear_seg_ai"
  ON public.unclear_segment_ai_analyses FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff_members WHERE user_id = auth.uid()));

CREATE TRIGGER trg_unclear_seg_ai_updated
  BEFORE UPDATE ON public.unclear_segment_ai_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();