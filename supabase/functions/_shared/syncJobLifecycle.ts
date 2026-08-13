/**
 * STEG 4B — Job/retry-livscykel för booking sync-kön.
 *
 * Ren logik (inga DB-anrop) som speglar databasens state machine och
 * retry-policy i `booking_sync_jobs`. Både workern och testerna använder
 * denna modul så att klient och server aldrig kan glida isär.
 *
 * STATE MACHINE
 *   pending    → processing | failed
 *   processing → completed | retryable | failed | pending   (pending = re-queue)
 *   retryable  → processing | failed
 *   completed  → (terminal)
 *   failed     → (terminal)
 */

export type SyncJobStatus = 'pending' | 'processing' | 'retryable' | 'completed' | 'failed';

export const SYNC_JOB_STATES: readonly SyncJobStatus[] = [
  'pending',
  'processing',
  'retryable',
  'completed',
  'failed',
] as const;

export const SYNC_JOB_TRANSITIONS: Record<SyncJobStatus, readonly SyncJobStatus[]> = {
  pending: ['processing', 'failed'],
  processing: ['completed', 'retryable', 'failed', 'pending'],
  retryable: ['processing', 'failed'],
  completed: [],
  failed: [],
};

/** Terminala states — får aldrig lämnas. */
export const TERMINAL_SYNC_JOB_STATES: readonly SyncJobStatus[] = ['completed', 'failed'] as const;

/** States som blockerar att en batch finaliseras. */
export const BATCH_BLOCKING_STATES: readonly SyncJobStatus[] = ['pending', 'processing', 'retryable'] as const;

/** Enda state som räknas som godkänt success-utfall för batch-finalisering. */
export const BATCH_SUCCESS_STATE: SyncJobStatus = 'completed';

/** Serverstyrt hårt tak. En request kan aldrig höja detta. */
export const MAX_ATTEMPTS_HARD_CAP = 5;
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Lease-längd för ett claim:at jobb. Efter detta får ett annat jobb ta över. */
export const JOB_LEASE_SECONDS = 300;

/** Bounded exponential backoff. */
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

export function isTerminalSyncJobStatus(status: string): boolean {
  return (TERMINAL_SYNC_JOB_STATES as readonly string[]).includes(status);
}

export function blocksBatchFinalization(status: string): boolean {
  return (BATCH_BLOCKING_STATES as readonly string[]).includes(status);
}

export function canTransitionSyncJob(from: string, to: string): boolean {
  if (!(SYNC_JOB_STATES as readonly string[]).includes(from)) return false;
  if (!(SYNC_JOB_STATES as readonly string[]).includes(to)) return false;
  if (from === to) return true;
  return (SYNC_JOB_TRANSITIONS[from as SyncJobStatus] as readonly string[]).includes(to);
}

export function assertSyncJobTransition(from: string, to: string): void {
  if (!canTransitionSyncJob(from, to)) {
    throw new Error(`invalid_sync_job_transition_${from}_to_${to}`);
  }
}

/**
 * max_attempts är serverstyrt. Ett värde från request kan bara sänka,
 * aldrig höja, och kapas alltid av det hårda taket.
 */
export function resolveMaxAttempts(requested?: number | null, stored?: number | null): number {
  const base = typeof stored === 'number' && stored > 0 ? stored : DEFAULT_MAX_ATTEMPTS;
  const capped = Math.min(base, MAX_ATTEMPTS_HARD_CAP);
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 1) return capped;
  return Math.min(capped, Math.floor(requested));
}

/** Bounded exponential backoff: 30s, 60s, 120s, … max 15 min. */
export function computeRetryBackoffMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts || 1));
  const raw = BACKOFF_BASE_MS * Math.pow(2, n - 1);
  return Math.min(raw, BACKOFF_MAX_MS);
}

export function nextAttemptAtIso(attempts: number, nowMs: number = Date.now()): string {
  return new Date(nowMs + computeRetryBackoffMs(attempts)).toISOString();
}

export interface JobOutcomeInput {
  permanent: boolean;
  retriable: boolean;
  attempts: number;
  maxAttempts: number;
}

export interface JobOutcome {
  status: 'completed' | 'retryable' | 'failed';
  reason: 'success' | 'retry' | 'permanent_error' | 'max_attempts_exhausted';
}

/** Klassar resultatet av ett försök. Max attempts ⇒ explicit terminalt fel. */
export function classifyJobFailure(input: JobOutcomeInput): JobOutcome {
  if (input.permanent) return { status: 'failed', reason: 'permanent_error' };
  if (!input.retriable) return { status: 'failed', reason: 'permanent_error' };
  const max = resolveMaxAttempts(null, input.maxAttempts);
  if (input.attempts >= max) return { status: 'failed', reason: 'max_attempts_exhausted' };
  return { status: 'retryable', reason: 'retry' };
}

export interface LeaseState {
  status: string;
  leaseExpiresAt: string | null;
}

/** Ett processing-jobb får bara tas över när dess lease löpt ut. */
export function canTakeOverJob(job: LeaseState, nowMs: number = Date.now()): boolean {
  if (job.status !== 'processing') return false;
  if (!job.leaseExpiresAt) return false;
  return Date.parse(job.leaseExpiresAt) <= nowMs;
}

/** Gammal worker får aldrig commit:a efter takeover. */
export function canCommitWithToken(currentToken: string | null, workerToken: string | null): boolean {
  if (!currentToken || !workerToken) return false;
  return currentToken === workerToken;
}
