/**
 * STEG 4A — fixtures/factories för sync-regressionstester.
 *
 * Alla factories är tenant-medvetna (organization_id är obligatoriskt) och
 * deterministiska. Inga produktionsdata, inga credentials.
 */

export const ORG_A = '00000000-0000-0000-0000-0000000000a1';
export const ORG_B = '00000000-0000-0000-0000-0000000000b2';

let seq = 0;
export const resetFactorySeq = () => {
  seq = 0;
};
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export interface OrganizationRow {
  id: string;
  name: string;
}
export const makeOrganization = (over: Partial<OrganizationRow> = {}): OrganizationRow => ({
  id: over.id ?? ORG_A,
  name: over.name ?? 'Test Org',
});

export interface BookingRow {
  id: string;
  organization_id: string;
  status: string;
  customer_name: string;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  needs_review: boolean;
  needs_review_reason: string | null;
  economics_data: Record<string, number> | null;
  map_drawing_url: string | null;
  last_applied_source_revision: string | null;
  [k: string]: unknown;
}
export const makeBooking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: over.id ?? nextId('bk'),
  organization_id: over.organization_id ?? ORG_A,
  status: 'CONFIRMED',
  customer_name: 'Kund AB',
  rigdaydate: '2026-09-01',
  eventdate: '2026-09-02',
  rigdowndate: '2026-09-03',
  needs_review: false,
  needs_review_reason: null,
  economics_data: null,
  map_drawing_url: null,
  last_applied_source_revision: null,
  ...over,
});

/** Revision som den ser ut i booking_source_state / RPC-state. */
export interface BookingRevisionInput {
  organization_id?: string;
  booking_id: string;
  version?: number | null;
  updated_at?: string | null;
  status?: string;
}
export const makeBookingRevision = (input: BookingRevisionInput) => ({
  organization_id: input.organization_id ?? ORG_A,
  booking_id: input.booking_id,
  applied_updated_at: input.updated_at ?? null,
  applied_version: input.version ?? null,
  applied_status: input.status ?? 'CONFIRMED',
  pending_updated_at: null,
  pending_version: null,
  pending_status: null,
  reservation_token: null,
  owner_job_id: null,
  lock_expires_at: null,
});

export interface ProductRow {
  id: string;
  organization_id: string;
  booking_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  parent_product_id: string | null;
  is_package_component: boolean;
  package_components: unknown[] | null;
}
export const makeProduct = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: over.id ?? nextId('prod'),
  organization_id: over.organization_id ?? ORG_A,
  booking_id: over.booking_id ?? 'bk-1',
  name: 'Tält 6x12',
  quantity: 1,
  unit_price: 1000,
  parent_product_id: null,
  is_package_component: false,
  package_components: null,
  ...over,
});

export const makeAccessory = (parent: ProductRow, over: Partial<ProductRow> = {}): ProductRow =>
  makeProduct({
    booking_id: parent.booking_id,
    organization_id: parent.organization_id,
    name: 'Tillbehör: sidovägg',
    parent_product_id: parent.id,
    ...over,
  });

export interface CalendarEventRowFixture {
  id: string;
  organization_id: string;
  booking_id: string | null;
  event_type: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  resource_id: string | null;
  source: string | null;
  [k: string]: unknown;
}
export const makeCalendarEvent = (over: Partial<CalendarEventRowFixture> = {}): CalendarEventRowFixture => ({
  id: over.id ?? nextId('cal'),
  organization_id: over.organization_id ?? ORG_A,
  booking_id: over.booking_id ?? 'bk-1',
  event_type: 'rig',
  date: '2026-09-01',
  start_time: '08:00',
  end_time: '12:00',
  resource_id: 'team-1',
  source: 'booking_import',
  ...over,
});

/** Manuellt (Planning-ägt) event som aldrig får raderas av syncen. */
export const makeManualCalendarEvent = (over: Partial<CalendarEventRowFixture> = {}): CalendarEventRowFixture =>
  makeCalendarEvent({ event_type: 'internal', source: 'manual', ...over });

export interface ProjectRow {
  id: string;
  organization_id: string;
  booking_id: string | null;
  name: string;
  status: string;
  planning_status: string;
  internalnotes: string | null;
  project_leader: string | null;
}
export const makeProject = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: over.id ?? nextId('proj'),
  organization_id: over.organization_id ?? ORG_A,
  booking_id: over.booking_id ?? 'bk-1',
  name: 'Projekt',
  status: 'active',
  planning_status: 'planned',
  internalnotes: null,
  project_leader: null,
  ...over,
});

export const makeLargeProject = (over: Record<string, unknown> = {}) => ({
  id: nextId('lp'),
  organization_id: ORG_A,
  name: 'Stort projekt',
  status: 'active',
  ...over,
});

export interface JobRow {
  id: string;
  organization_id: string;
  booking_id: string;
  name: string;
}
export const makeJob = (over: Partial<JobRow> = {}): JobRow => ({
  id: over.id ?? nextId('job'),
  organization_id: over.organization_id ?? ORG_A,
  booking_id: over.booking_id ?? 'bk-1',
  name: 'Jobb',
  ...over,
});

export interface PackingProjectRow {
  id: string;
  organization_id: string;
  booking_id: string;
  status: string;
  packed_count: number;
  name: string;
}
export const makePackingProject = (over: Partial<PackingProjectRow> = {}): PackingProjectRow => ({
  id: over.id ?? nextId('pack'),
  organization_id: over.organization_id ?? ORG_A,
  booking_id: over.booking_id ?? 'bk-1',
  status: 'planning',
  packed_count: 0,
  name: 'Packning',
  ...over,
});

export interface PackingItemRow {
  id: string;
  organization_id: string;
  packing_project_id: string;
  booking_product_id: string | null;
  name: string;
  quantity: number;
  packed_quantity: number;
}
export const makePackingItem = (over: Partial<PackingItemRow> = {}): PackingItemRow => ({
  id: over.id ?? nextId('pitem'),
  organization_id: over.organization_id ?? ORG_A,
  packing_project_id: over.packing_project_id ?? 'pack-1',
  booking_product_id: over.booking_product_id ?? null,
  name: 'Tält 6x12',
  quantity: 1,
  packed_quantity: 0,
  ...over,
});

export interface SyncJobRow {
  id: string;
  organization_id: string;
  booking_id: string;
  event_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  batch_id: string | null;
}
export const makeSyncJob = (over: Partial<SyncJobRow> = {}): SyncJobRow => ({
  id: over.id ?? nextId('sjob'),
  organization_id: over.organization_id ?? ORG_A,
  booking_id: over.booking_id ?? 'bk-1',
  event_type: 'booking.updated',
  status: 'pending',
  attempts: 0,
  max_attempts: 5,
  batch_id: null,
  ...over,
});

export interface SyncBatchRow {
  id: string;
  organization_id: string;
  sync_type: string;
  planned_cursor: string;
  status: 'pending' | 'success' | 'partial' | 'failed';
  total_jobs: number;
}
export const makeSyncBatch = (over: Partial<SyncBatchRow> = {}): SyncBatchRow => ({
  id: over.id ?? nextId('batch'),
  organization_id: over.organization_id ?? ORG_A,
  sync_type: 'bookings',
  planned_cursor: '2026-08-01T10:00:00.000Z',
  status: 'pending',
  total_jobs: 1,
  ...over,
});

export const makeSyncState = (over: Record<string, unknown> = {}) => ({
  organization_id: ORG_A,
  sync_type: 'bookings',
  last_sync_timestamp: '2026-07-01T00:00:00.000Z',
  last_sync_status: 'success',
  ...over,
});

export const makeBookingSourceState = (over: Record<string, unknown> = {}) => ({
  organization_id: ORG_A,
  booking_id: 'bk-1',
  last_applied_source_updated_at: null,
  last_applied_source_version: null,
  last_applied_source_status: 'CONFIRMED',
  reservation_token: null,
  lock_expires_at: null,
  ...over,
});

/** Ett komplett source-payload från Booking (single booking endpoint). */
export const makeSourcePayload = (over: Record<string, unknown> = {}) => ({
  contract_version: '1.1',
  found: true,
  result: 'found',
  booking: {
    id: 'bk-1',
    status: 'CONFIRMED',
    source_version: 2,
    customer_name: 'Kund AB',
    rigdaydate: '2026-09-01',
    eventdate: '2026-09-02',
    rigdowndate: '2026-09-03',
    products_complete: true,
    products: [],
  },
  ...over,
});

/** Två organisationer med identiskt booking-id — för cross-tenant-tester. */
export const makeTwoTenantWorld = () => {
  const bookingId = 'shared-booking-1';
  const a = makeBooking({ id: bookingId, organization_id: ORG_A, customer_name: 'Org A kund' });
  const b = makeBooking({ id: bookingId, organization_id: ORG_B, customer_name: 'Org B kund' });
  const pa = makeProduct({ booking_id: bookingId, organization_id: ORG_A, name: 'A-produkt' });
  const pb = makeProduct({ booking_id: bookingId, organization_id: ORG_B, name: 'B-produkt' });
  const ca = makeCalendarEvent({ booking_id: bookingId, organization_id: ORG_A });
  const cb = makeCalendarEvent({ booking_id: bookingId, organization_id: ORG_B });
  return { bookingId, bookings: [a, b], products: [pa, pb], calendar: [ca, cb] };
};
