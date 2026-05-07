CREATE TABLE public.staff_day_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  day_date date NOT NULL,
  segment_id text,
  actor text NOT NULL CHECK (actor IN ('rule_engine','ai','user','admin','watchdog','system')),
  action text NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  confidence numeric,
  source_function text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sddl_staff_day ON public.staff_day_decision_log (staff_id, day_date DESC);
CREATE INDEX idx_sddl_org_day ON public.staff_day_decision_log (organization_id, day_date DESC);
CREATE INDEX idx_sddl_segment ON public.staff_day_decision_log (segment_id) WHERE segment_id IS NOT NULL;

ALTER TABLE public.staff_day_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_roles_read_decision_log"
ON public.staff_day_decision_log
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_planning_access(auth.uid())
);

CREATE POLICY "staff_read_own_decision_log"
ON public.staff_day_decision_log
FOR SELECT
TO authenticated
USING (
  staff_id::text IN (
    SELECT id::text FROM public.staff_members
    WHERE user_id::text = auth.uid()::text
  )
);

CREATE POLICY "service_role_writes_decision_log"
ON public.staff_day_decision_log
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE TABLE public.staff_day_rebuild_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  day_date date NOT NULL,
  reason text NOT NULL,
  requested_by text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX idx_sdrq_pending ON public.staff_day_rebuild_queue (status, requested_at)
  WHERE status IN ('pending','processing');
CREATE INDEX idx_sdrq_staff_day ON public.staff_day_rebuild_queue (staff_id, day_date);

ALTER TABLE public.staff_day_rebuild_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_roles_read_rebuild_queue"
ON public.staff_day_rebuild_queue
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.has_planning_access(auth.uid())
);

CREATE POLICY "service_role_manages_rebuild_queue"
ON public.staff_day_rebuild_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
