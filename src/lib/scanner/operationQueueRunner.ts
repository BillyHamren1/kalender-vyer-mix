/**
 * SCANNER HARDENING – STEG 9: processor för den durable operation queue.
 *
 * Regler:
 * - operation_id skapas en gång; retry använder SAMMA id (idempotensnyckel).
 * - Timeout/nätfel → UNKNOWN (aldrig FAILED/REJECTED), retryas senare.
 * - COMMITTED/REJECTED är enda vägen ut ur kön.
 * - Kön serialiseras per packningskontext (lane) så ordningen bevaras.
 */

import { isAcceptedResult, type ScannerCommandResult } from './commandTypes';
import type { QueuedOperation } from './operationQueueTypes';
import { queueLaneKey } from './operationQueueTypes';
import type { OperationQueueStore } from './operationQueueStore';

export type SendOperation = (op: QueuedOperation) => Promise<ScannerCommandResult>;

export interface RunnerOptions {
  /** Max operationer per körning (bounded work). */
  maxPerRun?: number;
  /** Max försök innan operationen parkeras (ligger kvar som UNKNOWN). */
  maxAttempts?: number;
  now?: () => Date;
  onResult?: (op: QueuedOperation, result: ScannerCommandResult) => void;
}

export class OperationTimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'OperationTimeoutError';
  }
}

const isUnknownOutcome = (err: unknown): boolean =>
  err instanceof OperationTimeoutError ||
  /timeout|network|aborted|failed to fetch/i.test(String((err as any)?.message ?? err));

const operationsInFlight = new WeakMap<OperationQueueStore, Map<string, Promise<QueuedOperation | null>>>();
const drainsInFlight = new WeakMap<OperationQueueStore, Promise<number>>();

const terminalProofError = (
  op: QueuedOperation,
  result: ScannerCommandResult,
): string | null => {
  if (result.operationId !== op.operation_id) {
    return 'Terminal response operation_id did not match the durable operation';
  }

  if (!isAcceptedResult(result)) return null;

  if (!op.item_id || result.itemId !== op.item_id) {
    return 'Accepted response item_id did not match the exact durable target';
  }

  const authoritativeQuantity = op.command === 'RETURN_INSTANCE' || op.command === 'RETURN_QUANTITY'
    ? result.returnedQuantity
    : result.packedQuantity;
  if (typeof authoritativeQuantity !== 'number' || !Number.isFinite(authoritativeQuantity) || authoritativeQuantity < 0) {
    return 'Accepted response lacked a valid authoritative quantity';
  }

  return null;
};

const processOperationOnce = async (
  store: OperationQueueStore,
  op: QueuedOperation,
  send: SendOperation,
  opts: RunnerOptions = {},
): Promise<QueuedOperation | null> => {
  const now = opts.now ?? (() => new Date());
  const attemptAt = now().toISOString();

  await store.transition(op.operation_id, 'SENDING', {
    attempt_count: op.attempt_count + 1,
    last_attempt_at: attemptAt,
  });

  let result: ScannerCommandResult;
  try {
    // Samma operation_id skickas alltid — servern kan idempotency-loopa upp
    // en tidigare commit och svara 'duplicate' istället för att dubbelräkna.
    result = await send({ ...op, attempt_count: op.attempt_count + 1, last_attempt_at: attemptAt });
  } catch (err) {
    if (isUnknownOutcome(err)) {
      return store.transition(op.operation_id, 'UNKNOWN', {
        last_error: String((err as any)?.message ?? err),
      });
    }
    return store.transition(op.operation_id, 'UNKNOWN', {
      last_error: String((err as any)?.message ?? err),
    });
  }

  const proofError = terminalProofError(op, result);
  if (proofError) {
    return store.transition(op.operation_id, 'UNKNOWN', {
      result,
      last_error: proofError,
    });
  }

  opts.onResult?.(op, result);

  if (isAcceptedResult(result)) {
    const committed = await store.transition(op.operation_id, 'COMMITTED', { result, last_error: null });
    await store.finalize(op.operation_id);
    return committed;
  }

  if (result.status === 'duplicate' && result.replayed !== true) {
    const rejected = await store.transition(op.operation_id, 'REJECTED', {
      result,
      last_error: 'Duplicate response lacked same-operation replay proof',
    });
    await store.finalize(op.operation_id);
    return rejected;
  }

  if (result.status === 'rejected' || result.status === 'wrong_booking' ||
      result.status === 'over_capacity' || result.status === 'not_found') {
    const rejected = await store.transition(op.operation_id, 'REJECTED', {
      result,
      last_error: result.message ?? result.status,
    });
    await store.finalize(op.operation_id);
    return rejected;
  }

  return store.transition(op.operation_id, 'UNKNOWN', { result, last_error: 'Okänt svar' });
};

/**
 * A physical operation may be reached concurrently from the foreground scan,
 * app-start recovery and the browser online/timer handlers. Share one promise
 * per durable operation so those local triggers can never send the same
 * operation in parallel. Cross-device idempotency remains the WMS gateway's
 * responsibility through operation_id.
 */
export const processOperation = (
  store: OperationQueueStore,
  op: QueuedOperation,
  send: SendOperation,
  opts: RunnerOptions = {},
): Promise<QueuedOperation | null> => {
  let inFlight = operationsInFlight.get(store);
  if (!inFlight) {
    inFlight = new Map();
    operationsInFlight.set(store, inFlight);
  }

  const existing = inFlight.get(op.operation_id);
  if (existing) return existing;

  const task = processOperationOnce(store, op, send, opts).finally(() => {
    if (inFlight?.get(op.operation_id) === task) inFlight.delete(op.operation_id);
  });
  inFlight.set(op.operation_id, task);
  return task;
};

/**
 * Kör kön en gång. Operationer i samma lane körs strikt sekventiellt;
 * olika lanes kan köras parallellt utan att ordningen bryts.
 */
const drainQueueOnce = async (
  store: OperationQueueStore,
  send: SendOperation,
  opts: RunnerOptions = {},
): Promise<number> => {
  const maxPerRun = opts.maxPerRun ?? 25;
  // Never silently park an unresolved physical scan after an arbitrary retry count.
  // Callers may set a bounded maxAttempts for controlled tests, but production
  // keeps UNKNOWN operations resumable until a terminal server answer exists.
  const maxAttempts = opts.maxAttempts ?? Number.POSITIVE_INFINITY;
  const pending = (await store.resumable())
    .filter((o) => o.attempt_count < maxAttempts)
    .slice(0, maxPerRun);

  const lanes = new Map<string, QueuedOperation[]>();
  for (const op of pending) {
    const key = queueLaneKey(op);
    const list = lanes.get(key) ?? [];
    list.push(op);
    lanes.set(key, list);
  }

  let processed = 0;
  await Promise.all(
    [...lanes.values()].map(async (laneOps) => {
      for (const op of laneOps) {
        const fresh = await store.get(op.operation_id);
        if (!fresh) continue;
        const outcome = await processOperation(store, fresh, send, opts);
        processed += 1;
        // Preserve user intent ordering. If an earlier operation is still
        // ambiguous, later operations in the same packing lane must wait.
        if (outcome && (outcome.state === 'UNKNOWN' || outcome.state === 'PENDING' || outcome.state === 'SENDING')) break;
      }
    }),
  );
  return processed;
};

/** Share a single queue drain across app-start, online and recovery triggers. */
export const drainQueue = (
  store: OperationQueueStore,
  send: SendOperation,
  opts: RunnerOptions = {},
): Promise<number> => {
  const existing = drainsInFlight.get(store);
  if (existing) return existing;

  const task = drainQueueOnce(store, send, opts).finally(() => {
    if (drainsInFlight.get(store) === task) drainsInFlight.delete(store);
  });
  drainsInFlight.set(store, task);
  return task;
};
