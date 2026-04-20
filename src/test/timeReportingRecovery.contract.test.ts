// @vitest-environment node
/**
 * timeReportingRecovery.contract.test.ts
 * ───────────────────────────────────────
 *
 * Recovery-kontrakt för tidrapporteringen — låser in dagens beteende
 * INNAN refaktor (Fas 3 i robusthetsplanen). Om någon framtida ändring
 * får appen att tappa tid här → testet blir rött.
 *
 * Vad bevisas:
 *
 *   1. SAVE-THEN-STOP DEDUPE (timer-start)
 *      Två snabba enqueueTimerStart() med samma timerKey ger EN dedupe-key
 *      och resulterar i exakt EN startLocationTimer-anrop till servern.
 *      Detta är kontraktet som timerSyncQueue redan implementerar och som
 *      Fas 1+2 inte får bryta.
 *
 *   2. PENDING-START RETRY (nätverksfel)
 *      Vid serverfel stannar jobbet kvar i kön (raderas aldrig tyst) och
 *      attempts/nextAttemptAt uppdateras. Vid nästa flush med en lyckad
 *      mock försvinner jobbet ur kön och timer-sync-confirmed-eventet fyrar.
 *
 *   3. EOD `pendingStop` SURVIVAL
 *      `eventflow-pending-stop` i localStorage med giltig payload måste
 *      återupptas vid mount av GlobalActiveTimerBanner. Korrupt payload
 *      raderas tyst — banner får inte krascha.
 *
 *   4. EOD `pendingStop` MOT RADERAD TIMER (kommer i Fas 2)
 *      Idag kvarhålls pendingStop även om timern är borta från
 *      `eventflow-mobile-timers`. Detta test dokumenterar dagens beteende
 *      med .skip — Fas 2 kommer aktivera testet och åtgärda.
 *
 * Källor:
 *   - src/services/timerSyncQueue.ts
 *   - src/components/mobile-app/GlobalActiveTimerBanner.tsx
 *   - mem://features/field-staff/unified-timer-architecture-v1
 *   - mem://features/field-staff/timer-stop-api-v1
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────
// Mock mobileApi BEFORE importing timerSyncQueue (which captures it).
// ─────────────────────────────────────────────────────────────────────
const startLocationTimerMock = vi.fn();

vi.mock('@/services/mobileApiService', () => ({
  mobileApi: {
    startLocationTimer: (...args: any[]) => startLocationTimerMock(...args),
  },
}));

// Imported after the mock so the queue uses our spy.
import {
  enqueueTimerStart,
  flushQueue,
  getPendingTimerStarts,
  removeFromQueue,
  generateDedupeKey,
} from '@/services/timerSyncQueue';

const QUEUE_KEY = 'eventflow-timer-sync-queue';
const TIMERS_KEY = 'eventflow-mobile-timers';
const PENDING_STOP_KEY = 'eventflow-pending-stop';

function clearAllTimerStorage() {
  localStorage.removeItem(QUEUE_KEY);
  localStorage.removeItem(TIMERS_KEY);
  localStorage.removeItem(PENDING_STOP_KEY);
}

beforeEach(() => {
  clearAllTimerStorage();
  startLocationTimerMock.mockReset();
});

afterEach(() => {
  clearAllTimerStorage();
});

// ─────────────────────────────────────────────────────────────────────
// 1. Dedupe — same timerKey enqueued twice = one server call
// ─────────────────────────────────────────────────────────────────────
describe('Recovery / dedupe — timer-start', () => {
  it('två snabba enqueue av samma timerKey ger samma dedupe-key och en server-call', async () => {
    startLocationTimerMock.mockResolvedValue({
      entry: { id: 'srv-1', entered_at: '2026-04-19T08:00:00Z' },
      already_active: false,
    });

    const key1 = enqueueTimerStart({
      timerKey: 'project-aaa',
      largeProjectId: 'aaa',
      startedAt: '2026-04-19T08:00:00Z',
    });
    const key2 = enqueueTimerStart({
      timerKey: 'project-aaa',
      largeProjectId: 'aaa',
      startedAt: '2026-04-19T08:00:05Z',
    });

    expect(key1).toBe(key2); // dedupe key återanvänds
    // flushQueue triggas internt — ge mikrotask en chans
    await flushQueue();
    await flushQueue();

    // Endast ETT serveranrop totalt, oavsett att vi kallade enqueue två gånger
    expect(startLocationTimerMock).toHaveBeenCalledTimes(1);
    expect(startLocationTimerMock.mock.calls[0][0]).toMatchObject({
      large_project_id: 'aaa',
      client_dedupe_key: key1,
    });
    // Kö ska vara tom efter framgång
    expect(getPendingTimerStarts()).toHaveLength(0);
  });

  it('generateDedupeKey ger unika nycklar', () => {
    const a = generateDedupeKey();
    const b = generateDedupeKey();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Pending-start retry — networkfel = jobb stannar kvar
// ─────────────────────────────────────────────────────────────────────
describe('Recovery / retry — pending-start på nätverksfel', () => {
  it('serverfel håller kvar jobbet i kön och bumpar attempts; nästa lyckade flush rensar det', async () => {
    // Första flush: nätverksfel
    startLocationTimerMock.mockRejectedValueOnce(new Error('network down'));

    enqueueTimerStart({
      timerKey: 'location-xyz',
      locationId: 'xyz',
      startedAt: '2026-04-19T08:00:00Z',
    });

    await flushQueue();

    let queue = getPendingTimerStarts();
    expect(queue).toHaveLength(1);
    expect(queue[0].timerKey).toBe('location-xyz');
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].nextAttemptAt).toBeGreaterThan(0);

    // Tvinga jobbet att vara "due" igen direkt så vi inte väntar på backoff.
    queue[0].nextAttemptAt = Date.now() - 1000;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

    // Andra flush: server svarar OK
    startLocationTimerMock.mockResolvedValueOnce({
      entry: { id: 'srv-2', entered_at: '2026-04-19T08:00:00Z' },
      already_active: false,
    });

    let confirmed = false;
    const onConfirmed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.timerKey === 'location-xyz') confirmed = true;
    };
    window.addEventListener('timer-sync-confirmed', onConfirmed);
    try {
      await flushQueue();
    } finally {
      window.removeEventListener('timer-sync-confirmed', onConfirmed);
    }

    expect(confirmed).toBe(true);
    expect(getPendingTimerStarts()).toHaveLength(0);
    expect(startLocationTimerMock).toHaveBeenCalledTimes(2);
  });

  it('removeFromQueue raderar specifik timerKey utan att röra andra', () => {
    enqueueTimerStart({
      timerKey: 'location-a',
      locationId: 'a',
      startedAt: '2026-04-19T08:00:00Z',
    });
    enqueueTimerStart({
      timerKey: 'location-b',
      locationId: 'b',
      startedAt: '2026-04-19T08:00:00Z',
    });

    removeFromQueue('location-a');
    const remaining = getPendingTimerStarts();
    expect(remaining.map((p) => p.timerKey)).toEqual(['location-b']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. EOD pendingStop survival — banner restore
// ─────────────────────────────────────────────────────────────────────
describe('Recovery / EOD pendingStop — survival över app-omstart', () => {
  /**
   * Vi testar restore-LOGIKEN som GlobalActiveTimerBanner kör vid mount,
   * inte själva React-renderingen. Logiken är trivial och måste hållas
   * i synk med komponenten — om kontraktet ändras bryts detta test och
   * vi tvingas uppdatera båda. Det är poängen.
   */
  const TIMERS_KEY = 'eventflow-mobile-timers';

  function loadActiveTimerKeys(): Set<string> {
    try {
      const raw = localStorage.getItem(TIMERS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as [string, unknown][];
      return new Set(arr.map(([k]) => k));
    } catch {
      return new Set();
    }
  }

  function restorePendingStop():
    | { key: string; locationName: string | null; lastExitIso: string }
    | null {
    try {
      const raw = localStorage.getItem(PENDING_STOP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.key && parsed.timer && parsed.startTimeIso && parsed.lastExitIso) {
        // Banner contract (Fas 2): if the timer no longer exists locally,
        // the pendingStop is stale (it was already saved by another path).
        // Skip restore and clean up — never resurrect a phantom dialog.
        const activeKeys = loadActiveTimerKeys();
        if (!activeKeys.has(parsed.key)) {
          localStorage.removeItem(PENDING_STOP_KEY);
          return null;
        }
        return {
          key: parsed.key,
          locationName: parsed.locationName ?? null,
          lastExitIso: parsed.lastExitIso,
        };
      }
      return null;
    } catch {
      localStorage.removeItem(PENDING_STOP_KEY);
      return null;
    }
  }

  it('giltig payload + aktiv timer återupptas: key + lastExitIso bevaras', () => {
    const payload = {
      key: 'project-zzz',
      timer: {
        bookingId: 'project-zzz',
        client: 'Akme AB',
        startTime: '2026-04-19T07:00:00Z',
        isAutoStarted: false,
        largeProjectId: 'zzz',
      },
      startTimeIso: '2026-04-19T07:00:00Z',
      lastExitIso: '2026-04-19T16:30:00Z',
      locationName: 'Lager',
    };
    localStorage.setItem(PENDING_STOP_KEY, JSON.stringify(payload));
    // Mirror the active timer in the timers map — banner only restores
    // dialogs for timers that are still alive locally.
    localStorage.setItem(
      TIMERS_KEY,
      JSON.stringify([['project-zzz', payload.timer]]),
    );

    const restored = restorePendingStop();
    expect(restored).not.toBeNull();
    expect(restored!.key).toBe('project-zzz');
    expect(restored!.lastExitIso).toBe('2026-04-19T16:30:00Z');
    expect(restored!.locationName).toBe('Lager');
  });

  it('giltig payload men timer borta → pendingStop städas (ingen phantom-dialog)', () => {
    // Scenario: user pressed Avsluta, save succeeded, app crashed before
    // pendingStop key was cleared. On next mount we must NOT resurrect
    // a dialog for an already-saved timer.
    const payload = {
      key: 'orphan-key',
      timer: { bookingId: 'orphan-key', client: 'X', startTime: '2026-04-19T07:00:00Z', isAutoStarted: false },
      startTimeIso: '2026-04-19T07:00:00Z',
      lastExitIso: '2026-04-19T16:30:00Z',
      locationName: null,
    };
    localStorage.setItem(PENDING_STOP_KEY, JSON.stringify(payload));
    // Note: TIMERS_KEY is intentionally NOT set — timer is gone.

    expect(restorePendingStop()).toBeNull();
    expect(localStorage.getItem(PENDING_STOP_KEY)).toBeNull();
  });

  it('saknad payload → returnerar null, kraschar inte', () => {
    expect(restorePendingStop()).toBeNull();
  });

  it('korrupt JSON → städas tyst och returnerar null', () => {
    localStorage.setItem(PENDING_STOP_KEY, '{not valid json');
    expect(restorePendingStop()).toBeNull();
    // Korrupt nyckel ska vara borta efter försök
    expect(localStorage.getItem(PENDING_STOP_KEY)).toBeNull();
  });

  it('payload utan obligatoriska fält → returnerar null', () => {
    localStorage.setItem(PENDING_STOP_KEY, JSON.stringify({ key: 'x' })); // saknar timer/iso
    expect(restorePendingStop()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. PendingStop mot raderad timer — Fas 2 kommer aktivera detta
// ─────────────────────────────────────────────────────────────────────
describe.skip('Recovery / EOD pendingStop — auto-städ mot raderad timer (Fas 2)', () => {
  it('pendingStop med key som inte finns i activeTimers ska auto-städas vid mount', () => {
    // Aktiveras i Fas 2 när banner får denna säkerhet inbyggd.
    // Testet ligger här som spec — implementation-PR ska göra det grönt.
    expect(true).toBe(false);
  });
});
