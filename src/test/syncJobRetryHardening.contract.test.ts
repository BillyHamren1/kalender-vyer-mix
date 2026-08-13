/**
 * STEG 4B — retry, jobs och batcher.
 *
 * Testar state machine, retry-tak, backoff, lease/takeover, duplicate delivery,
 * batch-finalisering, cursor-monotonicitet, poison job-isolering och tenant-scope.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeSupabase } from './sync-harness/fakeSupabase';
import {
  ORG_A,
  ORG_B,
  resetFactorySeq,
  makeSyncJob,
  makeSyncBatch,
  makeSyncState,
} from './sync-harness/factories';
import {
  SYNC_JOB_TRANSITIONS,
  canTransitionSyncJob,
  assertSyncJobTransition,
  isTerminalSyncJobStatus,
  blocksBatchFinalization,
  BATCH_SUCCESS_STATE,
  MAX_ATTEMPTS_HARD_CAP,
  DEFAULT_MAX_ATTEMPTS,
  resolveMaxAttempts,
  computeRetryBackoffMs,
  nextAttemptAtIso,
  classifyJobFailure,
  canTakeOverJob,
  canCommitWithToken,
  BACKOFF_MAX_MS,
  JOB_LEASE_SECONDS,
} from '../../supabase/functions/_shared/syncJobLifecycle';

beforeEach(() => resetFactorySeq());

// ─────────────────────────── 1. State machine ───────────────────────────
describe('STEG 4B — job state machine', () => {
  it('tillåter dokumenterade transitions', () => {
    expect(canTransitionSyncJob('pending', 'processing')).toBe(true);
    expect(canTransitionSyncJob('processing', 'completed')).toBe(true);
    expect(canTransitionSyncJob('processing', 'retryable')).toBe(true);
    expect(canTransitionSyncJob('retryable', 'processing')).toBe(true);
    expect(canTransitionSyncJob('processing', 'failed')).toBe(true);
  });

  it('blockerar ogiltiga och terminala transitions', () => {
    expect(canTransitionSyncJob('completed', 'processing')).toBe(false);
    expect(canTransitionSyncJob('failed', 'pending')).toBe(false);
    expect(canTransitionSyncJob('pending', 'completed')).toBe(false);
    expect(canTransitionSyncJob('retryable', 'completed')).toBe(false);
    expect(canTransitionSyncJob('processing', 'bogus')).toBe(false);
    expect(() => assertSyncJobTransition('completed', 'processing')).toThrow(
      /invalid_sync_job_transition_completed_to_processing/,
    );
  });

  it('terminala states har inga utgångar', () => {
    expect(SYNC_JOB_TRANSITIONS.completed).toEqual([]);
    expect(SYNC_JOB_TRANSITIONS.failed).toEqual([]);
    expect(isTerminalSyncJobStatus('completed')).toBe(true);
    expect(isTerminalSyncJobStatus('retryable')).toBe(false);
  });

  it('endast completed räknas som success för batchen', () => {
    expect(BATCH_SUCCESS_STATE).toBe('completed');
    for (const s of ['pending', 'processing', 'retryable']) {
      expect(blocksBatchFinalization(s)).toBe(true);
    }
    expect(blocksBatchFinalization('completed')).toBe(false);
    expect(blocksBatchFinalization('failed')).toBe(false);
  });
});

// ─────────────────────────── 2. Retry count ───────────────────────────
describe('STEG 4B — max retries', () => {
  it('request kan aldrig höja max_attempts', () => {
    expect(resolveMaxAttempts(999, 3)).toBe(3);
    expect(resolveMaxAttempts(99, 5)).toBe(MAX_ATTEMPTS_HARD_CAP);
    expect(resolveMaxAttempts(2, 3)).toBe(2); // sänkning tillåts
    expect(resolveMaxAttempts(null, null)).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(resolveMaxAttempts(null, 100)).toBe(MAX_ATTEMPTS_HARD_CAP);
  });

  it('max attempts ger explicit terminalt fel, inte evig retry', () => {
    expect(classifyJobFailure({ permanent: false, retriable: true, attempts: 1, maxAttempts: 3 })).toEqual({
      status: 'retryable',
      reason: 'retry',
    });
    expect(classifyJobFailure({ permanent: false, retriable: true, attempts: 3, maxAttempts: 3 })).toEqual({
      status: 'failed',
      reason: 'max_attempts_exhausted',
    });
    expect(classifyJobFailure({ permanent: true, retriable: false, attempts: 1, maxAttempts: 3 })).toEqual({
      status: 'failed',
      reason: 'permanent_error',
    });
  });
});

// ─────────────────────────── 3. Backoff ───────────────────────────
describe('STEG 4B — retry delay', () => {
  it('bounded exponential backoff', () => {
    expect(computeRetryBackoffMs(1)).toBe(30_000);
    expect(computeRetryBackoffMs(2)).toBe(60_000);
    expect(computeRetryBackoffMs(3)).toBe(120_000);
    expect(computeRetryBackoffMs(50)).toBe(BACKOFF_MAX_MS);
    expect(computeRetryBackoffMs(0)).toBe(30_000);
  });

  it('next_attempt_at ligger alltid i framtiden och ökar med försöken', () => {
    const t0 = Date.parse('2026-08-01T10:00:00.000Z');
    const a = Date.parse(nextAttemptAtIso(1, t0));
    const b = Date.parse(nextAttemptAtIso(2, t0));
    expect(a).toBeGreaterThan(t0);
    expect(b).toBeGreaterThan(a);
  });
});

// ─────────────────────────── 4-9. Kö-beteende mot fake DB ───────────────────────────
function queue(jobs: any[], extra: Record<string, any[]> = {}) {
  return createFakeSupabase({
    seed: {
      booking_sync_jobs: jobs,
      sync_batches: [],
      sync_state: [makeSyncState()],
      ...extra,
    },
  });
}

describe('STEG 4B — claim, lease och takeover', () => {
  it('claim sätter lease + token och räknar upp attempts', async () => {
    const sb = queue([makeSyncJob({ id: 'j1', status: 'pending' })]);
    const { data } = await sb.rpc('claim_sync_jobs', {
      batch_limit: 10,
      p_worker_id: 'w1',
      p_lease_seconds: JOB_LEASE_SECONDS,
    });
    const job = (data as any[])[0];
    expect(job.status).toBe('processing');
    expect(job.attempts).toBe(1);
    expect(job.worker_token).toBeTruthy();
    expect(job.lease_expires_at).toBeTruthy();
  });

  it('worker crash: processing med levande lease får INTE tas över', async () => {
    const sb = queue([
      makeSyncJob({
        id: 'j1',
        status: 'processing',
        worker_token: 'wt-live',
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    ]);
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 10, p_worker_id: 'w2' });
    expect(data).toEqual([]);
    expect(
      canTakeOverJob({ status: 'processing', leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
    ).toBe(false);
  });

  it('lease expiry: utgånget processing-jobb återtas med nytt token', async () => {
    const sb = queue([
      makeSyncJob({
        id: 'j1',
        status: 'processing',
        attempts: 1,
        worker_token: 'wt-old',
        lease_expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ]);
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 10, p_worker_id: 'w2' });
    const job = (data as any[])[0];
    expect(job.worker_token).not.toBe('wt-old');
    expect(job.attempts).toBe(2);
    expect(canTakeOverJob({ status: 'processing', leaseExpiresAt: new Date(Date.now() - 1).toISOString() })).toBe(true);
  });

  it('gammal worker kan inte commit:a efter takeover', async () => {
    const sb = queue([
      makeSyncJob({
        id: 'j1',
        status: 'processing',
        worker_token: 'wt-old',
        lease_expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ]);
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 10, p_worker_id: 'w2' });
    const newToken = (data as any[])[0].worker_token;

    const stale = await sb.rpc('complete_sync_job', { _job_id: 'j1', _worker_token: 'wt-old' });
    expect(stale.data).toBe(false);
    const staleFail = await sb.rpc('fail_sync_job', {
      _job_id: 'j1',
      _worker_token: 'wt-old',
      _error: 'boom',
      _retriable: true,
    });
    expect((staleFail.data as any[])[0].updated).toBe(false);
    expect((sb.db.tables.booking_sync_jobs[0] as any).status).toBe('processing');

    const fresh = await sb.rpc('complete_sync_job', { _job_id: 'j1', _worker_token: newToken });
    expect(fresh.data).toBe(true);
    expect((sb.db.tables.booking_sync_jobs[0] as any).status).toBe('completed');
    expect(canCommitWithToken(newToken, 'wt-old')).toBe(false);
    expect(canCommitWithToken(newToken, newToken)).toBe(true);
  });

  it('duplicate delivery: upprepad complete på samma jobb är idempotent', async () => {
    const sb = queue([makeSyncJob({ id: 'j1', status: 'pending' })]);
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 10, p_worker_id: 'w1' });
    const token = (data as any[])[0].worker_token;
    const first = await sb.rpc('complete_sync_job', { _job_id: 'j1', _worker_token: token });
    const second = await sb.rpc('complete_sync_job', { _job_id: 'j1', _worker_token: token });
    expect(first.data).toBe(true);
    expect(second.data).toBe(false); // ingen andra mutation
    expect((sb.db.tables.booking_sync_jobs[0] as any).status).toBe('completed');
    // Ett completed jobb får inte claim:as igen.
    const reclaim = await sb.rpc('claim_sync_jobs', { batch_limit: 10, p_worker_id: 'w2' });
    expect(reclaim.data).toEqual([]);
  });

  it('max retries: sista misslyckandet blir failed, inte retryable, och claim:as ej mer', async () => {
    const sb = queue([makeSyncJob({ id: 'j1', status: 'pending', attempts: 2, max_attempts: 3 })]);
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 10, p_worker_id: 'w1' });
    const job = (data as any[])[0];
    expect(job.attempts).toBe(3);
    const res = await sb.rpc('fail_sync_job', {
      _job_id: 'j1',
      _worker_token: job.worker_token,
      _error: 'timeout',
      _retriable: true,
    });
    expect((res.data as any[])[0].new_status).toBe('failed');
    const again = await sb.rpc('claim_sync_jobs', { batch_limit: 10, p_worker_id: 'w1' });
    expect(again.data).toEqual([]);
  });

  it('retryable jobb plockas upp igen först när next_attempt_at passerat', async () => {
    const sb = queue([
      makeSyncJob({
        id: 'j1',
        status: 'retryable',
        attempts: 1,
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    ]);
    expect((await sb.rpc('claim_sync_jobs', { batch_limit: 10 })).data).toEqual([]);
    (sb.db.tables.booking_sync_jobs[0] as any).next_attempt_at = new Date(Date.now() - 1000).toISOString();
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 10 });
    expect((data as any[])[0].status).toBe('processing');
  });

  it('poison job i org A blockerar inte org B (fair share per org)', async () => {
    const jobs = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeSyncJob({ id: `a${i}`, organization_id: ORG_A, received_at: `2026-08-01T10:0${i}:00.000Z` }),
      ),
      makeSyncJob({ id: 'b1', organization_id: ORG_B, received_at: '2026-08-01T11:00:00.000Z' }),
    ];
    const sb = queue(jobs);
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 3, p_max_per_org: 2 });
    const claimed = data as any[];
    expect(claimed.filter((j) => j.organization_id === ORG_A)).toHaveLength(2);
    expect(claimed.some((j) => j.organization_id === ORG_B)).toBe(true);
  });

  it('två organisationer: fel i org A rör inte org B:s jobb', async () => {
    const sb = queue([
      makeSyncJob({ id: 'a1', organization_id: ORG_A }),
      makeSyncJob({ id: 'b1', organization_id: ORG_B }),
    ]);
    const { data } = await sb.rpc('claim_sync_jobs', { batch_limit: 10 });
    const a = (data as any[]).find((j) => j.id === 'a1');
    await sb.rpc('fail_sync_job', {
      _job_id: 'a1',
      _worker_token: a.worker_token,
      _error: 'permanent',
      _retriable: false,
    });
    const rowB = (sb.db.tables.booking_sync_jobs as any[]).find((j) => j.id === 'b1');
    expect(rowB.status).toBe('processing');
    expect(rowB.error_message ?? null).toBeNull();
  });
});

// ─────────────────────────── 6-7. Batch + cursor ───────────────────────────
describe('STEG 4B — batch finalization och cursor', () => {
  const setup = (jobStatuses: string[]) =>
    createFakeSupabase({
      seed: {
        sync_batches: [
          makeSyncBatch({
            id: 'batch-1',
            organization_id: ORG_A,
            planned_cursor: '2026-08-02T00:00:00.000Z',
            total_jobs: jobStatuses.length,
          }),
        ],
        booking_sync_jobs: jobStatuses.map((s, i) =>
          makeSyncJob({ id: `j${i}`, batch_id: 'batch-1', status: s as any, organization_id: ORG_A }),
        ),
        sync_state: [makeSyncState({ organization_id: ORG_A, last_sync_timestamp: '2026-07-01T00:00:00.000Z' })],
      },
    });

  it('retryable jobb blockerar finalisering och cursor', async () => {
    const sb = setup(['completed', 'retryable']);
    const { data } = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-1' });
    const row = (data as any[])[0];
    expect(row.finalized).toBe(false);
    expect(row.remaining).toBe(1);
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-07-01T00:00:00.000Z');
  });

  it('mixed success/failed batch blir partial utan cursorflytt', async () => {
    const sb = setup(['completed', 'failed']);
    const { data } = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-1' });
    const row = (data as any[])[0];
    expect(row.status).toBe('partial');
    expect(row.cursor_advanced_to).toBeNull();
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-07-01T00:00:00.000Z');
  });

  it('endast helt lyckad batch flyttar cursorn', async () => {
    const sb = setup(['completed', 'completed']);
    const { data } = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-1' });
    expect((data as any[])[0].status).toBe('success');
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-08-02T00:00:00.000Z');
  });

  it('cursor monotonicitet: äldre planned_cursor flyttar aldrig bakåt', async () => {
    const sb = createFakeSupabase({
      seed: {
        sync_batches: [
          makeSyncBatch({ id: 'old', organization_id: ORG_A, planned_cursor: '2026-06-01T00:00:00.000Z', total_jobs: 1 }),
        ],
        booking_sync_jobs: [makeSyncJob({ id: 'j1', batch_id: 'old', status: 'completed', organization_id: ORG_A })],
        sync_state: [makeSyncState({ organization_id: ORG_A, last_sync_timestamp: '2026-08-01T00:00:00.000Z' })],
      },
    });
    const { data } = await sb.rpc('finalize_sync_batch', { _batch_id: 'old' });
    expect((data as any[])[0].cursor_advanced_to).toBeNull();
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-08-01T00:00:00.000Z');
  });

  it('partial job (jobbet retryas) → batch stannar pending tills terminalt', async () => {
    const sb = setup(['retryable']);
    let res = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-1' });
    expect((res.data as any[])[0].finalized).toBe(false);
    // Retry lyckas
    const claim = await sb.rpc('claim_sync_jobs', { batch_limit: 10 });
    const token = (claim.data as any[])[0].worker_token;
    await sb.rpc('complete_sync_job', { _job_id: 'j0', _worker_token: token });
    res = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-1' });
    expect((res.data as any[])[0].status).toBe('success');
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-08-02T00:00:00.000Z');
  });
});
