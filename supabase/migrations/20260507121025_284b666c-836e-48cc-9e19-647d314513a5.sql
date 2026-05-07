ALTER TABLE public.unclear_segment_ai_analyses
  ADD COLUMN IF NOT EXISTS tracking_policy_recommendation jsonb,
  ADD COLUMN IF NOT EXISTS keep_as_type text;

COMMENT ON COLUMN public.unclear_segment_ai_analyses.tracking_policy_recommendation IS
  'Optional AI hint for trackingPolicy (mode/heartbeatMs/reason). Advisory only — never overrides backend policy.';
COMMENT ON COLUMN public.unclear_segment_ai_analyses.keep_as_type IS
  'When AI is unsure, segment is kept as this type (default other_place). AI must never decrease payable time.';