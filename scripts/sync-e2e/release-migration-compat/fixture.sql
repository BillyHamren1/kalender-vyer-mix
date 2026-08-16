-- ─────────────────────────────────────────────────────────────────────────────
-- STEG 4Z · RELEASE MIGRATION COMPATIBILITY FIXTURE
--
-- Detta är ett CONTRACT FIXTURE. Det är INTE en historisk baseline, INTE en
-- rekonstruerad produktionsdatabas och INTE en verifierad historisk replay.
-- Syftet är enbart att tillhandahålla de minsta objekt som krävs för att de 12
-- release-migrationerna ska kunna exekveras sekventiellt och verifieras.
--
-- Provenance-märkning per objekt:
--   CURRENT_STATE_CONTRACT  = objektet saknas i migrationshistoriken. Formen här
--                             är härledd ur nuvarande runtime-kontrakt (vad
--                             release-migrationerna och deras funktioner kräver).
--   VERIFIED_EXISTENCE_ONLY = objektets existens är belagd, men inte dess exakta
--                             historiska CREATE-definition.
--   VERIFIED_PRESTATE       = definitionen finns ordagrant i repots migrationer
--                             och appliceras därifrån (se prestate.sh).
-- ─────────────────────────────────────────────────────────────────────────────

-- CURRENT_STATE_CONTRACT: organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: bookings (endast kolumner som release-scope rör)
CREATE TABLE IF NOT EXISTS public.bookings (
  id text PRIMARY KEY,
  client text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  status text,
  needs_review boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  rigdaydate text,
  eventdate text,
  rigdowndate text,
  last_applied_source_revision jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: booking_changes (auditmål för revision commit)
CREATE TABLE IF NOT EXISTS public.booking_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  organization_id uuid,
  change_type text,
  changed_fields jsonb,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: calendar_events
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  organization_id uuid,
  event_type text,
  source_date date,
  resource_id text,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: booking_staff_assignments (utan unik identitet här –
-- legacy-identiteten sätts av variant-filerna, se variant_*.sql)
CREATE TABLE IF NOT EXISTS public.booking_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  staff_id text NOT NULL,
  team_id text NOT NULL,
  assignment_date date NOT NULL,
  role text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: staff_assignments
CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  team_id text NOT NULL,
  assignment_date date NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: staff_members
CREATE TABLE IF NOT EXISTS public.staff_members (
  id text PRIMARY KEY,
  name text NOT NULL,
  organization_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: booking_products
CREATE TABLE IF NOT EXISTS public.booking_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  organization_id uuid,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: projects
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  organization_id uuid,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: jobs
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  organization_id uuid,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: packing_projects / packing_list_items
CREATE TABLE IF NOT EXISTS public.packing_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.packing_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_id uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: warehouse_calendar_events (legacy unikhet = variant)
CREATE TABLE IF NOT EXISTS public.warehouse_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  booking_id text,
  event_type text,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: warehouse_assignments
CREATE TABLE IF NOT EXISTS public.warehouse_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  booking_id text,
  staff_id text,
  assignment_date date,
  assignment_type text,
  action text,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: booking_source_state (baskolumner; lease-kolumnerna
-- läggs på av VERIFIED_PRESTATE-migrationen 20260805053328)
CREATE TABLE IF NOT EXISTS public.booking_source_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  booking_id text NOT NULL,
  applied_source_updated_at timestamptz,
  applied_source_version bigint,
  applied_source_status text,
  pending_source_updated_at timestamptz,
  pending_source_version bigint,
  pending_source_status text,
  pending_started_at timestamptz,
  revision_kind text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, booking_id)
);

-- CURRENT_STATE_CONTRACT: sync_state
CREATE TABLE IF NOT EXISTS public.sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  sync_type text NOT NULL,
  last_sync_timestamp timestamptz,
  last_sync_status text,
  last_sync_mode text,
  metadata jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sync_type)
);

-- CURRENT_STATE_CONTRACT: booking_sync_jobs (worker_token/worker_id/
-- lease_expires_at tillförs av release-migration 20260813224629)
CREATE TABLE IF NOT EXISTS public.booking_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  organization_id text,
  event_type text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  processed_at timestamptz,
  error_message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: sync_batches / sync_batch_jobs
CREATE TABLE IF NOT EXISTS public.sync_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  sync_type text,
  planned_cursor timestamptz,
  status text NOT NULL DEFAULT 'pending',
  succeeded_jobs integer,
  failed_jobs integer,
  total_jobs integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sync_batch_jobs (
  batch_id uuid NOT NULL REFERENCES public.sync_batches(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.booking_sync_jobs(id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id, job_id)
);

-- CURRENT_STATE_CONTRACT: large project-objekt (BSA-triggerfunktionerna läser dem)
CREATE TABLE IF NOT EXISTS public.large_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  deleted_at timestamptz,
  start_date text[],
  event_date text[],
  end_date text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.large_project_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id uuid,
  booking_id text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.large_project_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id uuid,
  staff_id text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: establishment_tasks (aktivitets-BSA)
CREATE TABLE IF NOT EXISTS public.establishment_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid,
  organization_id uuid,
  assigned_to_ids text[],
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CURRENT_STATE_CONTRACT: organization_locations
CREATE TABLE IF NOT EXISTS public.organization_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  show_as_project boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants: historisk grant-state är UNKNOWN_HISTORICAL. Här sätts endast det
-- CURRENT_STATE_CONTRACT som krävs för att kunna verifiera migrationernas
-- avsedda slutläge (revoke/grant-postconditions).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
