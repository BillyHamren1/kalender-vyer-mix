/**
 * STEG 4F — Säker re-sync / repair DRY-RUN för EN bokning.
 *
 * REN DIAGNOSTIK. Denna modul innehåller INGA DB-anrop, ingen fetch och
 * ingen mutation. Den jämför canonical Booking-export mot Planning-projektion
 * och returnerar en diff. `remove_candidate` är ALLTID enbart diagnostik —
 * ingenting här får någonsin användas som raderingsintention.
 */
import {
  parseSingleBookingSourceResponse,
  type SingleBookingSourceResult,
} from './singleBookingSource.ts';
import { compareIncomingRevision, type RevisionGuardDecision } from './canonicalRevisionGuard.ts';
import { readProductSourceCompleteness, diffProducts } from './productCompleteness.ts';
import {
  readDateSourceCompleteness,
  buildDatePresence,
  isBookingGeneratedEvent,
  eventCanonicalDate,
  BOOKING_OWNED_DATE_FIELDS,
  PLANNING_ONLY_EVENT_TYPES,
  type CalendarPhase,
} from './calendarSourceAuthority.ts';
import {
  BOOKING_OWNED_PROJECT_FIELDS,
  PLANNING_OWNED_PROJECT_FIELDS,
  BOOKING_OWNED_JOB_FIELDS,
  PLANNING_OWNED_JOB_FIELDS,
  BOOKING_OWNED_PACKING_FIELDS,
  WMS_OWNED_PACKING_FIELDS,
} from './projectionSourceAuthority.ts';

/** Booking-ägda fält på bookings-raden som diffas direkt. */
export const BOOKING_OWNED_BOOKING_FIELDS = [
  'status',
  'client',
  'customer_name',
  'booking_number',
  'deliveryaddress',
  'delivery_city',
  'delivery_postal_code',
  'rigdaydate',
  'eventdate',
  'rigdowndate',
  'total_amount',
] as const;

/** Fält på bookings-raden som Planning äger — visas separat, aldrig som diff. */
export const PLANNING_OWNED_BOOKING_FIELDS = [
  'assigned_to_project',
  'assigned_project_id',
  'assigned_project_name',
  'needs_review',
  'rig_time_locked',
  'event_time_locked',
  'rigdown_time_locked',
  'rig_start_time',
  'rig_end_time',
  'event_start_time',
  'event_end_time',
  'rigdown_start_time',
  'rigdown_end_time',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WILDCARDS = ['*', '%', 'all', 'any'];

/** Nycklar som antyder batch/wildcard — verktyget är strikt single-booking. */
export const FORBIDDEN_REQUEST_KEYS = [
  'booking_ids',
  'bookingIds',
  'all',
  'all_bookings',
  'batch',
  'batch_id',
  'sync_mode',
  'since',
  'start_date',
  'end_date',
  'limit',
  'apply',
  'repair',
  'confirm',
  'force',
] as const;

export interface RepairRequestInput {
  organization_id?: unknown;
  booking_id?: unknown;
  dry_run?: unknown;
  [k: string]: unknown;
}

export type RepairRequestValidation =
  | { ok: true; organizationId: string; bookingId: string }
  | { ok: false; code: string; message: string };

/**
 * Fail-closed validering. Allt som inte är exakt EN bokning + dry_run === true
 * avvisas med 400.
 */
export function validateRepairRequest(body: unknown): RepairRequestValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_body', message: 'Body måste vara ett JSON-objekt' };
  }
  const b = body as RepairRequestInput;

  for (const key of FORBIDDEN_REQUEST_KEYS) {
    if (b[key] !== undefined) {
      return { ok: false, code: 'forbidden_parameter', message: `Parametern "${key}" är inte tillåten (single-booking dry-run only)` };
    }
  }

  if (b.dry_run !== true) {
    return { ok: false, code: 'dry_run_required', message: 'dry_run måste vara exakt true' };
  }

  const orgRaw = b.organization_id;
  if (typeof orgRaw !== 'string' || !UUID_RE.test(orgRaw.trim())) {
    return { ok: false, code: 'invalid_organization_id', message: 'organization_id måste vara ett giltigt UUID' };
  }

  const bookingRaw = b.booking_id;
  if (typeof bookingRaw !== 'string' || bookingRaw.trim().length === 0) {
    return { ok: false, code: 'invalid_booking_id', message: 'booking_id måste vara en icke-tom sträng' };
  }
  const bookingId = bookingRaw.trim();
  if (WILDCARDS.includes(bookingId.toLowerCase()) || bookingId.includes('*') || bookingId.includes('%')) {
    return { ok: false, code: 'wildcard_not_allowed', message: 'Wildcard-booking_id är inte tillåtet' };
  }

  return { ok: true, organizationId: orgRaw.trim(), bookingId };
}

export interface PlanningSnapshot {
  booking: Record<string, unknown> | null;
  products: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  jobs: Record<string, unknown>[];
  packingProjects: Record<string, unknown>[];
  sourceState: Record<string, unknown> | null;
}

export interface FieldDiff {
  field: string;
  planning: unknown;
  booking: unknown;
}

export interface BookingRepairDiff {
  booking_id: string;
  organization_id: string;
  dry_run: true;
  mutations: 0;
  source: { kind: string; reason?: string; code?: string };
  booking_fields: {
    changed: FieldDiff[];
    unchanged_count: number;
    planning_row_missing: boolean;
  };
  products: {
    add: string[];
    update: string[];
    remove_candidate: string[];
    source_completeness: string;
    /** Alltid false i detta verktyg — inget får raderas. */
    delete_would_be_allowed: boolean;
  };
  calendar: {
    missing_in_planning: Array<{ event_type: CalendarPhase; date: string }>;
    date_mismatch: Array<{ event_type: string; planning_date: string; booking_date: string; event_id: string }>;
    remove_candidate: Array<{ event_id: string; event_type: string; date: string }>;
    planning_only_events: Array<{ event_id: string; event_type: string; date: string }>;
    source_completeness: string;
  };
  projections: {
    projects: { count: number; booking_owned_drift: FieldDiff[] };
    jobs: { count: number; booking_owned_drift: FieldDiff[] };
    packing_projects: { count: number; booking_owned_drift: FieldDiff[] };
  };
  planning_owned_state: Record<string, unknown>;
  wms_owned_state: Record<string, unknown>;
  revision: {
    decision: RevisionGuardDecision | 'no_source';
    incoming: { source_updated_at: string | null; source_version: unknown; source_status: string | null };
    local: { source_updated_at: string | null; source_version: unknown; source_status: string | null } | null;
    source_state_present: boolean;
  };
  warnings: string[];
}

const s = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : v == null ? null : String(v);

const eq = (a: unknown, b: unknown): boolean => {
  if (a == null && b == null) return true;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a ?? '') === String(b ?? '');
};

const pick = (row: Record<string, unknown> | null | undefined, fields: readonly string[]) => {
  const out: Record<string, unknown> = {};
  if (!row) return out;
  for (const f of fields) if (f in row) out[f] = row[f];
  return out;
};

const driftFor = (
  rows: Record<string, unknown>[],
  source: Record<string, unknown>,
  fields: readonly string[],
  sourceAlias: Record<string, string> = {},
): FieldDiff[] => {
  const out: FieldDiff[] = [];
  for (const row of rows) {
    for (const f of fields) {
      if (!(f in row)) continue;
      const srcKey = sourceAlias[f] ?? f;
      if (!(srcKey in source)) continue;
      if (!eq(row[f], source[srcKey])) out.push({ field: f, planning: row[f], booking: source[srcKey] });
    }
  }
  return out;
};

/**
 * Bygger hela diffen. Rena beräkningar — INGA mutationer, ingen cursor,
 * ingen revision commit, inga jobb.
 */
export function buildBookingRepairDiff(args: {
  organizationId: string;
  bookingId: string;
  sourcePayload: unknown;
  http?: { ok: boolean; status: number };
  planning: PlanningSnapshot;
}): BookingRepairDiff {
  const { organizationId, bookingId, planning } = args;
  const warnings: string[] = [];

  const source: SingleBookingSourceResult = parseSingleBookingSourceResponse(
    args.sourcePayload,
    { bookingId, organizationId },
    args.http,
  );

  const diff: BookingRepairDiff = {
    booking_id: bookingId,
    organization_id: organizationId,
    dry_run: true,
    mutations: 0,
    source: { kind: source.kind },
    booking_fields: { changed: [], unchanged_count: 0, planning_row_missing: !planning.booking },
    products: {
      add: [],
      update: [],
      remove_candidate: [],
      source_completeness: 'unknown',
      delete_would_be_allowed: false,
    },
    calendar: {
      missing_in_planning: [],
      date_mismatch: [],
      remove_candidate: [],
      planning_only_events: [],
      source_completeness: 'unknown',
    },
    projections: {
      projects: { count: planning.projects.length, booking_owned_drift: [] },
      jobs: { count: planning.jobs.length, booking_owned_drift: [] },
      packing_projects: { count: planning.packingProjects.length, booking_owned_drift: [] },
    },
    planning_owned_state: {
      booking: pick(planning.booking, PLANNING_OWNED_BOOKING_FIELDS),
      projects: planning.projects.map((p) => pick(p, PLANNING_OWNED_PROJECT_FIELDS)),
      jobs: planning.jobs.map((j) => pick(j, PLANNING_OWNED_JOB_FIELDS)),
      planning_only_calendar_event_types: PLANNING_ONLY_EVENT_TYPES,
    },
    wms_owned_state: {
      packing_projects: planning.packingProjects.map((p) => pick(p, WMS_OWNED_PACKING_FIELDS)),
    },
    revision: {
      decision: 'no_source',
      incoming: { source_updated_at: null, source_version: null, source_status: null },
      local: null,
      source_state_present: !!planning.sourceState,
    },
    warnings,
  };

  if (!planning.booking) warnings.push('planning_booking_row_missing');
  if (!planning.sourceState) warnings.push('booking_source_state_missing');
  if (planning.booking && s(planning.booking.organization_id) !== organizationId) {
    warnings.push('planning_row_organization_mismatch');
  }

  if (source.kind === 'error') {
    diff.source.code = source.code;
    warnings.push(`source_error:${source.code}`);
    return diff;
  }
  if (source.kind === 'absent') {
    diff.source.reason = source.reason;
    warnings.push(`source_absent:${source.reason}`);
    if (source.reason === 'cancelled' || source.reason === 'deleted') {
      // Endast diagnostik. Ingen radering, ingen statusändring.
      warnings.push('cancellation_candidate_diagnostic_only');
    }
    return diff;
  }

  const b = source.booking as Record<string, unknown>;

  // ── Revision ────────────────────────────────────────────────────────────
  const localState = planning.sourceState;
  const incoming = {
    sourceUpdatedAt: source.sourceUpdatedAt ?? s(b.updated_at) ?? s(b.source_updated_at),
    sourceVersion: (b.source_version ?? b.version ?? null) as number | string | null,
    sourceStatus: source.sourceStatus ?? s(b.status),
  };
  diff.revision.incoming = {
    source_updated_at: incoming.sourceUpdatedAt ?? null,
    source_version: incoming.sourceVersion ?? null,
    source_status: incoming.sourceStatus ?? null,
  };
  const local = localState
    ? {
        sourceUpdatedAt: s(localState.last_applied_source_updated_at),
        sourceVersion: (localState.last_applied_source_version ?? null) as number | string | null,
        sourceStatus: s(localState.last_applied_source_status),
      }
    : null;
  if (local) {
    diff.revision.local = {
      source_updated_at: local.sourceUpdatedAt,
      source_version: local.sourceVersion,
      source_status: local.sourceStatus,
    };
  }
  const decision = compareIncomingRevision(incoming, local as any);
  diff.revision.decision = decision;
  if (decision === 'stale_source_revision') warnings.push('planning_state_newer_than_booking');
  if (decision === 'incomparable_source_revision') warnings.push('malformed_or_divergent_revision');
  if (decision === 'invalid_incoming_revision') warnings.push('malformed_incoming_revision');

  // ── Booking-owned fält ──────────────────────────────────────────────────
  let unchanged = 0;
  for (const field of BOOKING_OWNED_BOOKING_FIELDS) {
    if (!(field in b)) continue;
    const planningValue = planning.booking ? planning.booking[field] : null;
    if (eq(planningValue, b[field])) unchanged += 1;
    else diff.booking_fields.changed.push({ field, planning: planningValue ?? null, booking: b[field] ?? null });
  }
  diff.booking_fields.unchanged_count = unchanged;

  // ── Produkter ───────────────────────────────────────────────────────────
  const completeness = readProductSourceCompleteness(b);
  diff.products.source_completeness = completeness;
  const externalProducts = Array.isArray(b.products) ? (b.products as any[]) : [];
  if (completeness !== 'complete') warnings.push(`partial_product_source:${completeness}`);
  const pd = diffProducts(planning.products as any[], externalProducts, completeness);
  diff.products.add = pd.added;
  diff.products.update = pd.updated;
  // remove_candidate = union av (skulle-raderats) och (blockerade) — ren diagnostik.
  diff.products.remove_candidate = Array.from(new Set([...pd.removed, ...pd.blockedRemovals]));
  diff.products.delete_would_be_allowed = false;

  // ── Kalender ────────────────────────────────────────────────────────────
  const dateCompleteness = readDateSourceCompleteness(b);
  diff.calendar.source_completeness = dateCompleteness;
  if (dateCompleteness !== 'complete') warnings.push(`partial_date_source:${dateCompleteness}`);
  const presence = buildDatePresence(b);
  const phases = Object.keys(BOOKING_OWNED_DATE_FIELDS) as CalendarPhase[];
  const canonicalEvents = planning.calendarEvents.filter((e) =>
    isBookingGeneratedEvent(e as any, bookingId),
  );

  for (const phase of phases) {
    const field = BOOKING_OWNED_DATE_FIELDS[phase];
    const bookingDate = s(b[field]);
    const matching = canonicalEvents.filter((e) => s(e.event_type) === phase);
    if (bookingDate && presence[phase] === 'present') {
      if (matching.length === 0) {
        diff.calendar.missing_in_planning.push({ event_type: phase, date: bookingDate });
      } else {
        for (const e of matching) {
          const planningDate = eventCanonicalDate(e as any);
          if (planningDate && planningDate !== bookingDate) {
            diff.calendar.date_mismatch.push({
              event_type: phase,
              planning_date: planningDate,
              booking_date: bookingDate,
              event_id: String(e.id ?? ''),
            });
          }
        }
      }
    } else if (matching.length > 0) {
      // Booking saknar datumet men Planning har event → endast kandidat.
      for (const e of matching) {
        diff.calendar.remove_candidate.push({
          event_id: String(e.id ?? ''),
          event_type: phase,
          date: eventCanonicalDate(e as any),
        });
      }
      if (presence[phase] !== 'present') warnings.push(`calendar_remove_candidate_unproven:${phase}`);
    }
  }

  diff.calendar.planning_only_events = planning.calendarEvents
    .filter((e) => (PLANNING_ONLY_EVENT_TYPES as readonly string[]).includes(String(e.event_type)))
    .map((e) => ({
      event_id: String(e.id ?? ''),
      event_type: String(e.event_type ?? ''),
      date: eventCanonicalDate(e as any),
    }));

  // ── Projections ─────────────────────────────────────────────────────────
  diff.projections.projects.booking_owned_drift = driftFor(
    planning.projects,
    b,
    BOOKING_OWNED_PROJECT_FIELDS,
    { customer_name: 'customer_name', name: 'client' },
  );
  diff.projections.jobs.booking_owned_drift = driftFor(planning.jobs, b, BOOKING_OWNED_JOB_FIELDS, {
    name: 'client',
  });
  diff.projections.packing_projects.booking_owned_drift = driftFor(
    planning.packingProjects,
    b,
    BOOKING_OWNED_PACKING_FIELDS,
  );

  return diff;
}
