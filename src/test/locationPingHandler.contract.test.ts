/**
 * Contract test for src/services/locationPingHandler.ts
 *
 * Locks the contract for "server pings the phone → phone uploads a fresh
 * GPS sample".
 *
 * Rules under test:
 *   1. Ignores pushes whose data.notification_type !== "location_ping".
 *   2. Ignores pushes with no data at all.
 *   3. On a real ping, calls the GPS resolver and enqueues a heartbeat
 *      point with a stable id derived from data.requested_at.
 *   4. If GPS resolution fails, the handler reports gps-failed and does
 *      NOT enqueue anything (no fake/zero coords).
 *   5. Always triggers a flush after a successful enqueue so the point
 *      reaches the server promptly.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleLocationPingPush } from '@/services/locationPingHandler';

function makeDeps(overrides: Partial<Parameters<typeof handleLocationPingPush>[1]> = {}) {
  const enqueue = vi.fn().mockReturnValue('queued-id');
  const flush = vi.fn().mockResolvedValue(undefined);
  const getCurrentPosition = vi.fn().mockResolvedValue({
    latitude: 59.33, longitude: 18.06, accuracy: 12, speed: 0,
  });
  return {
    deps: { enqueue, flush, getCurrentPosition, ...overrides },
    enqueue, flush, getCurrentPosition,
  };
}

describe('handleLocationPingPush — gating', () => {
  it('ignores pushes with no data', async () => {
    const { deps, enqueue, flush, getCurrentPosition } = makeDeps();
    const r = await handleLocationPingPush({}, deps as any);
    expect(r).toEqual({ handled: false, reason: 'missing-data' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('ignores pushes with a different notification_type', async () => {
    const { deps, enqueue, getCurrentPosition } = makeDeps();
    const r = await handleLocationPingPush(
      { data: { notification_type: 'message', body: 'hi' } },
      deps as any,
    );
    expect(r).toEqual({ handled: false, reason: 'wrong-type' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('handleLocationPingPush — happy path', () => {
  it('captures GPS, enqueues a heartbeat point with stable id, flushes', async () => {
    const { deps, enqueue, flush, getCurrentPosition } = makeDeps();
    const r = await handleLocationPingPush(
      {
        data: {
          notification_type: 'location_ping',
          reason: 'admin_request',
          requested_at: '2026-04-25T10:30:00.000Z',
        },
      },
      deps as any,
    );

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
    const arg = enqueue.mock.calls[0][0];
    expect(arg.latitude).toBe(59.33);
    expect(arg.longitude).toBe(18.06);
    expect(arg.source).toBe('heartbeat');
    expect(arg.id).toBe('ping-2026-04-25T10:30:00.000Z');
    expect(flush).toHaveBeenCalled();
    expect(r.handled).toBe(true);
    expect(r.reason).toBe('enqueued');
    expect(r.pointId).toBe('queued-id');
  });

  it('omits id when requested_at is missing (lets queue generate one)', async () => {
    const { deps, enqueue } = makeDeps();
    await handleLocationPingPush(
      { data: { notification_type: 'location_ping' } },
      deps as any,
    );
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0][0].id).toBeUndefined();
  });
});

describe('handleLocationPingPush — failure modes', () => {
  it('does not enqueue when GPS fails — reports gps-failed', async () => {
    const { deps, enqueue, flush } = makeDeps({
      getCurrentPosition: vi.fn().mockRejectedValue(new Error('denied')),
    });
    const r = await handleLocationPingPush(
      { data: { notification_type: 'location_ping' } },
      deps as any,
    );
    expect(r).toEqual({ handled: true, reason: 'gps-failed' });
    expect(enqueue).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
});
