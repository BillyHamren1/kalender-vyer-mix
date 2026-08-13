-- STEG 4D: safe, idempotent indexes only. No data changes, no unique constraints added.

CREATE INDEX IF NOT EXISTS idx_bookings_org ON public.bookings (organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org_status ON public.bookings (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_org_needs_review ON public.bookings (organization_id) WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS idx_booking_products_booking_id ON public.booking_products (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_products_org_booking ON public.booking_products (organization_id, booking_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_org_booking ON public.calendar_events (organization_id, booking_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_org_source_date ON public.calendar_events (organization_id, source_date);

CREATE INDEX IF NOT EXISTS idx_warehouse_events_org_start_time ON public.warehouse_calendar_events (organization_id, start_time);

CREATE INDEX IF NOT EXISTS idx_projects_org_booking ON public.projects (organization_id, booking_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON public.projects (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_jobs_org_booking ON public.jobs (organization_id, booking_id);

CREATE INDEX IF NOT EXISTS idx_packing_projects_org_booking ON public.packing_projects (organization_id, booking_id);
CREATE INDEX IF NOT EXISTS idx_packing_list_items_org_packing ON public.packing_list_items (organization_id, packing_id);

CREATE INDEX IF NOT EXISTS idx_booking_source_state_lock_expiry ON public.booking_source_state (lock_expires_at) WHERE lock_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_source_state_org_updated ON public.booking_source_state (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_source_state_pending ON public.booking_source_state (organization_id, booking_id) WHERE revision_kind IS NOT NULL AND pending_started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_state_org_type ON public.sync_state (organization_id, sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_org_status ON public.booking_sync_jobs (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_batches_org_started ON public.sync_batches (organization_id, started_at DESC);