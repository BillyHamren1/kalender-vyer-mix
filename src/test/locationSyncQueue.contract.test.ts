/**
 * Contract test for src/services/locationSyncQueue.ts
 *
 * Locks the rules that make GPS pinging trustworthy:
 *   1. enqueue → persisted in localStorage immediately
 *   2. duplicate samples (same id, or same lat/lng/source within 1s) are coalesced
 *   3. successful upload removes points; rejected points back off and retry
 *   4. whole-chunk network failure marks points failed + bumps attempts
 *   5. clearLocationQueue() wipes everything (logout safety)
 *
 * The queue is the single source of truth for "did the phone actually send a
 * GPS point" — it MUST keep working even when the network is flaky.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the network call that flushLocationQueue makes.
const uploadLocationBatch = vi.fn();
vi.mock('@/services/mobileApiService', () => ({
  mobileApi: {
    get uploadLocationBatch() { return uploadLocationBatch; },
  },
}));

// Fresh module each test so the in-module `flushing` flag and timeouts reset.
async function freshQueue() {
  vi.resetModules();
  return await import('@/services/locationSyncQueue');
}

beforeEach(() => {
  localStorage.clear();
  uploadLocationBatch.mockReset();
  // Default: navigator.onLine === true
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('locationSyncQueue — persistence', () => {
  it('enqueue persists the point to localStorage', async () => {
    const q = await freshQueue();
    uploadLocationBatch.mockResolvedValue({ accepted: [], rejected: [] });

    const id = q.enqueueLocationPoint({
      latitude: 59.33, longitude: 18.06, source: 'manual',
    });

    const raw = localStorage.getItem('eventflow-location-sync-queue');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe(id);
    expect(parsed[0].source).toBe('manual');
  });

  it('duplicate id is coalesced', async () => {
    const q = await freshQueue();
    uploadLocationBatch.mockResolvedValue({ accepted: [], rejected: [] });

    const id1 = q.enqueueLocationPoint({
      id: 'fixed-id', latitude: 59.33, longitude: 18.06, source: 'heartbeat',
    });
    const id2 = q.enqueueLocationPoint({
      id: 'fixed-id', latitude: 59.99, longitude: 18.99, source: 'heartbeat',
    });

    expect(id1).toBe('fixed-id');
    expect(id2).toBe('fixed-id');
    expect(q.getPendingLocationPoints().length).toBe(1);
  });

  it('same lat/lng/source within the same second is coalesced', async () => {
    const q = await freshQueue();
    uploadLocationBatch.mockResolvedValue({ accepted: [], rejected: [] });

    const at = '2026-04-25T10:00:00.000Z';
    q.enqueueLocationPoint({ latitude: 59.33, longitude: 18.06, source: 'background', recordedAt: at });
    q.enqueueLocationPoint({ latitude: 59.33, longitude: 18.06, source: 'background', recordedAt: at });

    expect(q.getPendingLocationPoints().length).toBe(1);
  });
});

describe('locationSyncQueue — flush behaviour', () => {
  it('removes points the server accepted', async () => {
    const q = await freshQueue();
    uploadLocationBatch.mockImplementation(async (points: any[]) => ({
      accepted: points.map(p => p.id),
      rejected: [],
    }));

    q.enqueueLocationPoint({ latitude: 59.33, longitude: 18.06, source: 'manual' });
    q.enqueueLocationPoint({ latitude: 59.34, longitude: 18.07, source: 'manual' });
    // Enqueue triggar INTE flush — vi måste flusha explicit för testet.
    await q.flushLocationQueue();


    expect(uploadLocationBatch).toHaveBeenCalled();
    expect(q.getPendingLocationPoints().length).toBe(0);
  });

  it('rejected points get attempts++ and a future nextAttemptAt', async () => {
    const q = await freshQueue();
    uploadLocationBatch.mockImplementation(async (points: any[]) => ({
      accepted: [],
      rejected: points.map(p => ({ id: p.id, reason: 'bad' })),
    }));

    const id = q.enqueueLocationPoint({ latitude: 59.33, longitude: 18.06, source: 'manual' });
    const before = Date.now();
    await q.flushLocationQueue();

    const remaining = q.getPendingLocationPoints();
    expect(remaining.length).toBe(1);
    const point = remaining.find(p => p.id === id)!;
    expect(point.status).toBe('failed');
    expect(point.attempts).toBeGreaterThanOrEqual(1);
    expect(point.nextAttemptAt).toBeGreaterThanOrEqual(before);
  });

  it('whole-chunk network failure backs off without losing points', async () => {
    const q = await freshQueue();
    uploadLocationBatch.mockRejectedValue(new Error('network down'));

    q.enqueueLocationPoint({ latitude: 59.33, longitude: 18.06, source: 'manual' });
    await q.flushLocationQueue();

    const remaining = q.getPendingLocationPoints();
    expect(remaining.length).toBe(1);
    expect(remaining[0].status).toBe('failed');
    expect(remaining[0].attempts).toBe(1);
  });

  it('skips upload when offline', async () => {
    const q = await freshQueue();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    uploadLocationBatch.mockResolvedValue({ accepted: [], rejected: [] });

    q.enqueueLocationPoint({ latitude: 59.33, longitude: 18.06, source: 'manual' });
    await q.flushLocationQueue();

    expect(uploadLocationBatch).not.toHaveBeenCalled();
    expect(q.getPendingLocationPoints().length).toBe(1);
  });
});

describe('locationSyncQueue — logout safety', () => {
  it('clearLocationQueue wipes all pending points', async () => {
    const q = await freshQueue();
    uploadLocationBatch.mockResolvedValue({ accepted: [], rejected: [] });

    q.enqueueLocationPoint({ latitude: 59.33, longitude: 18.06, source: 'manual' });
    q.enqueueLocationPoint({ latitude: 59.34, longitude: 18.07, source: 'manual' });
    expect(q.getPendingLocationPoints().length).toBe(2);

    q.clearLocationQueue();
    expect(q.getPendingLocationPoints().length).toBe(0);
    expect(localStorage.getItem('eventflow-location-sync-queue')).toBe('[]');
  });
});
