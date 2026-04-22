-- ============================================================================
-- assistant_events — Failproof event-/resolution-modell för geofence-hjälparen
-- ============================================================================

CREATE TYPE public.assistant_event_type AS ENUM (
  'arrival', 'departure', 'home_arrival', 'travel_edge'
);

CREATE TYPE public.assistant_event_target_type AS ENUM (
  'location', 'project', 'booking', 'home', 'unknown'
);

CREATE TYPE public.assistant_event_source AS ENUM (
  'geofence_foreground', 'geofence_background', 'app_manual', 'system_inferred', 'cron'
);

CREATE TYPE public.assistant_event_suggested_action AS ENUM (
  'start_workday', 'start_activity', 'end_activity', 'end_workday', 'register_travel', 'review_only'
);

CREATE TYPE public.assistant_event_resolution AS ENUM (
  'pending',
  'applied_from_event_time',
  'applied_from_now',
  'applied_from_custom_time',
  'dismissed',
  'merged_into_other_event',
  'auto_closed_by_later_action',
  'ignored_stale'
);

CREATE TABLE public.assistant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id text NOT NULL,                  -- matchar staff_members.id (text)

  event_type public.assistant_event_type NOT NULL,
  target_type public.assistant_event_target_type NOT NULL,
  target_id text,
  target_label text,
  target_address text,

  happened_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  source public.assistant_event_source NOT NULL DEFAULT 'geofence_foreground',

  suggested_action public.assistant_event_suggested_action NOT NULL DEFAULT 'review_only',

  stale_for_prompt boolean NOT NULL DEFAULT false,
  still_relevant_for_review boolean NOT NULL DEFAULT true,

  resolution_status public.assistant_event_resolution NOT NULL DEFAULT 'pending',
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by text,

  linked_workday_id uuid,
  linked_time_report_id uuid,
  linked_travel_log_id uuid,
  merged_into_event_id uuid REFERENCES public.assistant_events(id) ON DELETE SET NULL,

  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX assistant_events_dedupe_key_uq
  ON public.assistant_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX assistant_events_staff_pending_idx
  ON public.assistant_events (staff_id, happened_at DESC)
  WHERE resolution_status = 'pending' AND stale_for_prompt = false;

CREATE INDEX assistant_events_staff_review_idx
  ON public.assistant_events (staff_id, happened_at DESC)
  WHERE still_relevant_for_review = true;

CREATE INDEX assistant_events_org_recent_idx
  ON public.assistant_events (organization_id, happened_at DESC);

CREATE TRIGGER assistant_events_updated_at
  BEFORE UPDATE ON public.assistant_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER assistant_events_set_org
  BEFORE INSERT ON public.assistant_events
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

ALTER TABLE public.assistant_events ENABLE ROW LEVEL SECURITY;

-- Staff: ser och uppdaterar sina egna events
CREATE POLICY "Staff can view their own assistant events"
  ON public.assistant_events FOR SELECT
  USING (
    staff_id IN (
      SELECT sm.id FROM public.staff_members sm
      WHERE sm.email = (SELECT email FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Staff can update their own assistant events"
  ON public.assistant_events FOR UPDATE
  USING (
    staff_id IN (
      SELECT sm.id FROM public.staff_members sm
      WHERE sm.email = (SELECT email FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Staff can insert their own assistant events"
  ON public.assistant_events FOR INSERT
  WITH CHECK (
    staff_id IN (
      SELECT sm.id FROM public.staff_members sm
      WHERE sm.email = (SELECT email FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Admin/projekt/lager: ser alla events i sin org
CREATE POLICY "Org staff can view all assistant events in org"
  ON public.assistant_events FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_planning_access(auth.uid())
  );

CREATE POLICY "Admins can update assistant events in org"
  ON public.assistant_events FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_role('admin', auth.uid())
  );

COMMENT ON TABLE public.assistant_events IS
  'Failproof event-/resolution-modell för geofence-hjälparen. Steg 1: körs parallellt med arrival_prompt_log. Varje arrival/departure/home_arrival är en separat rad. stale_for_prompt vs still_relevant_for_review — data tappas aldrig.';

COMMENT ON COLUMN public.assistant_events.stale_for_prompt IS
  'true = slutar visas aggressivt i prompt-kö (men finns kvar för review om still_relevant_for_review=true).';

COMMENT ON COLUMN public.assistant_events.still_relevant_for_review IS
  'true = ska fortfarande räknas in i dagsavstämning (Steg 2). Sätts till false först när ärendet är helt avklarat.';

COMMENT ON COLUMN public.assistant_events.suggested_action IS
  'Vad UI:t bör föreslå när detta event presenteras. Driver INTE åtgärden — bara presentationen. Ersätter det gamla "auto-checkin"-beteendet.';