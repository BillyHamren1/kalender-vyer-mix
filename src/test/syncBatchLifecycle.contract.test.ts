import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contract-tester för batch-livscykeln i booking-importens syncmotor.
 *
 * Verifierar 11 specifika beteenden i `supabase/functions/_shared/syncBatch.ts`
 * (`attachJobsToBatch`, `finalizeBatchIfDone`) — biblioteket importeras via
 * en dynamisk stub eftersom modulen är TypeScript-utan-typer i Deno-runtime
 * men kompatibel med Node/Vitest via en tunn shim.
 */

// ── In-memory fake av Supabase-klienten ─────────────────────────────────
type ActiveStatus = 'pending' | 'processing';
interface JobRow {
  id: string;
  organization_id: string;
  booking_id: string;
  status: ActiveStatus | 'completed' | 'failed';
  event_type: string;
  batch_id: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at?: string | null;
}
interface BatchRow {
  id: string;
  organization_id: string;
  sync_type: string;
  planned_cursor: string;
  status: 'pending' | 'success' | 'partial' | 'failed';
  total_jobs: number;
  metadata: Record<string, unknown>;
}
interface LinkRow { batch_id: string; job_id: string }
interface CursorRow {
  organization_id: string;
  sync_type: string;
  last_sync_timestamp: string | null;
  last_sync_status: string | null;
}

function makeSupabase() {
  const state = {
    jobs: [] as JobRow[],
    batches: [] as BatchRow[],
    links: [] as LinkRow[],
    cursors: [] as CursorRow[],
    finalizeCalls: 0,
    monotonicSkips: 0,
    seq: 0,
  };

  const rpc = async (name: string, args: any) => {
    if (name !== 'finalize_sync_batch') throw new Error('unknown rpc');
    state.finalizeCalls++;
    const batchId = args._batch_id as string;
    const batch = state.batches.find((b) => b.id === batchId);
    if (!batch) return { data: null, error: null };
    const jobIds = state.links.filter((l) => l.batch_id === batchId).map((l) => l.job_id);
    const jobs = state.jobs.filter((j) => jobIds.includes(j.id));
    const remaining = jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length;
    const succeeded = jobs.filter((j) => j.status === 'completed').length;
    const failed = jobs.filter((j) => j.status === 'failed').length;
    if (remaining > 0) {
      return {
        data: [{ remaining, succeeded, failed, finalized: false, status: 'pending', cursor_advanced_to: null, monotonic_skip: false }],
        error: null,
      };
    }
    // Terminal — bestäm status.
    let status: BatchRow['status'] = failed > 0 ? 'partial' : 'success';
    if (jobs.length > 0 && succeeded === 0) status = 'failed';
    batch.status = status;
    let cursorAdvancedTo: string | null = null;
    let monotonicSkip = false;
    if (status === 'success') {
      const cursor = state.cursors.find(
        (c) => c.organization_id === batch.organization_id && c.sync_type === batch.sync_type,
      );
      if (!cursor) {
        state.cursors.push({
          organization_id: batch.organization_id,
          sync_type: batch.sync_type,
          last_sync_timestamp: batch.planned_cursor,
          last_sync_status: 'success',
        });
        cursorAdvancedTo = batch.planned_cursor;
      } else if (!cursor.last_sync_timestamp || batch.planned_cursor > cursor.last_sync_timestamp) {
        cursor.last_sync_timestamp = batch.planned_cursor;
        cursor.last_sync_status = 'success';
        cursorAdvancedTo = batch.planned_cursor;
      } else {
        monotonicSkip = true;
        state.monotonicSkips++;
      }
    }
    return {
      data: [{ remaining, succeeded, failed, finalized: true, status, cursor_advanced_to: cursorAdvancedTo, monotonic_skip: monotonicSkip }],
      error: null,
    };
  };

  const from = (table: string) => {
    const chain: any = {
      _table: table,
      _filters: [] as Array<[string, string, any]>,
      _limit: undefined as number | undefined,
      select(_cols?: string, opts?: any) {
        chain._select = { opts };
        return chain;
      },
      eq(col: string, val: any) { chain._filters.push([col, 'eq', val]); return chain; },
      in(col: string, vals: any[]) { chain._filters.push([col, 'in', vals]); return chain; },
      order() { return chain; },
      limit(n: number) { chain._limit = n; return chain; },
      async maybeSingle() {
        const rows = runSelect();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = runSelect();
        if (rows.length !== 1) return { data: null, error: { message: 'not one row' } };
        return { data: rows[0], error: null };
      },
      insert(payload: any) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted: any[] = [];
        for (const row of rows) {
          if (table === 'booking_sync_jobs') {
            const conflict = state.jobs.some(
              (j) => j.organization_id === row.organization_id
                && j.booking_id === row.booking_id
                && (j.status === 'pending' || j.status === 'processing'),
            );
            if (conflict) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { code: '23505', message: 'unique_violation' } }),
                }),
              };
            }
            const id = `job-${++state.seq}`;
            const row2: JobRow = {
              id,
              organization_id: row.organization_id,
              booking_id: row.booking_id,
              status: row.status ?? 'pending',
              event_type: row.event_type ?? 'booking.incremental',
              batch_id: row.batch_id ?? null,
              attempts: row.attempts ?? 0,
              max_attempts: row.max_attempts ?? 3,
            };
            state.jobs.push(row2);
            inserted.push(row2);
          } else if (table === 'sync_batches') {
            const id = `batch-${++state.seq}`;
            const row2: BatchRow = {
              id,
              organization_id: row.organization_id,
              sync_type: row.sync_type,
              planned_cursor: row.planned_cursor,
              status: row.status ?? 'pending',
              total_jobs: 0,
              metadata: row.metadata ?? {},
            };
            state.batches.push(row2);
            inserted.push(row2);
          }
        }
        return {
          select: () => ({
            single: async () => ({ data: inserted[0], error: null }),
          }),
        };
      },
      upsert(payload: any, opts?: any) {
        const rows = Array.isArray(payload) ? payload : [payload];
        if (table === 'sync_batch_jobs') {
          for (const row of rows) {
            const exists = state.links.some((l) => l.batch_id === row.batch_id && l.job_id === row.job_id);
            if (!exists) state.links.push({ batch_id: row.batch_id, job_id: row.job_id });
          }
        }
        return { error: null };
      },
      update(patch: any) {
        return {
          eq: (col: string, val: any) => {
            if (table === 'sync_batches') {
              const b = state.batches.find((x) => (x as any)[col] === val);
              if (b) Object.assign(b, patch);
            } else if (table === 'booking_sync_jobs') {
              const j = state.jobs.find((x) => (x as any)[col] === val);
              if (j) Object.assign(j, patch);
            }
            return { error: null };
          },
        };
      },
    };

    function runSelect(): any[] {
      let rows: any[] = [];
      if (table === 'booking_sync_jobs') rows = state.jobs.slice();
      else if (table === 'sync_batches') rows = state.batches.slice();
      else if (table === 'sync_batch_jobs') rows = state.links.slice();
      for (const [col, op, val] of chain._filters) {
        if (op === 'eq') rows = rows.filter((r) => r[col] === val);
        else if (op === 'in') rows = rows.filter((r) => (val as any[]).includes(r[col]));
      }
      if (chain._select?.opts?.count === 'exact' && chain._select?.opts?.head) {
        // count query — vi returnerar count via wrapper
        (chain as any)._count = rows.length;
      }
      return rows;
    }

    // Räknar rader: head + count uses `.eq(...)` returning `{count, error}` when awaited.
    const origEq = chain.eq;
    chain.eq = function (col: string, val: any) {
      origEq.call(chain, col, val);
      // Om detta är en head+count-select så måste kedjan vara awaitable direkt.
      if (chain._select?.opts?.count === 'exact' && chain._select?.opts?.head) {
        (chain as any).then = (resolve: any) => {
          const rows = runSelect();
          resolve({ count: rows.length, error: null });
        };
      }
      return chain;
    };

    return chain;
  };

  const client = { from, rpc };
  return { client, state };
}

// ── Ladda modulerna under test ──────────────────────────────────────────
async function loadHelpers() {
  const mod: any = await import('../../supabase/functions/_shared/syncBatch.ts');
  return mod;
}

// Seed en cursor + hjälpare för att markera jobb.
function seedCursor(state: any, org: string, ts: string) {
  state.cursors.push({
    organization_id: org, sync_type: 'booking_import',
    last_sync_timestamp: ts, last_sync_status: 'success',
  });
}
function markJob(state: any, jobId: string, status: JobRow['status']) {
  const j = state.jobs.find((x: JobRow) => x.id === jobId);
  if (j) j.status = status;
}

describe('syncBatch lifecycle contracts (11)', () => {
  let sb: ReturnType<typeof makeSupabase>;
  beforeEach(() => { sb = makeSupabase(); });

  it('1. attachJobsToBatch skapar exakt ett aktivt jobb per ny (org,booking)', async () => {
    const { createBatch, attachJobsToBatch } = await loadHelpers();
    const batchId = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    const res = await attachJobsToBatch(sb.client, batchId, 'org-A', ['b-1', 'b-2', 'b-3']);
    expect(res.createdNew).toBe(3);
    expect(res.adoptedExisting).toBe(0);
    expect(res.totalJobs).toBe(3);
    expect(sb.state.jobs.filter((j) => j.status === 'pending').length).toBe(3);
  });

  it('2. attachJobsToBatch adopterar aktivt jobb från tidigare batch (coalescing)', async () => {
    const { createBatch, attachJobsToBatch } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1']);
    const bB = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T11:00:00Z' });
    const res = await attachJobsToBatch(sb.client, bB, 'org-A', ['b-1']);
    expect(res.adoptedExisting).toBe(1);
    expect(res.createdNew).toBe(0);
    expect(sb.state.jobs.filter((j) => j.booking_id === 'b-1').length).toBe(1);
  });

  it('3. Ett coalescat jobb tillhör BÅDA batcherna via sync_batch_jobs', async () => {
    const { createBatch, attachJobsToBatch } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1']);
    const bB = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T11:00:00Z' });
    await attachJobsToBatch(sb.client, bB, 'org-A', ['b-1']);
    const jobId = sb.state.jobs.find((j) => j.booking_id === 'b-1')!.id;
    const linkedBatches = sb.state.links.filter((l) => l.job_id === jobId).map((l) => l.batch_id).sort();
    expect(linkedBatches).toEqual([bA, bB].sort());
  });

  it('4. finalizeBatchIfDone är no-op medan jobb är pending', async () => {
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1', 'b-2']);
    const res = await finalizeBatchIfDone(sb.client, bA);
    expect(res.finalized).toBe(false);
    expect(sb.state.cursors.length).toBe(0);
  });

  it('5. Alla jobb success → batch=success + cursor flyttas till planned_cursor', async () => {
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1', 'b-2']);
    sb.state.jobs.forEach((j) => markJob(sb.state, j.id, 'completed'));
    const res = await finalizeBatchIfDone(sb.client, bA);
    expect(res.status).toBe('success');
    expect(res.cursorAdvancedTo).toBe('2026-07-29T10:00:00Z');
    expect(sb.state.cursors[0].last_sync_timestamp).toBe('2026-07-29T10:00:00Z');
  });

  it('6. Något jobb failed → batch=partial + cursor rörs INTE', async () => {
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    seedCursor(sb.state, 'org-A', '2026-07-29T09:00:00Z');
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1', 'b-2']);
    markJob(sb.state, sb.state.jobs[0].id, 'completed');
    markJob(sb.state, sb.state.jobs[1].id, 'failed');
    const res = await finalizeBatchIfDone(sb.client, bA);
    expect(res.status).toBe('partial');
    expect(res.cursorAdvancedTo).toBeNull();
    expect(sb.state.cursors[0].last_sync_timestamp).toBe('2026-07-29T09:00:00Z');
  });

  it('7. Cursor är monoton — äldre planned_cursor flyttar den ALDRIG bakåt', async () => {
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    seedCursor(sb.state, 'org-A', '2026-07-29T12:00:00Z');
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1']);
    markJob(sb.state, sb.state.jobs[0].id, 'completed');
    const res = await finalizeBatchIfDone(sb.client, bA);
    expect(res.status).toBe('success');
    expect(res.monotonicSkip).toBe(true);
    expect(res.cursorAdvancedTo).toBeNull();
    expect(sb.state.cursors[0].last_sync_timestamp).toBe('2026-07-29T12:00:00Z');
  });

  it('8. Tom batch → success + cursor flyttas (inget att vänta på)', async () => {
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', []);
    const res = await finalizeBatchIfDone(sb.client, bA);
    expect(res.status).toBe('success');
    expect(res.cursorAdvancedTo).toBe('2026-07-29T10:00:00Z');
  });

  it('9. Organisationer isoleras — org-B ser aldrig org-A jobb', async () => {
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1']);
    const bB = await createBatch(sb.client, { organizationId: 'org-B', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    const res = await attachJobsToBatch(sb.client, bB, 'org-B', ['b-1']);
    // Två separata jobb — INGEN adoption över org-gräns.
    expect(res.createdNew).toBe(1);
    expect(res.adoptedExisting).toBe(0);
    expect(sb.state.jobs.filter((j) => j.booking_id === 'b-1').length).toBe(2);
    // Finalisering av bA rör bara org-A's cursor.
    markJob(sb.state, sb.state.jobs.find((j) => j.organization_id === 'org-A')!.id, 'completed');
    await finalizeBatchIfDone(sb.client, bA);
    expect(sb.state.cursors.filter((c) => c.organization_id === 'org-B').length).toBe(0);
  });

  it('10. Coalescing: när det coalescede jobbet blir completed finaliseras BÅDA batcherna', async () => {
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1']);
    const bB = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T11:00:00Z' });
    await attachJobsToBatch(sb.client, bB, 'org-A', ['b-1']);
    markJob(sb.state, sb.state.jobs[0].id, 'completed');
    const resA = await finalizeBatchIfDone(sb.client, bA);
    const resB = await finalizeBatchIfDone(sb.client, bB);
    expect(resA.finalized).toBe(true);
    expect(resB.finalized).toBe(true);
    // Cursor slutar på DEN SENASTE planned_cursor (bB), eftersom monoton politik.
    expect(sb.state.cursors[0].last_sync_timestamp).toBe('2026-07-29T11:00:00Z');
  });

  it('11. Atomicitet: två samtidiga finalize-anrop på samma batch ger EN cursor-flytt', async () => {
    // Simulerad med RPC-räkning: RPC kan anropas två gånger men får bara flytta
    // cursor en gång (monotonicSkip på andra anropet).
    const { createBatch, attachJobsToBatch, finalizeBatchIfDone } = await loadHelpers();
    const bA = await createBatch(sb.client, { organizationId: 'org-A', syncType: 'booking_import', plannedCursor: '2026-07-29T10:00:00Z' });
    await attachJobsToBatch(sb.client, bA, 'org-A', ['b-1']);
    markJob(sb.state, sb.state.jobs[0].id, 'completed');
    const [r1, r2] = await Promise.all([
      finalizeBatchIfDone(sb.client, bA),
      finalizeBatchIfDone(sb.client, bA),
    ]);
    const advanced = [r1, r2].filter((r) => r.cursorAdvancedTo !== null);
    const skipped = [r1, r2].filter((r) => r.monotonicSkip);
    expect(advanced.length).toBe(1);
    expect(skipped.length).toBe(1);
    expect(sb.state.cursors[0].last_sync_timestamp).toBe('2026-07-29T10:00:00Z');
  });
});
