// STEG 3G — Produktionssäker observability för Booking → Planning-sync.
//
// Rent diagnostiklager: strukturerad audit, safety counters, circuit breaker,
// dry-run och anomaly detection. Ändrar ALDRIG affärslogik och aktiverar
// aldrig destruktiv automation (cancellation-flaggan lever oförändrad i
// _shared/destructiveSyncFlag.ts).

export const SYNC_AUDIT_LOG = 'booking_sync_audit';
export const SAFETY_CIRCUIT_BREAKER = 'safety_circuit_breaker';
export const SYNC_ANOMALY_LOG = 'booking_sync_anomaly';

/**
 * Hårda server-side gränser per ENSKILD booking-sync.
 * Konservativa. Kan ALDRIG höjas via request (inga request-fält läses här).
 * Överskridande => circuit breaker stoppar FÖRE mutationen.
 */
export const SAFETY_LIMITS = Object.freeze({
  /** Max antal destruktiva produktoperationer (delete-satser) per booking-sync. */
  product_deletes: 25,
  /** Max antal kalender-deletes per booking-sync. */
  calendar_deletes: 10,
  /** Max antal projection-deletes (projects/jobs/packing_projects) per booking-sync. */
  projection_deletes: 3,
  /** Max antal destruktiva operationer totalt per booking-sync. */
  total_deletes: 30,
  /** Max antal statusbyten per booking-sync. */
  status_changes: 2,
});

export type DestructiveKind = 'product_deletes' | 'calendar_deletes' | 'projection_deletes' | 'status_changes';

export interface SyncCounters {
  deletes: number;
  product_deletes: number;
  calendar_deletes: number;
  projection_deletes: number;
  status_changes: number;
  product_adds: number;
  product_updates: number;
  calendar_adds: number;
  calendar_updates: number;
  projection_mutations: number;
  failures: number;
  retries: number;
  lease_losses: number;
  partial_failures: number;
  blocked_by_circuit_breaker: number;
}

export function createSyncCounters(): SyncCounters {
  return {
    deletes: 0,
    product_deletes: 0,
    calendar_deletes: 0,
    projection_deletes: 0,
    status_changes: 0,
    product_adds: 0,
    product_updates: 0,
    calendar_adds: 0,
    calendar_updates: 0,
    projection_mutations: 0,
    failures: 0,
    retries: 0,
    lease_losses: 0,
    partial_failures: 0,
    blocked_by_circuit_breaker: 0,
  };
}

export function countMutation(counters: SyncCounters, key: keyof SyncCounters, amount = 1): void {
  counters[key] = (counters[key] ?? 0) + amount;
}

export interface CircuitBreakerResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  attempted?: number;
}

/**
 * Kontrolleras FÖRE varje destruktiv mutation. Fail-closed:
 * negativa/ogiltiga tal blockeras, gränser läses enbart från SAFETY_LIMITS.
 */
export function checkDestructiveLimit(
  counters: SyncCounters,
  kind: DestructiveKind,
  planned = 1,
): CircuitBreakerResult {
  const count = Number.isFinite(planned) ? Math.trunc(planned) : NaN;
  if (!Number.isFinite(count) || count < 0) {
    return { allowed: false, reason: `${SAFETY_CIRCUIT_BREAKER}:invalid_planned_count` };
  }
  const limit = SAFETY_LIMITS[kind];
  const next = (counters[kind] ?? 0) + count;
  if (next > limit) {
    return { allowed: false, reason: `${SAFETY_CIRCUIT_BREAKER}:${kind}`, limit, attempted: next };
  }
  if (kind !== 'status_changes') {
    const nextTotal = counters.deletes + count;
    if (nextTotal > SAFETY_LIMITS.total_deletes) {
      return {
        allowed: false,
        reason: `${SAFETY_CIRCUIT_BREAKER}:total_deletes`,
        limit: SAFETY_LIMITS.total_deletes,
        attempted: nextTotal,
      };
    }
  }
  return { allowed: true, limit };
}

/** Registrera en genomförd destruktiv operation (efter godkänd gräns). */
export function recordDestructive(counters: SyncCounters, kind: DestructiveKind, amount = 1): void {
  counters[kind] = (counters[kind] ?? 0) + amount;
  if (kind !== 'status_changes') counters.deletes += amount;
}

/** Kastas när circuit breakern stoppar en sync. Ger outcome failed/partial. */
export class SafetyCircuitBreakerError extends Error {
  readonly code = SAFETY_CIRCUIT_BREAKER;
  constructor(public readonly detail: CircuitBreakerResult) {
    super(detail.reason ?? SAFETY_CIRCUIT_BREAKER);
    this.name = 'SafetyCircuitBreakerError';
  }
}

export function enforceDestructiveLimit(
  counters: SyncCounters,
  kind: DestructiveKind,
  planned = 1,
  log?: { booking_id?: string | null; organization_id?: string | null },
): void {
  const res = checkDestructiveLimit(counters, kind, planned);
  if (!res.allowed) {
    counters.blocked_by_circuit_breaker += 1;
    console.error(
      `[sync-safety] ${SAFETY_CIRCUIT_BREAKER}`,
      JSON.stringify({
        blocked: true,
        kind,
        reason: res.reason,
        limit: res.limit ?? null,
        attempted: res.attempted ?? null,
        booking_id: log?.booking_id ?? null,
        organization_id: log?.organization_id ?? null,
      }),
    );
    throw new SafetyCircuitBreakerError(res);
  }
  recordDestructive(counters, kind, planned);
}

// ── Dry-run ────────────────────────────────────────────────────────────────

export interface DryRunResolution {
  dryRun: boolean;
  reason?: string;
}

/**
 * Dry-run kräver explicit `dry_run: true` OCH exakt ett booking_id.
 * Dry-run får aldrig flytta cursor eller markera jobb completed.
 */
export function resolveDryRun(body: Record<string, unknown> | null | undefined): DryRunResolution {
  const raw = body?.['dry_run'];
  if (raw !== true) return { dryRun: false };
  const bookingId = body?.['booking_id'];
  if (typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    return { dryRun: false, reason: 'dry_run_requires_single_booking_id' };
  }
  return { dryRun: true };
}

const MUTATION_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

/**
 * Wrappar en Supabase-klient så att INGA skrivningar når databasen.
 * Läsningar (select/rpc-läsning) går igenom oförändrat. Planerade mutationer
 * räknas i `planned` per tabell+operation.
 */
export function createDryRunClient(
  client: any,
  planned: Record<string, number>,
): any {
  const stub = (table: string, op: string): any => {
    const key = `${table}.${op}`;
    planned[key] = (planned[key] ?? 0) + 1;
    const thenable: any = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      catch: () => thenable,
      finally: (fn: () => void) => { fn(); return thenable; },
    };
    return new Proxy(thenable, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return () => new Proxy(target, { get: (t, p) => (p in t ? (t as any)[p] : () => target) });
      },
    });
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === '__dryRun') return true;
      if (prop === 'from') {
        return (table: string) => {
          const builder = target.from(table);
          return new Proxy(builder, {
            get(b, p) {
              if (typeof p === 'string' && MUTATION_METHODS.has(p)) {
                return () => stub(table, p);
              }
              const v = (b as any)[p];
              return typeof v === 'function' ? v.bind(b) : v;
            },
          });
        };
      }
      if (prop === 'rpc') {
        return (fn: string, args?: unknown) => {
          planned[`rpc.${fn}`] = (planned[`rpc.${fn}`] ?? 0) + 1;
          return Promise.resolve({ data: null, error: null, __dryRun: true, __args: args ? true : false });
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

// ── Audit ──────────────────────────────────────────────────────────────────

const SECRET_KEY_PATTERN = /(token|secret|key|password|authorization|bearer|jwt|apikey)/i;

/** Tar bort alla nycklar som kan innehålla hemligheter. */
export function sanitizeAudit<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SECRET_KEY_PATTERN.test(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeAudit(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface SyncAuditInput {
  organization_id: string | null;
  booking_id: string | null;
  booking_number?: string | null;
  source_revision?: string | number | null;
  previous_applied_revision?: string | number | null;
  outcome: string;
  duration_ms: number;
  worker_id?: string | null;
  batch_id?: string | null;
  products_completeness?: 'complete' | 'incomplete' | 'unknown' | null;
  dry_run?: boolean;
  counters: SyncCounters;
  planned_mutations?: Record<string, number> | null;
  anomalies?: string[];
}

export function buildSyncAudit(input: SyncAuditInput): Record<string, unknown> {
  const c = input.counters;
  return sanitizeAudit({
    log: SYNC_AUDIT_LOG,
    organization_id: input.organization_id ?? null,
    booking_id: input.booking_id ?? null,
    booking_number: input.booking_number ?? null,
    source_revision: input.source_revision ?? null,
    previous_applied_revision: input.previous_applied_revision ?? null,
    outcome: input.outcome,
    duration_ms: Math.max(0, Math.trunc(input.duration_ms || 0)),
    worker_id: input.worker_id ?? null,
    batch_id: input.batch_id ?? null,
    products_completeness: input.products_completeness ?? 'unknown',
    dry_run: input.dry_run === true,
    product_adds: c.product_adds,
    product_updates: c.product_updates,
    product_deletes: c.product_deletes,
    calendar_adds: c.calendar_adds,
    calendar_updates: c.calendar_updates,
    calendar_deletes: c.calendar_deletes,
    projection_mutations: c.projection_mutations,
    projection_deletes: c.projection_deletes,
    status_changes: c.status_changes,
    deletes: c.deletes,
    failures: c.failures,
    retries: c.retries,
    lease_loss: c.lease_losses > 0,
    partial_failures: c.partial_failures,
    blocked_by_circuit_breaker: c.blocked_by_circuit_breaker,
    planned_mutations: input.planned_mutations ?? null,
    anomalies: input.anomalies ?? [],
  });
}

export function logSyncAudit(input: SyncAuditInput): Record<string, unknown> {
  const audit = buildSyncAudit(input);
  console.log(`[${SYNC_AUDIT_LOG}]`, JSON.stringify(audit));
  return audit;
}

// ── Anomaly detection ──────────────────────────────────────────────────────

export interface AnomalyInput {
  previousProductCount?: number | null;
  sourceProductCount?: number | null;
  counters: SyncCounters;
  previousStatus?: string | null;
  nextStatus?: string | null;
  sourceRevision?: number | null;
  previousAppliedRevision?: number | null;
  recentPartialFailures?: number | null;
  leaseTakeover?: boolean;
  retryCount?: number | null;
}

/** Endast detektering + loggning — inga automatiska "fixar". */
export function detectSyncAnomalies(input: AnomalyInput): string[] {
  const out: string[] = [];
  const prev = input.previousProductCount ?? null;
  const next = input.sourceProductCount ?? null;
  if (prev != null && next != null && prev >= 5 && next <= prev * 0.5) {
    out.push('source_product_count_drop');
  }
  if (input.counters.calendar_deletes >= 3) out.push('many_calendar_deletes');
  const p = (input.previousStatus ?? '').toLowerCase();
  const n = (input.nextStatus ?? '').toLowerCase();
  if (p && n && p !== n && (p === 'cancelled' || n === 'cancelled')) {
    out.push('unexpected_status_jump');
  }
  if (
    typeof input.sourceRevision === 'number' &&
    typeof input.previousAppliedRevision === 'number' &&
    input.sourceRevision < input.previousAppliedRevision
  ) {
    out.push('source_revision_went_backwards');
  }
  if ((input.recentPartialFailures ?? 0) >= 3) out.push('repeated_partial_failures');
  if (input.leaseTakeover === true || input.counters.lease_losses > 0) out.push('lease_takeover');
  if ((input.retryCount ?? 0) >= 3) out.push('repeated_retries_same_booking');
  return out;
}

export function logAnomalies(
  anomalies: string[],
  ctx: { booking_id?: string | null; organization_id?: string | null },
): void {
  if (anomalies.length === 0) return;
  console.warn(
    `[${SYNC_ANOMALY_LOG}]`,
    JSON.stringify({
      log: SYNC_ANOMALY_LOG,
      anomalies,
      booking_id: ctx.booking_id ?? null,
      organization_id: ctx.organization_id ?? null,
    }),
  );
}
