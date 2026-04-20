// @vitest-environment node
/**
 * timeReportingStartHardening.contract.test.ts
 * ────────────────────────────────────────────
 *
 * Härdnings-kontrakt för Starta dag (PROMPT 2). Låser fast den robusthet
 * vi måste kunna lita på i verklig daglig drift:
 *
 *   1. STARTA DAG → korrekt server-state (dedupe-key + payload).
 *      Redan låst i timeReportingRecovery.contract.test.ts; här lägger vi
 *      till varianten med booking_id och large_project_id.
 *
 *   2. DUBBELTRYCK → en server-call.
 *      Två snabba enqueueTimerStart för samma timerKey ger en server-call
 *      även om båda har olika startedAt — dedupe sker på timerKey.
 *
 *   3. OFFLINE → start ligger kvar i kön och syncar senare.
 *      Redan kontraktstestat i recovery-suiten; här verifierar vi att
 *      kön EJ tappar payload-fält (locationId/largeProjectId/bookingId)
 *      mellan crash + restart.
 *
 *   4. LOGOUT → all timer-state torkas (queue + active timers + sidecar).
 *      KRITISK: utan detta kan user A:s pending start fyra mot user B:s
 *      session direkt efter login → korrupt cross-user data.
 *
 *   5. LOGIN → defensive cleanup innan ny session får några timers.
 *
 *   6. STORAGE-SUSPEND-SAFE: corrupt JSON i någon av nycklarna får inte
 *      krascha clearLocalTimerSession / clearTimerSyncQueue.
 *
 * Källor:
 *   - src/services/timerSyncQueue.ts (clearTimerSyncQueue)
 *   - src/hooks/useGeofencing.ts (clearLocalTimerSession)
 *   - src/contexts/MobileAuthContext.tsx (login/logout wiring)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const startLocationTimerMock = vi.fn();

vi.mock('@/services/mobileApiService', () => ({
  mobileApi: {
    startLocationTimer: (...args: any[]) => startLocationTimerMock(...args),
  },
}));

import {
  enqueueTimerStart,
  flushQueue,
  getPendingTimerStarts,
  clearTimerSyncQueue,
} from '@/services/timerSyncQueue';
import { clearLocalTimerSession } from '@/hooks/useGeofencing';

const QUEUE_KEY = 'eventflow-timer-sync-queue';
const TIMERS_KEY = 'eventflow-mobile-timers';
const PENDING_STOP_KEY = 'eventflow-pending-stop';
const PENDING_ARRIVALS_KEY = 'eventflow-pending-arrivals';
const GEOFENCE_TARGETS_KEY = 'eventflow-geofence-targets';

function wipeAll() {
  for (const k of [
    QUEUE_KEY,
    TIMERS_KEY,
    PENDING_STOP_KEY,
    PENDING_ARRIVALS_KEY,
    GEOFENCE_TARGETS_KEY,
  ]) {
    localStorage.removeItem(k);
  }
}

beforeEach(() => {
  wipeAll();
  startLocationTimerMock.mockReset();
});

afterEach(() => {
  wipeAll();
});

// ─────────────────────────────────────────────────────────────────────
// 1+2. Dedupe — booking, project, location varianter
// ─────────────────────────────────────────────────────────────────────
describe('Start hardening / payload + dedupe', () => {
  it('booking-start: payload skickas exakt en gång även vid dubbeltryck', async () => {
    startLocationTimerMock.mockResolvedValue({
      entry: { id: 'srv-b1', entered_at: '2026-04-19T08:00:00Z' },
      already_active: false,
    });

    enqueueTimerStart({
      timerKey: 'booking-uuid-1',
      bookingId: 'booking-uuid-1',
      startedAt: '2026-04-19T08:00:00Z',
    });
    enqueueTimerStart({
      timerKey: 'booking-uuid-1',
      bookingId: 'booking-uuid-1',
      // Olika startedAt — får inte göra ett andra anrop:
      startedAt: '2026-04-19T08:00:09Z',
    });

    await flushQueue();
    await flushQueue();

    expect(startLocationTimerMock).toHaveBeenCalledTimes(1);
    const payload = startLocationTimerMock.mock.calls[0][0];
    expect(payload.booking_id).toBe('booking-uuid-1');
    expect(payload.client_dedupe_key).toBeTruthy();
    expect(getPendingTimerStarts()).toHaveLength(0);
  });

  it('location-start: korrekt location_id i payload', async () => {
    startLocationTimerMock.mockResolvedValue({
      entry: { id: 'srv-l1', entered_at: '2026-04-19T08:00:00Z' },
    });
    enqueueTimerStart({
      timerKey: 'location-lager-1',
      locationId: 'lager-1',
      startedAt: '2026-04-19T08:00:00Z',
    });
    await flushQueue();
    expect(startLocationTimerMock.mock.calls[0][0].location_id).toBe('lager-1');
    expect(startLocationTimerMock.mock.calls[0][0].booking_id).toBeUndefined();
  });

  it('project-start: korrekt large_project_id i payload', async () => {
    startLocationTimerMock.mockResolvedValue({
      entry: { id: 'srv-p1', entered_at: '2026-04-19T08:00:00Z' },
    });
    enqueueTimerStart({
      timerKey: 'project-big-1',
      largeProjectId: 'big-1',
      startedAt: '2026-04-19T08:00:00Z',
    });
    await flushQueue();
    const p = startLocationTimerMock.mock.calls[0][0];
    expect(p.large_project_id).toBe('big-1');
    expect(p.booking_id).toBeUndefined();
    expect(p.location_id).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Offline survival — payload-fält bevaras i localStorage
// ─────────────────────────────────────────────────────────────────────
describe('Start hardening / offline survival', () => {
  it('payload-fält (locationId, bookingId, largeProjectId, taskId) överlever en simulerad crash', async () => {
    startLocationTimerMock.mockRejectedValue(new Error('offline'));

    enqueueTimerStart({
      timerKey: 'project-survive-1',
      largeProjectId: 'survive-1',
      taskId: 'task-xyz',
      startedAt: '2026-04-19T08:00:00Z',
    });
    await flushQueue(); // misslyckas, jobbet stannar

    // Simulera crash: läs rå localStorage som om appen precis bootat
    const raw = localStorage.getItem(QUEUE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].largeProjectId).toBe('survive-1');
    expect(parsed[0].taskId).toBe('task-xyz');
    expect(parsed[0].clientDedupeKey).toBeTruthy();

    // Vid nästa lyckade flush ska payload återanvändas exakt
    startLocationTimerMock.mockReset();
    startLocationTimerMock.mockResolvedValue({
      entry: { id: 'srv-recovered', entered_at: '2026-04-19T08:00:00Z' },
    });
    parsed[0].nextAttemptAt = Date.now() - 1000;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(parsed));

    await flushQueue();
    expect(startLocationTimerMock).toHaveBeenCalledTimes(1);
    expect(startLocationTimerMock.mock.calls[0][0]).toMatchObject({
      large_project_id: 'survive-1',
      task_id: 'task-xyz',
      client_dedupe_key: parsed[0].clientDedupeKey,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4+5. Logout/login cleanup — cross-user safety
// ─────────────────────────────────────────────────────────────────────
describe('Start hardening / logout-login cleanup', () => {
  it('clearTimerSyncQueue() raderar alla pending starter', () => {
    enqueueTimerStart({ timerKey: 'a', locationId: 'a', startedAt: '2026-04-19T08:00:00Z' });
    enqueueTimerStart({ timerKey: 'b', bookingId: 'b', startedAt: '2026-04-19T08:00:00Z' });
    expect(getPendingTimerStarts()).toHaveLength(2);

    clearTimerSyncQueue();
    expect(getPendingTimerStarts()).toHaveLength(0);
    expect(localStorage.getItem(QUEUE_KEY)).toBe('[]');
  });

  it('clearLocalTimerSession() raderar timer-cache + sidecar (pendingStop, pending-arrivals, geofence-targets)', () => {
    localStorage.setItem(TIMERS_KEY, JSON.stringify([['k', { client: 'X', startTime: '2026-04-19T08:00:00Z' }]]));
    localStorage.setItem(PENDING_STOP_KEY, JSON.stringify({ key: 'k' }));
    localStorage.setItem(PENDING_ARRIVALS_KEY, JSON.stringify([{ key: 'k', name: 'Lager' }]));
    localStorage.setItem(GEOFENCE_TARGETS_KEY, JSON.stringify([{ key: 'k' }]));

    clearLocalTimerSession();

    expect(localStorage.getItem(TIMERS_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_STOP_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_ARRIVALS_KEY)).toBeNull();
    expect(localStorage.getItem(GEOFENCE_TARGETS_KEY)).toBeNull();
  });

  it('clearLocalTimerSession() emitar timer-state-changed så banner/hook re-läser direkt', () => {
    localStorage.setItem(TIMERS_KEY, JSON.stringify([['k', { client: 'X' }]]));
    let fired = false;
    const onChange = () => { fired = true; };
    window.addEventListener('timer-state-changed', onChange);
    try {
      clearLocalTimerSession();
    } finally {
      window.removeEventListener('timer-state-changed', onChange);
    }
    expect(fired).toBe(true);
  });

  it('logout-pattern: clearTimerSyncQueue + clearLocalTimerSession lämnar ingen rest', () => {
    // User A gör en start men servern hänger
    enqueueTimerStart({
      timerKey: 'project-userA',
      largeProjectId: 'userA',
      startedAt: '2026-04-19T08:00:00Z',
    });
    localStorage.setItem(TIMERS_KEY, JSON.stringify([
      ['project-userA', { client: 'A:s projekt', startTime: '2026-04-19T08:00:00Z', pendingSync: true }],
    ]));

    // User A loggar ut
    clearTimerSyncQueue();
    clearLocalTimerSession();

    // Inget får läcka till user B
    expect(getPendingTimerStarts()).toHaveLength(0);
    expect(localStorage.getItem(TIMERS_KEY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Storage-suspend-safety — corrupt JSON får inte krascha cleanup
// ─────────────────────────────────────────────────────────────────────
describe('Start hardening / storage robustness', () => {
  it('clearTimerSyncQueue och clearLocalTimerSession kraschar inte vid korrupt JSON', () => {
    localStorage.setItem(QUEUE_KEY, '{not valid json');
    localStorage.setItem(TIMERS_KEY, '%%%');
    localStorage.setItem(PENDING_STOP_KEY, 'null-but-bad');

    expect(() => clearTimerSyncQueue()).not.toThrow();
    expect(() => clearLocalTimerSession()).not.toThrow();

    // Allt rensat
    expect(localStorage.getItem(TIMERS_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_STOP_KEY)).toBeNull();
  });
});
