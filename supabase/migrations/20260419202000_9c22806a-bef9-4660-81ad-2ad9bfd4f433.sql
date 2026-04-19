-- ──────────────────────────────────────────────────────────────────────────
-- workday_flags — first-class store for "the system saw something it can't
-- safely decide on its own". Distinct from `time_report_anomalies`, which
-- is a raw geofence presence log. A workday_flag is interpretive: it
-- captures uncertainty (missing break, unclear day end, presence without
-- report, …) and gives staff + admins a place to resolve it.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE public.workday_flags (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Who the flag is about. staff_id is text to match the rest of the
  -- mobile/staff stack (staff_members.id is uuid but referenced as text
  -- everywhere through mobile-app-api).
  staff_id                 text        NOT NULL,

  -- What kind of uncertainty this is. Open text + CHECK so we can extend
  -- without an enum migration. Values mirror the anomaly catalogue v2
  -- decided in PROMPT 6 plus the legacy client-detected types so admin
  -- views can render both from one source if/when we choose to persist
  -- those too.
  flag_type                text        NOT NULL CHECK (flag_type IN (
    -- New v2 types (the focus of this prompt)
    'missing_break',
    'unclear_day_end',
    'presence_without_report',
    'activity_ended_day_continues',
    'geofence_presence_mismatch',
    -- Legacy/optional persisted variants of the in-memory detections
    'team_time_deviation',
    'unreasonable_travel',
    'time_gap',
    'missing_report',
    'long_day',
    'overlapping_times'
  )),
  severity                 text        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'error')),

  -- Calendar day the flag refers to (not when it was created).
  flag_date                date        NOT NULL,

  title                    text        NOT NULL,
  description              text,

  -- TRUE → drives the "Mina avvikelser"-list in the mobile app.
  -- The assistant sets this when it genuinely needs the staff member
  -- to clarify before resolving (e.g. "var det rast?"). Reset on resolve.
  needs_user_input         boolean     NOT NULL DEFAULT false,

  -- Trace back to useWorkDayAssistant when the flag was minted there.
  -- NULL for pure post-hoc detections.
  assistant_decision_kind  text,

  -- Optional links to related rows. All nullable — different flag types
  -- attach to different anchors.
  related_time_report_id   uuid        REFERENCES public.time_reports(id)              ON DELETE SET NULL,
  related_booking_id       text,
  related_large_project_id uuid        REFERENCES public.large_projects(id)            ON DELETE SET NULL,
  related_location_id      uuid        REFERENCES public.organization_locations(id)    ON DELETE SET NULL,
  related_anomaly_id       uuid        REFERENCES public.time_report_anomalies(id)     ON DELETE SET NULL,

  -- Free-form extra facts the renderer may want (timer key, distance,
  -- gap minutes, etc). Keeps the schema flexible without per-type columns.
  context                  jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Resolution
  resolved                 boolean     NOT NULL DEFAULT false,
  resolved_at              timestamptz,
  resolution_source        text        CHECK (resolution_source IS NULL OR resolution_source IN ('staff', 'admin', 'auto')),
  resolution_note          text,
  resolved_by              text, -- staff_id or admin user id, free text

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workday_flags IS
  'First-class store for workday uncertainty (missing break, unclear day end, '
  'presence/report mismatch, etc). Distinct from time_report_anomalies which '
  'is a raw geofence presence log. NEVER overwrites or deletes a worker''s '
  'reported time — flags only annotate.';

-- Indexes for the hot query patterns
CREATE INDEX workday_flags_staff_open_idx
  ON public.workday_flags (organization_id, staff_id, flag_date)
  WHERE resolved = false;

CREATE INDEX workday_flags_needs_input_idx
  ON public.workday_flags (organization_id, staff_id, flag_date)
  WHERE resolved = false AND needs_user_input = true;

CREATE INDEX workday_flags_admin_open_idx
  ON public.workday_flags (organization_id, flag_date)
  WHERE resolved = false;

CREATE INDEX workday_flags_resolution_source_idx
  ON public.workday_flags (organization_id, resolution_source)
  WHERE resolved = true;

-- updated_at trigger (reuses existing helper)
CREATE TRIGGER workday_flags_set_updated_at
  BEFORE UPDATE ON public.workday_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.workday_flags ENABLE ROW LEVEL SECURITY;

-- Staff (authenticated app users) can see and resolve their OWN flags.
-- staff_id is matched against the staff_members row attached to the user
-- via the existing profiles → staff_members chain. We keep the policy
-- simple by deferring the heavy lifting to the existing has_role helper
-- for admins, and using a subquery for staff identity.
CREATE POLICY "Staff: read own flags"
  ON public.workday_flags
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      -- Admin/projekt/lager roles see everything in their org
      public.has_planning_access(auth.uid())
      OR
      -- Staff sees rows where staff_id matches a staff_members row they own
      EXISTS (
        SELECT 1 FROM public.staff_members sm
        WHERE sm.id::text = workday_flags.staff_id
          AND sm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff: insert own flags"
  ON public.workday_flags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      public.has_planning_access(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.staff_members sm
        WHERE sm.id::text = workday_flags.staff_id
          AND sm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff: update own flags"
  ON public.workday_flags
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      public.has_planning_access(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.staff_members sm
        WHERE sm.id::text = workday_flags.staff_id
          AND sm.user_id = auth.uid()
      )
    )
  );

-- Service role / edge functions bypass RLS via the service key, so no
-- explicit policy needed for mobile-app-api inserts. Admins additionally
-- get DELETE rights through has_planning_access.
CREATE POLICY "Admin: delete flags"
  ON public.workday_flags
  FOR DELETE
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.has_planning_access(auth.uid())
  );