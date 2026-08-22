/**
 * SCANNER HARDENING – STEG 9 contract tests: durable operation queue.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OperationQueueStore,
  createMemoryAdapter,
  type OperationQueueAdapter,
} from '@/lib/scanner/operationQueueStore';
import {
  drainQueue,
  processOperation,
  OperationTimeoutError,
} from '@/lib/scanner/operationQueueRunner';
import { canTransition, queueLaneKey } from '@/lib/scanner/operationQueueTypes';
import {
  buildQueuedOperation,
  shouldUseLegacyScanQueue,
} from '@/services/scanner/operationQueueService';
import type { ScannerCommandResult } from '@/lib/scanner/commandTypes';

/** Simulerar reload/app-restart: samma persistenta data, ny store-instans. */
const makePersistentAdapter = (): OperationQueueAdapter => createMemoryAdapter();

const op = (over: Partial<ReturnType<typeof buildQueuedOperation>> = {}) => ({
  ...buildQueuedOperation(
    { operation: 'increment', packingId: 'pack-1', itemId: 'item-1', quantityDelta: 1, scanValue: 'SKU-1' },
    'op-fixed',
    '2026-01-01T10:00:00.000Z',
  ),
  ...over,
});

let adapter: OperationQueueAdapter;
let store: OperationQueueStore;

beforeEach(() => {
  adapter = makePersistentAdapter();
  store = new OperationQueueStore(adapter);
});

describe('STEG 9 – operation payload', () => {
  it('lagrar hela operationen, inte bara scan.value', () => {
    const o = buildQueuedOperation({
      operation: 'increment',
      packingId: 'pack-1',
      packingSessionId: 'sess-1',
      organizationId: 'org-1',
      performedBy: 'joel',
      deviceId: 'dev-9',
      scanSource: 'hardware',
      scanValue: 'SN-123',
      bookingNumber: '2606-24',
      reservationId: 'res-7',
      reservationLineId: 'line-7',
    });
    for (const key of [
      'operation_id', 'organization_id', 'command', 'intended_action', 'packing_id',
      'packing_session_id', 'booking_number', 'reservation_id', 'reservation_line_id', 'performed_by',
      'device_id', 'scan_source', 'scan_value', 'created_at', 'queue_sequence', 'attempt_count',
      'last_attempt_at', 'state',
    ]) {
      expect(o, key).toHaveProperty(key);
    }
    expect(o.state).toBe('PENDING');
    expect(o.attempt_count).toBe(0);
    expect(o.reservation_line_id).toBe('line-7');
  });

  it('två unika scans ger två unika operation_id', () => {
    const a = buildQueuedOperation({ operation: 'increment', packingId: 'p', scanValue: 'A' });
    const b = buildQueuedOperation({ operation: 'increment', packingId: 'p', scanValue: 'B' });
    expect(a.operation_id).not.toBe(b.operation_id);
  });
});

describe('STEG 9 – state machine', () => {
  it('timeout leder till UNKNOWN, inte REJECTED', () => {
    expect(canTransition('SENDING', 'UNKNOWN')).toBe(true);
    expect(canTransition('UNKNOWN', 'SENDING')).toBe(true);
    expect(canTransition('COMMITTED', 'PENDING')).toBe(false);
    expect(canTransition('REJECTED', 'SENDING')).toBe(false);
  });
});

describe('STEG 9 – durability', () => {
  it('enqueue → reload → operationen finns kvar', async () => {
    await store.enqueue(op());
    const afterReload = new OperationQueueStore(adapter);
    const all = await afterReload.all();
    expect(all).toHaveLength(1);
    expect(all[0].operation_id).toBe('op-fixed');
  });

  it('network down → operationen ligger kvar som UNKNOWN och kan återupptas', async () => {
    await store.enqueue(op());
    const failing = async () => { throw new Error('Failed to fetch'); };
    await drainQueue(store, failing as any);
    const afterReload = new OperationQueueStore(adapter);
    const resumable = await afterReload.resumable();
    expect(resumable).toHaveLength(1);
    expect(resumable[0].state).toBe('UNKNOWN');
    expect(resumable[0].attempt_count).toBe(1);
  });

  it('timeout ger UNKNOWN, inte borttagning', async () => {
    await store.enqueue(op());
    await processOperation(store, (await store.all())[0], async () => {
      throw new OperationTimeoutError();
    });
    const after = await store.get('op-fixed');
    expect(after?.state).toBe('UNKNOWN');
  });

  it('finalize vägrar ta bort icke-terminal operation', async () => {
    await store.enqueue(op());
    await store.finalize('op-fixed');
    expect(await store.get('op-fixed')).not.toBeNull();
  });
});

describe('STEG 9 – retry med samma operation_id', () => {
  it('server commit + tappat svar → retry samma ID → duplicate → korrekt UI-state', async () => {
    await store.enqueue(op());
    const seenIds: string[] = [];
    let firstCall = true;

    const send = async (queued: any): Promise<ScannerCommandResult> => {
      seenIds.push(queued.operation_id);
      if (firstCall) {
        firstCall = false;
        // Servern committade, men svaret tappades på vägen tillbaka.
        throw new OperationTimeoutError();
      }
      return {
        status: 'duplicate',
        operationId: queued.operation_id,
        itemId: 'item-1',
        packedQuantity: 1,
        requiredQuantity: 10,
        replayed: true,
      };
    };

    await drainQueue(store, send as any);
    expect((await store.get('op-fixed'))?.state).toBe('UNKNOWN');

    // Reload mellan försöken — kön återupptas från persistent lagring.
    const resumed = new OperationQueueStore(adapter);
    const results: ScannerCommandResult[] = [];
    await drainQueue(resumed, send as any, { onResult: (_o, r) => results.push(r) });

    expect(seenIds).toEqual(['op-fixed', 'op-fixed']); // samma ID vid retry
    expect(results[0].packedQuantity).toBe(1); // ingen dubbelräkning
    expect(await resumed.get('op-fixed')).toBeNull(); // terminal → ur kön
  });

  it('generic duplicate utan replay-bevis får aldrig bli COMMITTED', async () => {
    await store.enqueue(op());
    await drainQueue(store, (async (queued: any) => ({
      status: 'duplicate', operationId: queued.operation_id, itemId: 'item-1', packedQuantity: 1,
      replayed: false,
    })) as any);
    expect(await store.get('op-fixed')).toBeNull();
    expect(await store.resumable()).toHaveLength(0);
  });

  it('rejected tas ur retry-loopen', async () => {
    await store.enqueue(op());
    const send = async (queued: any): Promise<ScannerCommandResult> => ({
      status: 'rejected',
      operationId: queued.operation_id,
      itemId: 'item-1',
      message: 'Fel bokning',
    });
    await drainQueue(store, send as any);
    expect(await store.get('op-fixed')).toBeNull();
    expect(await store.resumable()).toHaveLength(0);

    let calls = 0;
    await drainQueue(store, (async () => { calls++; return { status: 'accepted', operationId: 'x' }; }) as any);
    expect(calls).toBe(0);
  });

  it('enqueue med samma operation_id skapar aldrig dubbletter', async () => {
    await store.enqueue(op());
    await store.enqueue(op({ scan_value: 'annat' }));
    expect(await store.all()).toHaveLength(1);
  });
});

describe('STEG 9 – ordning och dubbelkö-spärr', () => {
  it('lane-nyckeln serialiserar per packningskontext', () => {
    expect(queueLaneKey({ packing_id: 'p1', packing_session_id: 's1' }))
      .toBe(queueLaneKey({ packing_id: 'p1', packing_session_id: 's1' }));
    expect(queueLaneKey({ packing_id: 'p1', packing_session_id: 's1' }))
      .not.toBe(queueLaneKey({ packing_id: 'p2', packing_session_id: 's1' }));
  });

  it('UNKNOWN i samma lane blockerar senare operationer tills den tidigare är terminal', async () => {
    await store.enqueue(op({ operation_id: 'first', queue_sequence: 1 }));
    await store.enqueue(op({ operation_id: 'second', queue_sequence: 2 }));
    const order: string[] = [];
    await drainQueue(store, (async (q: any) => {
      order.push(q.operation_id);
      if (q.operation_id === 'first') throw new OperationTimeoutError('response lost');
      return { status: 'accepted', operationId: q.operation_id, itemId: 'item-1', packedQuantity: 2, requiredQuantity: 10 };
    }) as any);
    expect(order).toEqual(['first']);
    expect((await store.get('first'))?.state).toBe('UNKNOWN');
    expect((await store.get('second'))?.state).toBe('PENDING');
  });

  it('operationer i samma lane körs sekventiellt i created_at-ordning', async () => {
    await store.enqueue(op({ operation_id: 'a', created_at: '2026-01-01T10:00:00.000Z' }));
    await store.enqueue(op({ operation_id: 'b', created_at: '2026-01-01T10:00:01.000Z' }));
    const order: string[] = [];
    await drainQueue(store, (async (q: any) => {
      order.push(q.operation_id);
      await new Promise((r) => setTimeout(r, 1));
      return { status: 'accepted', operationId: q.operation_id, itemId: 'item-1', packedQuantity: 1, requiredQuantity: 10 };
    }) as any);
    expect(order).toEqual(['a', 'b']);
  });

  it('legacy ScanQueue används endast när V2-flaggan är OFF', () => {
    expect(shouldUseLegacyScanQueue()).toBe(true); // flaggan är OFF i detta steg
    const src = readFileSync(resolve(process.cwd(), 'src/services/scanner/ScannerService.ts'), 'utf8');
    expect(src).toContain('shouldUseLegacyScanQueue()');
    expect(/if \(shouldUseLegacyScanQueue\(\)\) \{\s*\n\s*enqueueScan/.test(src)).toBe(true);
  });

  it('V2-kön använder IndexedDB, inte localStorage eller runtime RAM-fallback', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/scanner/operationQueueStore.ts'), 'utf8');
    expect(src).toContain('indexedDB');
    expect(src.includes('localStorage.setItem')).toBe(false);
    expect(src).toContain('SCANNER_DURABLE_QUEUE_UNAVAILABLE');
    expect(src).not.toContain('faller tillbaka på minneskö');
  });
});
