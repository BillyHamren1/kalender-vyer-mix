
-- Lärande regelbok för AI-tidsgranskaren
CREATE TABLE IF NOT EXISTS public.staff_time_learning_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  staff_id TEXT,                     -- NULL = gäller hela org
  project_id UUID,                   -- NULL = gäller alla projekt
  large_project_id UUID,
  booking_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('staff','project','staff_project','org')),
  pattern_type TEXT NOT NULL,        -- t.ex. 'night_shift_ok','travel_home_via_warehouse','short_visit_counts','geofence_lag_typical','recurring_offsite_lunch'
  pattern_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  human_readable TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  verified_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES public.staff_time_learning_rules(id) ON DELETE SET NULL,
  learned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'ai',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stlr_org_staff ON public.staff_time_learning_rules(organization_id, staff_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_stlr_org_project ON public.staff_time_learning_rules(organization_id, project_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_stlr_org_pattern ON public.staff_time_learning_rules(organization_id, pattern_type) WHERE active = true;

ALTER TABLE public.staff_time_learning_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read learning rules"
ON public.staff_time_learning_rules FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Org admins manage learning rules"
ON public.staff_time_learning_rules FOR ALL
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

-- Utöka correction_suggestions med AI-fält (idempotent)
ALTER TABLE public.time_report_correction_suggestions
  ADD COLUMN IF NOT EXISTS ai_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_verdict TEXT,
  ADD COLUMN IF NOT EXISTS applied_by_ai BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apply_rule TEXT,
  ADD COLUMN IF NOT EXISTS undo_payload JSONB,
  ADD COLUMN IF NOT EXISTS learning_rule_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

-- Audit-tabell för AI-körningar (debug + lärande)
CREATE TABLE IF NOT EXISTS public.ai_time_review_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  staff_id TEXT NOT NULL,
  report_date DATE NOT NULL,
  trigger_source TEXT NOT NULL,            -- 'block_stop' | 'manual' | 'realtime_admin'
  triggered_by TEXT,
  verdict TEXT NOT NULL,                   -- 'clean' | 'wait_for_next' | 'suggested' | 'auto_applied' | 'error'
  confidence NUMERIC,
  reasoning TEXT,
  model TEXT,
  input_signature TEXT,
  suggestions_created INTEGER NOT NULL DEFAULT 0,
  auto_applied_count INTEGER NOT NULL DEFAULT 0,
  rules_used UUID[] NOT NULL DEFAULT '{}'::uuid[],
  rules_learned UUID[] NOT NULL DEFAULT '{}'::uuid[],
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_staff_date ON public.ai_time_review_runs(staff_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_org_date ON public.ai_time_review_runs(organization_id, report_date DESC);

ALTER TABLE public.ai_time_review_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read ai runs"
ON public.ai_time_review_runs FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

-- INSERT/UPDATE sker enbart från service role (edge function), ingen klient-policy.
