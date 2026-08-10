/**
 * STEG 3F — Source authority för Planning-projections (projects / jobs / packing_projects).
 *
 * Ren, testbar modul (inga DB-anrop). Definierar:
 *  - Field ownership: vilka fält Booking äger och vilka Planning/WMS äger.
 *  - Mutation gates: ingen projection-mutation utan kontrakt + revision + lease.
 *  - Destructive gates: normal found:true-sync får ALDRIG cancella/radera projections.
 *  - Allowlist-patchbyggare: ingen blanket-upsert av extern payload.
 *
 * Fail-closed: saknas bevis → ingen mutation (och absolut ingen destruktiv operation).
 */

// ── FIELD OWNERSHIP ────────────────────────────────────────────────────────

/** projects: fält som Booking äger och därför får skriva vid normal sync. */
export const BOOKING_OWNED_PROJECT_FIELDS = [
  'client',
  'contact_name',
  'contact_email',
  'contact_phone',
  'deliveryaddress',
  'delivery_city',
  'delivery_postal_code',
  'rigdaydate',
  'eventdate',
  'rigdowndate',
  'rig_start_time',
  'rig_end_time',
  'event_start_time',
  'event_end_time',
  'rigdown_start_time',
  'rigdown_end_time',
] as const;

/** projects: Planning-ägda fält. Booking-sync får ALDRIG skriva/nolla dessa. */
export const PLANNING_OWNED_PROJECT_FIELDS = [
  'id',
  'organization_id',
  'name',
  'status',
  'planning_status',
  'project_leader',
  'description',
  'internalnotes',
  'is_internal',
  'location_id',
  'deleted_at',
  'created_at',
  'address_geofence_mode',
  'address_geofence_polygon',
  'address_radius_meters',
  'delivery_latitude',
  'delivery_longitude',
  'customer_pickup',
] as const;

/** jobs: Booking äger i praktiken bara namnunderlaget. */
export const BOOKING_OWNED_JOB_FIELDS = ['name'] as const;

/** jobs: Planning-ägt (status = lokal arbetsstatus, får ej nollas av normal sync). */
export const PLANNING_OWNED_JOB_FIELDS = [
  'id',
  'organization_id',
  'status',
  'deleted_at',
  'created_at',
] as const;

/** packing_projects: administrativa fält som speglas från Booking. */
export const BOOKING_OWNED_PACKING_FIELDS = [
  'name',
  'client_name',
  'start_date',
  'end_date',
  'delivery_address',
  'notes',
] as const;

/**
 * packing_projects: WMS-/lager-ägd fysisk packstatus.
 * Booking-sync får ALDRIG skriva dessa — de ägs av scanner/kontrollräkning.
 */
export const WMS_OWNED_PACKING_FIELDS = [
  'status',
  'control_status',
  'control_started_at',
  'control_completed_at',
  'control_signed_at',
  'control_signed_by',
  'control_signed_by_staff_id',
  'signed_at',
  'signed_by',
  'signed_by_staff_id',
  'needs_packing_review',
  'needs_packing_review_reason',
  'warehouse_project_id',
  'large_project_id',
  'project_leader',
] as const;

const PROTECTED_BY_TABLE: Record<ProjectionTable, readonly string[]> = {
  projects: [...PLANNING_OWNED_PROJECT_FIELDS],
  jobs: [...PLANNING_OWNED_JOB_FIELDS],
  packing_projects: [...WMS_OWNED_PACKING_FIELDS, 'id', 'organization_id', 'booking_id', 'created_at'],
};

const ALLOWED_BY_TABLE: Record<ProjectionTable, readonly string[]> = {
  projects: BOOKING_OWNED_PROJECT_FIELDS,
  jobs: BOOKING_OWNED_JOB_FIELDS,
  packing_projects: BOOKING_OWNED_PACKING_FIELDS,
};

export type ProjectionTable = 'projects' | 'jobs' | 'packing_projects';

export const PROJECTION_MUTATION_BLOCKED_LOG = 'projection_mutation_blocked';
export const PROJECTION_DESTRUCTIVE_BLOCKED_LOG = 'projection_destructive_sync_blocked';

// ── CONTEXT & GATES ────────────────────────────────────────────────────────

export interface ProjectionSyncContext {
  /** Booking-svaret var ett äkta found:true (ej fallback/not_found/cache). */
  sourceFound: boolean;
  /** Revision/kontrakt validerat för denna booking. */
  revisionValidated: boolean;
  /** Lease ägs av denna körning. */
  leaseOwned: boolean;
  /** Något fel inträffade vid hämtning av källdata. */
  hadSourceError?: boolean;
  /** Sant endast när källan explicit säger att projection-underlaget är komplett. */
  projectionComplete?: boolean;
  organizationId?: string | null;
  bookingId?: string | null;
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

/** Ingen projection-mutation utan source-bevis + revision + lease. */
export function canMutateProjection(ctx: ProjectionSyncContext): GateResult {
  if (!ctx) return { allowed: false, reason: 'missing_context' };
  if (!ctx.sourceFound) return { allowed: false, reason: 'source_not_found' };
  if (!ctx.revisionValidated) return { allowed: false, reason: 'revision_not_validated' };
  if (!ctx.leaseOwned) return { allowed: false, reason: 'lease_not_owned' };
  if (ctx.hadSourceError) return { allowed: false, reason: 'source_error' };
  if (!ctx.organizationId) return { allowed: false, reason: 'missing_organization_id' };
  if (!ctx.bookingId) return { allowed: false, reason: 'missing_booking_id' };
  return { allowed: true };
}

/**
 * Destruktiv projection-operation (cancel project/job, delete packing project,
 * radera assignments) vid NORMAL found:true-sync.
 *
 * Policy 3F: normal sync får aldrig göra detta. Cancellation-flödet är ett eget,
 * separat spår och berörs inte av denna gate.
 */
export function canDestroyProjection(ctx: ProjectionSyncContext): GateResult {
  const base = canMutateProjection(ctx);
  if (!base.allowed) return base;
  if (ctx.projectionComplete !== true) {
    return { allowed: false, reason: 'projection_source_incomplete' };
  }
  return { allowed: false, reason: 'normal_sync_never_destructive' };
}

// ── ALLOWLIST-PATCH ────────────────────────────────────────────────────────

function isAbsent(value: unknown): boolean {
  return value === undefined;
}

export interface ProjectionPatchResult {
  patch: Record<string, unknown>;
  skippedAbsent: string[];
  blockedProtected: string[];
}

/**
 * Bygger en explicit allowlist-patch för en projection.
 * - Endast Booking-ägda fält får passera.
 * - `undefined` (fältet saknas i partial source-response) skippas — nollas aldrig.
 * - Planning-/WMS-ägda fält blockeras även om de finns i payloaden.
 */
export function buildProjectionPatch(
  table: ProjectionTable,
  source: Record<string, unknown>,
): ProjectionPatchResult {
  const allowed = ALLOWED_BY_TABLE[table];
  const protectedFields = new Set(PROTECTED_BY_TABLE[table]);
  const patch: Record<string, unknown> = {};
  const skippedAbsent: string[] = [];
  const blockedProtected: string[] = [];

  for (const key of Object.keys(source || {})) {
    if (protectedFields.has(key)) {
      blockedProtected.push(key);
      continue;
    }
    if (!allowed.includes(key)) {
      blockedProtected.push(key);
      continue;
    }
    if (isAbsent(source[key])) {
      skippedAbsent.push(key);
      continue;
    }
    patch[key] = source[key];
  }

  return { patch, skippedAbsent, blockedProtected };
}

/** True om patchen faktiskt innehåller något att skriva. */
export function hasProjectionChanges(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length > 0;
}

/** Säkerhetsnät: kastar om en patch försöker skriva skyddade fält. */
export function assertNoProtectedFields(table: ProjectionTable, patch: Record<string, unknown>): void {
  const protectedFields = PROTECTED_BY_TABLE[table];
  const violations = Object.keys(patch || {}).filter((k) => protectedFields.includes(k));
  if (violations.length > 0) {
    throw new Error(`${PROJECTION_MUTATION_BLOCKED_LOG}: ${table} patch touches protected fields ${violations.join(',')}`);
  }
}
