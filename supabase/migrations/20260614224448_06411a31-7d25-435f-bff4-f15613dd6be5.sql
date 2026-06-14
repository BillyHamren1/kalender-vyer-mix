
-- ============================================================
-- Packing work history & control sessions (idempotent)
-- ============================================================

-- packing_work_sessions
CREATE TABLE IF NOT EXISTS public.packing_work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  signed_at timestamptz,
  signature_name text,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_work_sessions TO authenticated;
GRANT ALL ON public.packing_work_sessions TO service_role;
ALTER TABLE public.packing_work_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='packing_work_sessions' AND policyname='org_filter_packing_work_sessions') THEN
    CREATE POLICY org_filter_packing_work_sessions ON public.packing_work_sessions
      FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
      WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_packing_work_sessions_packing_id ON public.packing_work_sessions(packing_id);
CREATE INDEX IF NOT EXISTS idx_packing_work_sessions_staff_id ON public.packing_work_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_packing_work_sessions_created_at ON public.packing_work_sessions(created_at);

-- packing_work_session_events
CREATE TABLE IF NOT EXISTS public.packing_work_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  session_id uuid REFERENCES public.packing_work_sessions(id) ON DELETE CASCADE,
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  packing_list_item_id uuid REFERENCES public.packing_list_items(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  quantity_delta integer NOT NULL DEFAULT 0,
  product_name text,
  before_quantity integer,
  after_quantity integer,
  parcel_id uuid REFERENCES public.packing_parcels(id) ON DELETE SET NULL,
  scan_value text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_work_session_events TO authenticated;
GRANT ALL ON public.packing_work_session_events TO service_role;
ALTER TABLE public.packing_work_session_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='packing_work_session_events' AND policyname='org_filter_packing_work_session_events') THEN
    CREATE POLICY org_filter_packing_work_session_events ON public.packing_work_session_events
      FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
      WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_packing_work_session_events_packing_id ON public.packing_work_session_events(packing_id);
CREATE INDEX IF NOT EXISTS idx_packing_work_session_events_session_id ON public.packing_work_session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_packing_work_session_events_staff_id ON public.packing_work_session_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_packing_work_session_events_created_at ON public.packing_work_session_events(created_at);

-- packing_control_sessions
CREATE TABLE IF NOT EXISTS public.packing_control_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  signed_at timestamptz,
  signature_name text,
  status text NOT NULL DEFAULT 'active',
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_control_sessions TO authenticated;
GRANT ALL ON public.packing_control_sessions TO service_role;
ALTER TABLE public.packing_control_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='packing_control_sessions' AND policyname='org_filter_packing_control_sessions') THEN
    CREATE POLICY org_filter_packing_control_sessions ON public.packing_control_sessions
      FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
      WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_packing_control_sessions_packing_id ON public.packing_control_sessions(packing_id);
CREATE INDEX IF NOT EXISTS idx_packing_control_sessions_staff_id ON public.packing_control_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_packing_control_sessions_created_at ON public.packing_control_sessions(created_at);

-- packing_control_session_items
CREATE TABLE IF NOT EXISTS public.packing_control_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  control_session_id uuid REFERENCES public.packing_control_sessions(id) ON DELETE CASCADE,
  packing_id uuid NOT NULL REFERENCES public.packing_projects(id) ON DELETE CASCADE,
  packing_list_item_id uuid REFERENCES public.packing_list_items(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  expected_quantity integer NOT NULL,
  answer text NOT NULL CHECK (answer IN ('yes','no')),
  comment text,
  staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_control_session_items TO authenticated;
GRANT ALL ON public.packing_control_session_items TO service_role;
ALTER TABLE public.packing_control_session_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='packing_control_session_items' AND policyname='org_filter_packing_control_session_items') THEN
    CREATE POLICY org_filter_packing_control_session_items ON public.packing_control_session_items
      FOR ALL USING (organization_id = get_user_organization_id(auth.uid()))
      WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_packing_control_session_items_packing_id ON public.packing_control_session_items(packing_id);
CREATE INDEX IF NOT EXISTS idx_packing_control_session_items_control_session_id ON public.packing_control_session_items(control_session_id);
CREATE INDEX IF NOT EXISTS idx_packing_control_session_items_staff_id ON public.packing_control_session_items(staff_id);
CREATE INDEX IF NOT EXISTS idx_packing_control_session_items_created_at ON public.packing_control_session_items(created_at);

-- packing_projects: control-status kolumner
ALTER TABLE public.packing_projects
  ADD COLUMN IF NOT EXISTS control_status text DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS control_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS control_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS control_signed_by text,
  ADD COLUMN IF NOT EXISTS control_signed_by_staff_id text REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS control_signed_at timestamptz;

-- updated_at-trigger för sessions-tabellerna (om hjälpfunktionen finns)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_packing_work_sessions_updated_at') THEN
      CREATE TRIGGER trg_packing_work_sessions_updated_at
        BEFORE UPDATE ON public.packing_work_sessions
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_packing_control_sessions_updated_at') THEN
      CREATE TRIGGER trg_packing_control_sessions_updated_at
        BEFORE UPDATE ON public.packing_control_sessions
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;
