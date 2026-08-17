/**
 * SCANNER HARDENING – STEG 9: persistent lagring för operation queue.
 *
 * IndexedDB är primär store (överlever reload, WebView-crash, app-restart).
 * localStorage-arrayen i legacy ScanQueue är INTE transaktionskö för V2.
 * En in-memory-adapter används endast som sista utväg (t.ex. test/SSR) och
 * loggar varning — den är aldrig ett tyst tapp av operationer.
 */

import type { QueuedOperation, OperationState } from './operationQueueTypes';
import { canTransition, isTerminalState } from './operationQueueTypes';

export interface OperationQueueAdapter {
  readonly kind: 'indexeddb' | 'memory';
  getAll(): Promise<QueuedOperation[]>;
  get(operationId: string): Promise<QueuedOperation | null>;
  put(op: QueuedOperation): Promise<void>;
  remove(operationId: string): Promise<void>;
  clear(): Promise<void>;
}

export const createMemoryAdapter = (): OperationQueueAdapter => {
  const map = new Map<string, QueuedOperation>();
  return {
    kind: 'memory',
    async getAll() {
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async get(id) {
      return map.get(id) ?? null;
    },
    async put(op) {
      map.set(op.operation_id, { ...op });
    },
    async remove(id) {
      map.delete(id);
    },
    async clear() {
      map.clear();
    },
  };
};

const DB_NAME = 'eventflow_scanner_v2';
const STORE = 'operations';

const openDb = (indexedDb: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDb.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'operation_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const promisify = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const createIndexedDbAdapter = (indexedDb: IDBFactory): OperationQueueAdapter => {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb(indexedDb));
  const tx = async (mode: IDBTransactionMode) => (await db()).transaction(STORE, mode).objectStore(STORE);

  return {
    kind: 'indexeddb',
    async getAll() {
      const store = await tx('readonly');
      const rows = (await promisify(store.getAll())) as QueuedOperation[];
      return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async get(id) {
      const store = await tx('readonly');
      return ((await promisify(store.get(id))) as QueuedOperation) ?? null;
    },
    async put(op) {
      const store = await tx('readwrite');
      await promisify(store.put(op));
    },
    async remove(id) {
      const store = await tx('readwrite');
      await promisify(store.delete(id));
    },
    async clear() {
      const store = await tx('readwrite');
      await promisify(store.clear());
    },
  };
};

export const resolveDefaultAdapter = (): OperationQueueAdapter => {
  const idb = typeof globalThis !== 'undefined' ? (globalThis as any).indexedDB : undefined;
  if (idb) return createIndexedDbAdapter(idb as IDBFactory);
  console.warn('[operationQueue] IndexedDB saknas — faller tillbaka på minneskö (ej durable)');
  return createMemoryAdapter();
};

/**
 * Durable kö. Terminal status (COMMITTED/REJECTED) är ENDA anledningen till att
 * en operation lämnar kön. Timeout/nätfel → UNKNOWN, som ligger kvar för retry.
 */
export class OperationQueueStore {
  constructor(private adapter: OperationQueueAdapter = resolveDefaultAdapter()) {}

  get storageKind() {
    return this.adapter.kind;
  }

  async enqueue(op: QueuedOperation): Promise<QueuedOperation> {
    const existing = await this.adapter.get(op.operation_id);
    // Idempotent enqueue: samma operation_id får aldrig bli två rader.
    if (existing) return existing;
    await this.adapter.put(op);
    return op;
  }

  async all(): Promise<QueuedOperation[]> {
    return this.adapter.getAll();
  }

  async get(operationId: string): Promise<QueuedOperation | null> {
    return this.adapter.get(operationId);
  }

  /** Operationer som ska återupptas efter reload/restart. */
  async resumable(): Promise<QueuedOperation[]> {
    const all = await this.adapter.getAll();
    return all.filter((o) => o.state === 'PENDING' || o.state === 'UNKNOWN' || o.state === 'SENDING');
  }

  async transition(
    operationId: string,
    next: OperationState,
    patch: Partial<QueuedOperation> = {},
  ): Promise<QueuedOperation | null> {
    const current = await this.adapter.get(operationId);
    if (!current) return null;
    if (current.state === next) {
      const same = { ...current, ...patch };
      await this.adapter.put(same);
      return same;
    }
    if (!canTransition(current.state, next)) {
      console.warn('[operationQueue] blocked transition', current.state, '→', next);
      return current;
    }
    const updated: QueuedOperation = { ...current, ...patch, state: next };
    await this.adapter.put(updated);
    return updated;
  }

  /** Tas bort endast när servern gett slutstatus. */
  async finalize(operationId: string): Promise<void> {
    const current = await this.adapter.get(operationId);
    if (!current) return;
    if (!isTerminalState(current.state)) {
      console.warn('[operationQueue] refuse to drop non-terminal operation', operationId, current.state);
      return;
    }
    await this.adapter.remove(operationId);
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }
}
