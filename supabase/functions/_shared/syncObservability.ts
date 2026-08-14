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
  /** STEG 3I: Max antal RADER som får raderas i produkttabeller per booking-sync. */
  product_deletes: 25,
  /** STEG 3I: Max antal kalender-RADER som får raderas per booking-sync. */
  calendar_deletes: 10,
  /** STEG 3I: Max antal projection-RADER (projects/jobs/packing_projects) som får raderas per booking-sync. */
  projection_deletes: 3,
  /** STEG 3I: Max antal raderade RADER totalt per booking-sync. */
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

/**
 * STEG 3I — Kastas när en destruktiv operation inte kan fastställa exakt
 * antal rader den skulle påverka. Fail-closed: ingen delete får ske.
 */
export const UNKNOWN_DESTRUCTIVE_ROW_COUNT = 'unknown_destructive_row_count';

export class UnknownDestructiveRowCountError extends Error {
  readonly code = UNKNOWN_DESTRUCTIVE_ROW_COUNT;
  constructor(public readonly table: string) {
    super(`${UNKNOWN_DESTRUCTIVE_ROW_COUNT}:${table}`);
    this.name = 'UnknownDestructiveRowCountError';
  }
}

/**
 * Pending row-deklaration per counters-instans. Sätts av
 * enforceDestructiveLimit och konsumeras av nästa .delete() på klienten.
 * Utan deklaration => fail-closed.
 */
interface PendingDeclaration { kind: DestructiveKind; rows: number }
const PENDING_DELETE = new WeakMap<SyncCounters, PendingDeclaration>();

export function declarePlannedDeleteRows(counters: SyncCounters, kind: DestructiveKind, rows: number): void {
  PENDING_DELETE.set(counters, { kind, rows });
}

export function consumePlannedDeleteRows(counters: SyncCounters): PendingDeclaration | null {
  const pending = PENDING_DELETE.get(counters) ?? null;
  PENDING_DELETE.delete(counters);
  return pending;
}

/**
 * Kontroll FÖRE mutation. `planned` MÅSTE vara antalet RADER som operationen
 * avser påverka (inte antal SQL-satser). Registrerar även en pending
 * row-deklaration som klient-proxyn konsumerar.
 */
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
        planned_rows: planned,
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
  if (kind !== 'status_changes') declarePlannedDeleteRows(counters, kind, planned);
}

// ── STEG 3I: tenant-scopad row resolution + guardad delete ──────────────────

export interface DeleteFilters { [column: string]: string | number | null }

/**
 * Fastställer EXAKTA rad-ID:n för en destruktiv operation via en
 * tenant-scopad select('id'). Fail-closed vid DB-fel.
 */
export async function resolveDeleteRowIds(
  client: any,
  table: string,
  filters: DeleteFilters,
): Promise<string[]> {
  let q = client.from(table).select('id');
  for (const [col, val] of Object.entries(filters)) {
    if (val === null || val === undefined) continue;
    q = q.eq(col, val);
  }
  const { data, error } = await q;
  if (error) throw new UnknownDestructiveRowCountError(table);
  if (!Array.isArray(data)) throw new UnknownDestructiveRowCountError(table);
  return data.map((r: any) => r.id).filter(Boolean);
}

export interface GuardedDeleteResult { deleted: number; error: string | null }

/**
 * Enda tillåtna destruktiva vägen i normal sync:
 * explicit ID-lista + tenant-filter + circuit breaker FÖRE mutation.
 */
export async function guardedDeleteByIds(
  client: any,
  opts: {
    table: string;
    ids: string[];
    kind: DestructiveKind;
    counters: SyncCounters;
    filters?: DeleteFilters;
    ctx?: { booking_id?: string | null; organization_id?: string | null };
  },
): Promise<GuardedDeleteResult> {
  const ids = Array.from(new Set((opts.ids || []).filter(Boolean)));
  if (ids.length === 0) return { deleted: 0, error: null };
  // Circuit breaker FÖRE mutation — baserad på verkliga rader.
  enforceDestructiveLimit(opts.counters, opts.kind, ids.length, opts.ctx);
  let q = client.from(opts.table).delete();
  for (const [col, val] of Object.entries(opts.filters ?? {})) {
    if (val === null || val === undefined) continue;
    q = q.eq(col, val);
  }
  const { error } = await q.in('id', ids);
  if (error) return { deleted: 0, error: error.message || String(error) };
  return { deleted: ids.length, error: null };
}

/**
 * Blind `.delete().eq(...)` är förbjudet. Denna helper löser först ut exakta
 * rader tenant-scopat och kör därefter guardedDeleteByIds.
 */
export async function guardedDeleteWhere(
  client: any,
  opts: {
    table: string;
    filters: DeleteFilters;
    kind: DestructiveKind;
    counters: SyncCounters;
    ctx?: { booking_id?: string | null; organization_id?: string | null };
  },
): Promise<GuardedDeleteResult> {
  const ids = await resolveDeleteRowIds(client, opts.table, opts.filters);
  return guardedDeleteByIds(client, {
    table: opts.table,
    ids,
    kind: opts.kind,
    counters: opts.counters,
    filters: opts.filters,
    ctx: opts.ctx,
  });
}


// ── Dry-run ────────────────────────────────────────────────────────────────

export interface DryRunResolution {
  /** true endast när dry-run kan köras säkert. */
  dryRun: boolean;
  /** true så snart klienten explicit bad om dry_run:true. */
  requested: boolean;
  /** true när dry_run begärdes men kontraktet är ogiltigt → FAIL-CLOSED. */
  invalid: boolean;
  reason?: string;
}

/**
 * STEG 3J: Dry-run kräver explicit `dry_run: true` OCH exakt ett booking_id
 * (+ giltig organization_id om den skickas med).
 *
 * FAIL-CLOSED: om dry_run begärs men kontraktet är ogiltigt returneras
 * `{ dryRun: false, requested: true, invalid: true }` — anroparen MÅSTE då
 * avbryta requesten. Ogiltig dry-run får ALDRIG falla tillbaka till live-import.
 */
export function resolveDryRun(body: Record<string, unknown> | null | undefined): DryRunResolution {
  const raw = body?.['dry_run'];
  if (raw !== true) return { dryRun: false, requested: false, invalid: false };

  const invalid = (reason: string): DryRunResolution => ({
    dryRun: false,
    requested: true,
    invalid: true,
    reason,
  });

  // Multi-booking-varianter är aldrig tillåtna i dry-run.
  const multiKeys = ['booking_ids', 'only_booking_ids', 'bookingIds'];
  for (const key of multiKeys) {
    if (body?.[key] !== undefined && body?.[key] !== null) {
      return invalid('dry_run_requires_single_booking_id');
    }
  }

  const bookingId = body?.['booking_id'];
  if (Array.isArray(bookingId)) return invalid('dry_run_requires_single_booking_id');
  if (typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    return invalid('dry_run_requires_single_booking_id');
  }

  const orgId = body?.['organization_id'];
  if (orgId !== undefined && orgId !== null) {
    if (typeof orgId !== 'string' || orgId.trim().length === 0) {
      return invalid('dry_run_requires_valid_organization_id');
    }
  }

  return { dryRun: true, requested: true, invalid: false };
}


const MUTATION_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

// ── STEG 3I: RPC-klassificering för dry-run ────────────────────────────────

/** Read-only RPC:er som FÅR köras i dry-run (behövs för korrekt diff). */
export const READ_ONLY_RPCS = Object.freeze([
  'lp_rep_booking_id',
  'get_user_organization_id',
  'has_role',
  'jsonb_object_keys_array',
  'compute_workday_review_status',
  'get_unseen_booking_updates',
]);

/** Muterande RPC:er som ALDRIG får köras i dry-run. */
export const MUTATING_RPCS = Object.freeze([
  'advance_booking_source_revision',
  'apply_booking_cancellation_atomic',
  'recompute_booking_staff_for_day',
  'recompute_booking_staff_for_day_v2',
  'finalize_sync_batch',
  'claim_sync_jobs',
  'handle_booking_move',
  'auto_create_project_for_orphan_booking',
  'ensure_internal_project',
  'ensure_internal_lager_booking',
  'ensure_internal_lager_setup',
  'ensure_internal_warehouse_project',
  'cleanup_non_rep_lp_calendar_events',
  'mark_booking_changes_seen',
  'sync_all_phase_times',
]);

const READ_ONLY_RPC_SET = new Set<string>(READ_ONLY_RPCS as readonly string[]);
const MUTATING_RPC_SET = new Set<string>(MUTATING_RPCS as readonly string[]);

export type RpcClass = 'read_only' | 'mutating' | 'unknown';

export function classifyRpc(fn: string): RpcClass {
  if (READ_ONLY_RPC_SET.has(fn)) return 'read_only';
  if (MUTATING_RPC_SET.has(fn)) return 'mutating';
  return 'unknown';
}

export const UNKNOWN_RPC_IN_DRY_RUN = 'unknown_rpc_in_dry_run';

export class UnknownRpcInDryRunError extends Error {
  readonly code = UNKNOWN_RPC_IN_DRY_RUN;
  constructor(public readonly fn: string) {
    super(`${UNKNOWN_RPC_IN_DRY_RUN}:${fn}`);
    this.name = 'UnknownRpcInDryRunError';
  }
}

/**
 * Wrappar en Supabase-klient så att INGA skrivningar når databasen.
 * Läsningar (select + read-only RPC) går igenom oförändrat. Planerade
 * mutationer räknas i `planned` — deletes i RADER, inte satser.
 */
export function createDryRunClient(
  client: any,
  planned: Record<string, number>,
  counters?: SyncCounters,
): any {
  const stub = (table: string, op: string, rows: number): any => {
    const key = `${table}.${op}`;
    planned[key] = (planned[key] ?? 0) + rows;
    const result = { data: [], error: null };
    const chain: any = new Proxy(function () { return chain; }, {
      apply: () => chain,
      get(_t, prop) {
        if (prop === 'then') return (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
        if (prop === 'catch') return () => chain;
        if (prop === 'finally') return (fn: any) => { fn?.(); return chain; };
        return () => chain;
      },
    });
    return chain;
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === '__dryRun') return true;
      if (prop === '__syncCounters') return counters ?? (target as any).__syncCounters;
      if (prop === 'from') {
        return (table: string) => {
          const builder = target.from(table);
          return new Proxy(builder, {
            get(b, p) {
              if (typeof p === 'string' && MUTATION_METHODS.has(p)) {
                return (...args: unknown[]) => {
                  if (p === 'delete') {
                    // Rader måste vara deklarerade av enforceDestructiveLimit.
                    const pending = counters ? consumePlannedDeleteRows(counters) : null;
                    if (!pending) throw new UnknownDestructiveRowCountError(table);
                    return stub(table, p, pending.rows);
                  }
                  const rows = Array.isArray(args[0]) ? (args[0] as unknown[]).length : 1;
                  return stub(table, p, rows);
                };
              }
              const v = (b as any)[p];
              return typeof v === 'function' ? v.bind(b) : v;
            },
          });
        };
      }
      if (prop === 'rpc') {
        return (fn: string, args?: unknown) => {
          const cls = classifyRpc(fn);
          if (cls === 'read_only') {
            // Read-only RPC får köras: behövs för korrekt diff.
            return target.rpc(fn, args as any);
          }
          if (cls === 'mutating') {
            planned[`rpc.${fn}`] = (planned[`rpc.${fn}`] ?? 0) + 1;
            return Promise.resolve({ data: null, error: null, __dryRun: true, __blocked: true });
          }
          // Fail-closed: okänd RPC får varken köras eller tyst no-opas.
          throw new UnknownRpcInDryRunError(fn);
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

// ── Safety-guarded client (circuit breaker + counters på riktiga skrivningar) ─

const PRODUCT_TABLES = new Set(['booking_products', 'packing_list_items', 'packing_list_item_allocations', 'completion_products']);
const CALENDAR_TABLES = new Set(['calendar_events', 'warehouse_calendar_events']);
const PROJECTION_TABLES = new Set([
  'projects', 'jobs', 'packing_projects', 'warehouse_projects',
  'large_projects', 'large_project_bookings', 'booking_staff_assignments',
]);

export function classifyTable(table: string): DestructiveKind | null {
  if (PRODUCT_TABLES.has(table)) return 'product_deletes';
  if (CALENDAR_TABLES.has(table)) return 'calendar_deletes';
  if (PROJECTION_TABLES.has(table)) return 'projection_deletes';
  return null;
}

/**
 * STEG 3I: Wrappar en riktig Supabase-klient för audit/counters.
 * Proxyn är INTE circuit breaker för deletes — den kan inte veta hur många
 * rader en chained .delete().eq() påverkar. Varje delete måste därför ha
 * deklarerat sitt planerade radantal via enforceDestructiveLimit
 * (dvs. gå genom guardedDeleteByIds/guardedDeleteWhere). Saknas deklaration:
 * fail-closed med unknown_destructive_row_count.
 */
export function createSafetyGuardedClient(
  client: any,
  counters: SyncCounters,
  ctx: { booking_id?: string | null; organization_id?: string | null } = {},
): any {
  void ctx;
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === '__safetyGuarded') return true;
      if (prop === '__syncCounters') return counters;
      if (prop === 'from') {
        return (table: string) => {
          const builder = target.from(table);
          return new Proxy(builder, {
            get(b, p) {
              const value = (b as any)[p];
              if (typeof p === 'string' && MUTATION_METHODS.has(p) && typeof value === 'function') {
                return (...args: unknown[]) => {
                  if (p === 'delete') {
                    const pending = consumePlannedDeleteRows(counters);
                    if (!pending) {
                      counters.blocked_by_circuit_breaker += 1;
                      console.error(
                        `[sync-safety] ${UNKNOWN_DESTRUCTIVE_ROW_COUNT}`,
                        JSON.stringify({ blocked: true, table }),
                      );
                      throw new UnknownDestructiveRowCountError(table);
                    }
                    // Rader är redan räknade och gränsprövade av
                    // enforceDestructiveLimit FÖRE denna mutation.
                  } else if (p === 'insert' || p === 'upsert') {
                    const rows = Array.isArray(args[0]) ? (args[0] as unknown[]).length : 1;
                    if (PRODUCT_TABLES.has(table)) counters.product_adds += rows;
                    else if (CALENDAR_TABLES.has(table)) counters.calendar_adds += rows;
                    else if (PROJECTION_TABLES.has(table)) counters.projection_mutations += rows;
                  } else if (p === 'update') {
                    if (PRODUCT_TABLES.has(table)) counters.product_updates += 1;
                    else if (CALENDAR_TABLES.has(table)) counters.calendar_updates += 1;
                    else if (PROJECTION_TABLES.has(table)) counters.projection_mutations += 1;
                  }
                  return value.apply(b, args);
                };
              }
              return typeof value === 'function' ? value.bind(b) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

