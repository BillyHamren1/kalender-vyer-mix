/**
 * STEG 4A — In-memory Supabase-fake för regressionstest av Booking → Planning-syncen.
 *
 * Målet är att kunna köra syncens riktiga skyddsmoduler (revision guard,
 * products_complete-gate, calendar/projection authority, circuit breaker,
 * dry-run) mot en deterministisk datamodell UTAN produktionscredentials.
 *
 * Faken är avsiktligt strikt:
 *  - varje mutation registreras (inserts/updates/deletes per tabell)
 *  - mutationer mot tenant-tabeller UTAN organization_id-filter loggas som
 *    `unscopedMutations` så tester kan asserta tenant-isolation
 *  - fel kan injiceras per (tabell, operation) för partial-safe-tester
 *  - RPC:erna `advance_booking_source_revision` och `finalize_sync_batch`
 *    simuleras med samma beslutsvokabulär som databasen använder
 */

export const TENANT_TABLES = [
  'bookings',
  'booking_products',
  'projects',
  'jobs',
  'large_projects',
  'packing_projects',
  'packing_list_items',
  'calendar_events',
  'warehouse_calendar_events',
  'booking_sync_jobs',
  'sync_batches',
  'sync_state',
  'booking_source_state',
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];
export type Op = 'select' | 'insert' | 'update' | 'delete';

export interface FailureSpec {
  table: string;
  op: Op;
  message: string;
  /** Antal gånger felet ska slå till (default: alltid). */
  times?: number;
}

export interface MutationCounters {
  inserts: number;
  updates: number;
  deletes: number;
}

interface Filter {
  column: string;
  op: 'eq' | 'in' | 'is' | 'neq';
  value: unknown;
}

export interface RevisionState {
  organization_id: string;
  booking_id: string;
  applied_updated_at: string | null;
  applied_version: number | null;
  applied_status: string | null;
  pending_updated_at: string | null;
  pending_version: number | null;
  pending_status: string | null;
  reservation_token: string | null;
  owner_job_id: string | null;
  lock_expires_at: string | null;
}

export interface FakeDb {
  tables: Record<string, Record<string, unknown>[]>;
  revisions: RevisionState[];
  mutations: Record<string, MutationCounters>;
  unscopedMutations: { table: string; op: Op }[];
  rpcCalls: { name: string; args: Record<string, unknown> }[];
}

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    switch (f.op) {
      case 'eq':
        return v === f.value;
      case 'neq':
        return v !== f.value;
      case 'is':
        return f.value === null ? v === null || v === undefined : v === f.value;
      case 'in':
        return Array.isArray(f.value) && (f.value as unknown[]).includes(v);
    }
  });
}

function counterFor(db: FakeDb, table: string): MutationCounters {
  if (!db.mutations[table]) db.mutations[table] = { inserts: 0, updates: 0, deletes: 0 };
  return db.mutations[table];
}

export interface FakeSupabase {
  db: FakeDb;
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  /** Lägg till ett injicerat fel i efterhand. */
  failOn: (spec: FailureSpec) => void;
  totalMutations: () => number;
}

export function createFakeSupabase(opts?: {
  seed?: Record<string, Record<string, unknown>[]>;
  revisions?: RevisionState[];
  failures?: FailureSpec[];
  now?: () => Date;
}): FakeSupabase {
  const db: FakeDb = {
    tables: {},
    revisions: [...(opts?.revisions ?? [])],
    mutations: {},
    unscopedMutations: [],
    rpcCalls: [],
  };
  for (const [t, rows] of Object.entries(opts?.seed ?? {})) db.tables[t] = rows.map((r) => ({ ...r }));
  const failures: FailureSpec[] = (opts?.failures ?? []).map((f) => ({ ...f }));
  const now = opts?.now ?? (() => new Date());
  let idSeq = 0;

  const takeFailure = (table: string, op: Op): string | null => {
    const hit = failures.find((f) => f.table === table && f.op === op && (f.times === undefined || f.times > 0));
    if (!hit) return null;
    if (hit.times !== undefined) hit.times -= 1;
    return hit.message;
  };

  const rows = (table: string) => (db.tables[table] ??= []);

  function builder(table: string) {
    const filters: Filter[] = [];
    let op: Op = 'select';
    let payload: Record<string, unknown>[] = [];
    let patch: Record<string, unknown> = {};
    let selectAfterWrite = false;
    let singleMode: 'none' | 'single' | 'maybe' = 'none';
    let limitN: number | null = null;

    const isTenantTable = (TENANT_TABLES as readonly string[]).includes(table);

    const run = async (): Promise<{ data: any; error: { message: string } | null }> => {
      const failure = takeFailure(table, op);
      if (failure) return { data: null, error: { message: failure } };

      if (op !== 'select' && op !== 'insert' && isTenantTable) {
        const scoped = filters.some((f) => f.column === 'organization_id');
        if (!scoped) db.unscopedMutations.push({ table, op });
      }

      if (op === 'insert') {
        if (isTenantTable) {
          const missingOrg = payload.some((r) => !r.organization_id);
          if (missingOrg) db.unscopedMutations.push({ table, op });
        }
        const inserted = payload.map((r) => ({ id: r.id ?? `${table}-${++idSeq}`, ...r }));
        rows(table).push(...inserted.map((r) => ({ ...r })));
        counterFor(db, table).inserts += inserted.length;
        return finish(inserted);
      }

      const selected = rows(table).filter((r) => matches(r, filters));

      if (op === 'update') {
        for (const r of selected) Object.assign(r, patch, { updated_at: now().toISOString() });
        counterFor(db, table).updates += selected.length;
        return finish(selected.map((r) => ({ ...r })));
      }

      if (op === 'delete') {
        db.tables[table] = rows(table).filter((r) => !matches(r, filters));
        counterFor(db, table).deletes += selected.length;
        return finish(selected.map((r) => ({ ...r })));
      }

      let out = selected.map((r) => ({ ...r }));
      if (limitN !== null) out = out.slice(0, limitN);
      return finish(out);
    };

    const finish = (data: Record<string, unknown>[]) => {
      if (singleMode === 'single') {
        if (data.length !== 1) return { data: null, error: { message: 'no_rows_or_multiple' } };
        return { data: data[0], error: null };
      }
      if (singleMode === 'maybe') return { data: data[0] ?? null, error: null };
      if (op !== 'select' && !selectAfterWrite) return { data: null, error: null };
      return { data, error: null };
    };

    const api: any = {
      select: (_cols?: string, _opts?: unknown) => {
        if (op !== 'select') selectAfterWrite = true;
        return api;
      },
      insert: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        op = 'insert';
        payload = Array.isArray(v) ? v : [v];
        return api;
      },
      upsert: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        op = 'insert';
        payload = Array.isArray(v) ? v : [v];
        return api;
      },
      update: (v: Record<string, unknown>) => {
        op = 'update';
        patch = v;
        return api;
      },
      delete: () => {
        op = 'delete';
        return api;
      },
      eq: (c: string, v: unknown) => (filters.push({ column: c, op: 'eq', value: v }), api),
      neq: (c: string, v: unknown) => (filters.push({ column: c, op: 'neq', value: v }), api),
      is: (c: string, v: unknown) => (filters.push({ column: c, op: 'is', value: v }), api),
      in: (c: string, v: unknown[]) => (filters.push({ column: c, op: 'in', value: v }), api),
      order: () => api,
      limit: (n: number) => ((limitN = n), api),
      single: () => ((singleMode = 'single'), api),
      maybeSingle: () => ((singleMode = 'maybe'), api),
      then: (resolve: any, reject: any) => run().then(resolve, reject),
    };
    return api;
  }

  // ── RPC-simulering ────────────────────────────────────────────────────
  const findRevision = (orgId: string, bookingId: string): RevisionState => {
    let r = db.revisions.find((x) => x.organization_id === orgId && x.booking_id === bookingId);
    if (!r) {
      r = {
        organization_id: orgId,
        booking_id: bookingId,
        applied_updated_at: null,
        applied_version: null,
        applied_status: null,
        pending_updated_at: null,
        pending_version: null,
        pending_status: null,
        reservation_token: null,
        owner_job_id: null,
        lock_expires_at: null,
      };
      db.revisions.push(r);
    }
    return r;
  };

  const compare = (
    incTs: string | null,
    incVer: number | null,
    incStatus: string | null,
    r: RevisionState,
  ): string => {
    const hasApplied = r.applied_updated_at !== null || r.applied_version !== null;
    if (!hasApplied) return 'apply';
    if (incVer !== null && r.applied_version !== null) {
      if (incVer < r.applied_version) return 'stale_source_revision';
      if (incVer > r.applied_version) return 'apply';
    } else if (incTs && r.applied_updated_at) {
      const a = Date.parse(incTs);
      const b = Date.parse(r.applied_updated_at);
      if (a < b) return 'stale_source_revision';
      if (a > b) return 'apply';
    } else {
      return 'incomparable_source_revision';
    }
    return (r.applied_status ?? null) === incStatus
      ? 'already_current'
      : 'conflicting_source_status_for_revision';
  };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    db.rpcCalls.push({ name, args: { ...args } });

    if (name === 'advance_booking_source_revision') {
      const orgId = String(args.p_organization_id ?? '');
      const bookingId = String(args.p_booking_id ?? '');
      const mode = String(args.p_mode ?? '');
      const incTs = (args.p_source_updated_at as string | null) ?? null;
      const incVer = (args.p_source_version as number | null) ?? null;
      const incStatus = (args.p_source_status as string | null) ?? null;
      const token = (args.p_reservation_token as string | null) ?? null;
      if (!orgId || !bookingId || !incStatus) return { data: { decision: 'invalid_input' }, error: null };
      const r = findRevision(orgId, bookingId);
      const nowMs = now().getTime();
      const leaseLive = r.lock_expires_at !== null && Date.parse(r.lock_expires_at) > nowMs;

      if (mode === 'reserve') {
        const cmp = compare(incTs, incVer, incStatus, r);
        if (cmp !== 'apply') return { data: { decision: cmp }, error: null };
        if (leaseLive) return { data: { decision: 'booking_import_locked' }, error: null };
        const newToken = `tok-${++idSeq}`;
        r.pending_updated_at = incTs;
        r.pending_version = incVer;
        r.pending_status = incStatus;
        r.reservation_token = newToken;
        r.owner_job_id = (args.p_owner_job_id as string | null) ?? null;
        r.lock_expires_at = new Date(nowMs + Number(args.p_lease_seconds ?? 300) * 1000).toISOString();
        return {
          data: { decision: 'reserved', reservation_token: newToken, lock_expires_at: r.lock_expires_at },
          error: null,
        };
      }

      if (mode === 'renew' || mode === 'commit' || mode === 'release') {
        if (!r.reservation_token) return { data: { decision: 'commit_without_reservation' }, error: null };
        if (!token || token !== r.reservation_token) return { data: { decision: 'reservation_mismatch' }, error: null };
        if (!leaseLive) return { data: { decision: 'reservation_lost' }, error: null };
        if (mode === 'renew') {
          r.lock_expires_at = new Date(nowMs + Number(args.p_lease_seconds ?? 300) * 1000).toISOString();
          return { data: { decision: 'renewed', reservation_token: token, lock_expires_at: r.lock_expires_at }, error: null };
        }
        if (mode === 'release') {
          r.pending_updated_at = null;
          r.pending_version = null;
          r.pending_status = null;
          r.reservation_token = null;
          r.lock_expires_at = null;
          return { data: { decision: 'released' }, error: null };
        }
        r.applied_updated_at = r.pending_updated_at;
        r.applied_version = r.pending_version;
        r.applied_status = r.pending_status;
        r.pending_updated_at = null;
        r.pending_version = null;
        r.pending_status = null;
        r.reservation_token = null;
        r.lock_expires_at = null;
        return { data: { decision: 'applied' }, error: null };
      }

      return { data: { decision: 'invalid_input' }, error: null };
    }

    if (name === 'finalize_sync_batch') {
      const batchId = String(args._batch_id ?? '');
      const batch = rows('sync_batches').find((b) => b.id === batchId) as any;
      if (!batch) return { data: null, error: null };
      const jobs = rows('booking_sync_jobs').filter((j: any) => j.batch_id === batchId) as any[];
      const remaining = jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length;
      const succeeded = jobs.filter((j) => j.status === 'completed').length;
      const failed = jobs.filter((j) => j.status === 'failed').length;
      if (remaining > 0) {
        return { data: [{ finalized: false, status: 'pending', succeeded, failed, remaining, cursor_advanced_to: null, monotonic_skip: false }], error: null };
      }
      const status = failed > 0 ? (succeeded > 0 ? 'partial' : 'failed') : 'success';
      batch.status = status;
      let cursorAdvancedTo: string | null = null;
      if (status === 'success') {
        const cursorRow = rows('sync_state').find(
          (c: any) => c.organization_id === batch.organization_id && c.sync_type === batch.sync_type,
        ) as any;
        const planned = String(batch.planned_cursor);
        const current = cursorRow?.last_sync_timestamp ?? null;
        if (!current || Date.parse(planned) > Date.parse(current)) {
          if (cursorRow) cursorRow.last_sync_timestamp = planned;
          else rows('sync_state').push({ organization_id: batch.organization_id, sync_type: batch.sync_type, last_sync_timestamp: planned });
          cursorAdvancedTo = planned;
        }
      }
      return {
        data: [{ finalized: true, status, succeeded, failed, remaining: 0, cursor_advanced_to: cursorAdvancedTo, monotonic_skip: false }],
        error: null,
      };
    }

    return { data: null, error: { message: `unknown_rpc:${name}` } };
  };

  return {
    db,
    from: (table: string) => builder(table),
    rpc,
    failOn: (spec) => failures.push({ ...spec }),
    totalMutations: () =>
      Object.values(db.mutations).reduce((sum, m) => sum + m.inserts + m.updates + m.deletes, 0),
  };
}
