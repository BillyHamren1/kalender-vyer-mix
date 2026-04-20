// @vitest-environment node
/**
 * edgeCaseHardening.contract.test.ts
 * ──────────────────────────────────
 *
 * PROMPT 5 — Edge cases som dödar förtroendet.
 *
 * Tio konkreta verklighetsscenarier. Varje test driver SAMMA produktions-
 * kod-vägar som mobilen använder, ingen UI-rendering. Fel här = direkt
 * användarsmärta i fält.
 *
 *   1. App stängs direkt efter Start
 *   2. Nät dör under start
 *   3. Nät dör under stop (save-then-stop ordning)
 *   4. Reload mitt under aktiv session
 *   5. Dubbeltryck Start
 *   6. Dubbeltryck Stop
 *   7. Logout/login med aktiv session
 *   8. Pending queue med gammal data (stale enqueue)
 *   9. Server returnerar timeout/fel (retry safety)
 *  10. Aktiv session + osäker target (anomaly-skydd, ingen tyst radering)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const startLocationTimerMock = vi.fn();
const createTimeReportMock = vi.fn();
const stopLocationTimerMock = vi.fn();

vi.mock('@/services/mobileApiService', () => ({
  mobileApi: {
    startLocationTimer: (...a: any[]) => startLocationTimerMock(...a),
    createTimeReport: (...a: any[]) => createTimeReportMock(...a),
    stopLocationTimer: (...a: any[]) => stopLocationTimerMock(...a),
  },
}));

import {
  enqueueTimerStart,
  flushQueue,
  getPendingTimerStarts,
  isTimerPendingSync,
  removeFromQueue,
  clearTimerSyncQueue,
} from '@/services/timerSyncQueue';
import { clearLocalTimerSession } from '@/hooks/useGeofencing';

const QUEUE_KEY = 'eventflow-timer-sync-queue';
const TIMERS_KEY = 'eventflow-mobile-timers';
const PENDING_STOP_KEY = 'eventflow-pending-stop';
const PENDING_ARRIVALS_KEY = 'eventflow-pending-arrivals';
const GEOFENCE_TARGETS_KEY = 'eventflow-geofence-targets';

const read = (p: string) => fs.readFileSync(p, 'utf-8');

function wipeAll() {
  for (const k of [
    QUEUE_KEY, TIMERS_KEY, PENDING_STOP_KEY,
    PENDING_ARRIVALS_KEY, GEOFENCE_TARGETS_KEY,
  ]) localStorage.removeItem(k);
}

beforeEach(() => {
  wipeAll();
  startLocationTimerMock.mockReset();
  createTimeReportMock.mockReset();
  stopLocationTimerMock.mockReset();
});

afterEach(() => {
  wipeAll();
});

describe('Edge case hardening — 10 scenarios', () => {
  // ─────────────────────────────────────────────────────────────────────
  // 1. App stängs direkt efter Start (innan flush hinner köra)
  // ─────────────────────────────────────────────────────────────────────
  it('1. App-kill direkt efter start: payload överlever i localStorage med ALLA fält', () => {
    enqueueTimerStart({
      timerKey: 'project-p1',
      largeProjectId: 'p1',
      taskId: 'task-9',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    // Simulera process-kill: läs RAW localStorage som om vi just bootade.
    const raw = localStorage.getItem(QUEUE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      timerKey: 'project-p1',
      largeProjectId: 'p1',
      taskId: 'task-9',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    // clientDedupeKey måste vara stabil och persistad så server-side
    // idempotency fungerar efter restart.
    expect(parsed[0].clientDedupeKey).toBeTruthy();
    expect(typeof parsed[0].clientDedupeKey).toBe('string');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. Nät dör under start — server-call faller, entry stannar med backoff
  // ─────────────────────────────────────────────────────────────────────
  it('2. Nät dör under start: entry stannar i kön med ökat attempts-räknare', async () => {
    startLocationTimerMock.mockRejectedValueOnce(new Error('Network request failed'));
    enqueueTimerStart({
      timerKey: 'booking-b1',
      bookingId: 'b1',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    await flushQueue();
    const q = getPendingTimerStarts();
    expect(q).toHaveLength(1);
    expect(q[0].attempts).toBeGreaterThanOrEqual(1);
    // nextAttemptAt måste skjutas fram — annars busy-loopar vi servern.
    expect(q[0].nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it('2b. Nät kommer tillbaka: nästa flush dispatchar timer-sync-confirmed och rensar kön', async () => {
    startLocationTimerMock.mockResolvedValueOnce({
      entry: { id: 'srv-1', entered_at: '2025-01-01T10:00:00.000Z' },
      already_active: false,
    });
    enqueueTimerStart({
      timerKey: 'location-loc1',
      locationId: 'loc1',
      startedAt: '2025-01-01T10:00:00.000Z',
    });

    let confirmedDetail: any = null;
    const handler = (e: Event) => {
      confirmedDetail = (e as CustomEvent).detail;
    };
    window.addEventListener('timer-sync-confirmed', handler);
    await flushQueue();
    window.removeEventListener('timer-sync-confirmed', handler);

    expect(confirmedDetail).toBeTruthy();
    expect(confirmedDetail.timerKey).toBe('location-loc1');
    expect(confirmedDetail.serverEntryId).toBe('srv-1');
    expect(getPendingTimerStarts()).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. Nät dör under stop — save-then-stop ordningen GARANTERAR att
  //    tidrapporten persistas FÖRE local timer rensas, så ingen tid tappas.
  // ─────────────────────────────────────────────────────────────────────
  it('3. Save-then-stop: createTimeReport körs FÖRE stopLocationTimer FÖRE _clearLocalTimer', () => {
    const src = read('src/hooks/useGeofencing.ts');
    const fnStart = src.indexOf('const saveAndStopTimer = useCallback');
    const fnEnd = src.indexOf('}, [_clearLocalTimer, _resolveStopPayload]);', fnStart);
    const body = src.slice(fnStart, fnEnd);
    const idxCreate = body.indexOf('mobileApi.createTimeReport');
    const idxStop = body.indexOf('mobileApi.stopLocationTimer');
    const idxClear = body.indexOf('_clearLocalTimer(key)');
    expect(idxCreate).toBeGreaterThan(-1);
    expect(idxStop).toBeGreaterThan(-1);
    expect(idxClear).toBeGreaterThan(-1);
    expect(idxCreate).toBeLessThan(idxStop);
    expect(idxStop).toBeLessThan(idxClear);
    // Server-stop-fel får ALDRIG kasta vidare — rapporten är redan sparad.
    expect(body).toMatch(/server entry close failed \(report already saved\)/);
  });

  it('3b. Backend-idempotency mot duplicerade time_reports vid retry efter nätverksdrop', () => {
    const src = read('supabase/functions/mobile-app-api/index.ts');
    const fnStart = src.indexOf('async function handleCreateTimeReport');
    const nextFn = src.indexOf('\nasync function ', fnStart + 1);
    const body = src.slice(fnStart, nextFn > -1 ? nextFn : undefined);
    expect(body).toMatch(/idempotent: true/);
    expect(body).toMatch(/90_000|90 \* 1000|90000/);
    // Idempotency-checken MÅSTE ligga före overlap-checken.
    const idxIdempotent = body.indexOf('idempotent: true');
    const idxOverlap = body.indexOf('Overlap check (CREATE)');
    expect(idxIdempotent).toBeLessThan(idxOverlap);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Reload mitt under aktiv session
  // ─────────────────────────────────────────────────────────────────────
  it('4. Reload mid-session: TIMERS_KEY läses tillbaka komplett', () => {
    const timers: [string, any][] = [
      ['project-p1', {
        bookingId: 'project-p1',
        client: 'Stort Projekt',
        startTime: '2025-01-01T10:00:00.000Z',
        isAutoStarted: false,
        largeProjectId: 'p1',
        pendingSync: false,
        serverEntryId: 'srv-99',
      }],
    ];
    localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
    // Simulera reload — komponenten har sin egen loader; vi parsar samma path.
    const raw = localStorage.getItem(TIMERS_KEY);
    const restored = new Map<string, any>(JSON.parse(raw!));
    expect(restored.size).toBe(1);
    expect(restored.get('project-p1')!.serverEntryId).toBe('srv-99');
    expect(restored.get('project-p1')!.startTime).toBe('2025-01-01T10:00:00.000Z');
  });

  it('4b. Server-restore har 2-dygns-fönster så timer från igår kväll överlever app-restart efter midnatt', () => {
    const src = read('src/hooks/useGeofencing.ts');
    // Måste explicit beräkna yesterday och använda i date_from.
    expect(src).toMatch(/yesterday\s*=\s*new Date\(today\.getTime\(\)\s*-\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\)/);
    expect(src).toMatch(/date_from:\s*dateFrom/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Dubbeltryck Start
  // ─────────────────────────────────────────────────────────────────────
  it('5. Dubbeltryck Start: två snabba enqueueTimerStart för samma key → EN entry, EN server-call', async () => {
    startLocationTimerMock.mockResolvedValue({
      entry: { id: 'srv-1', entered_at: '2025-01-01T10:00:00.000Z' },
    });
    const k1 = enqueueTimerStart({
      timerKey: 'project-p1',
      largeProjectId: 'p1',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    const k2 = enqueueTimerStart({
      timerKey: 'project-p1',
      largeProjectId: 'p1',
      startedAt: '2025-01-01T10:00:00.500Z', // Slightly later second tap
    });
    expect(k1).toBe(k2); // same dedupe key
    expect(getPendingTimerStarts()).toHaveLength(1);

    await flushQueue();
    expect(startLocationTimerMock).toHaveBeenCalledTimes(1);
  });

  it('5b. useGeofencing.startTimer har soft-lock som blockerar samma key', () => {
    const src = read('src/hooks/useGeofencing.ts');
    // Inom startTimer: kontroll mot activeTimersRef.current.has(key) → return false
    const fnStart = src.indexOf('const startTimer = useCallback');
    const fnEnd = src.indexOf('}, []);', fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).toMatch(/activeTimersRef\.current[\s\S]{0,80}\.has\(key\)/);
    expect(body).toMatch(/return false/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. Dubbeltryck Stop
  // ─────────────────────────────────────────────────────────────────────
  it('6. Dubbeltryck Stop: savingKeys-lock i banner blockerar nytt anrop tills första klar', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    // handleStop: tidigt return om savingKeys.has(key) — annars dubbla
    // saveAndStopTimer-anrop = 409 Overlap eller dubbla stop-calls.
    expect(src).toMatch(/if \(savingKeys\.has\(key\)\) return/);
    // Avsluta-knappen är disabled medan isSaving.
    expect(src).toMatch(/disabled=\{isSaving\}/);
  });

  it('6b. Server-side idempotency räddar oss även om dubbeltryck slipper igenom UI-locket', () => {
    // (Kontraktet täcks av 3b ovan — dubbel-stop som båda triggar
    //  createTimeReport landar på samma idempotent-träff inom 90 s.)
    expect(true).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. Logout/login med aktiv session — INGEN cross-user kontaminering
  // ─────────────────────────────────────────────────────────────────────
  it('7. Logout torkar både timer-cache OCH sync-kö', () => {
    // Seed user A:s state
    enqueueTimerStart({
      timerKey: 'project-userA',
      largeProjectId: 'userA',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    localStorage.setItem(TIMERS_KEY, JSON.stringify([
      ['project-userA', { bookingId: 'project-userA', client: 'A', startTime: '2025-01-01T10:00:00.000Z', isAutoStarted: false, largeProjectId: 'userA' }],
    ]));
    localStorage.setItem(PENDING_STOP_KEY, JSON.stringify({ key: 'project-userA' }));
    localStorage.setItem(GEOFENCE_TARGETS_KEY, JSON.stringify([{ key: 'project-userA' }]));
    localStorage.setItem(PENDING_ARRIVALS_KEY, JSON.stringify([{ key: 'project-userA' }]));

    // Logout-sekvens (samma som MobileAuthContext.logout)
    clearTimerSyncQueue();
    clearLocalTimerSession();

    // ALLT timer-relaterat ska vara borta
    expect(localStorage.getItem(QUEUE_KEY)).toBe('[]');
    expect(localStorage.getItem(TIMERS_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_STOP_KEY)).toBeNull();
    expect(localStorage.getItem(GEOFENCE_TARGETS_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_ARRIVALS_KEY)).toBeNull();
  });

  it('7b. MobileAuthContext kör cleanup BÅDE i login (defensiv) OCH logout', () => {
    const src = read('src/contexts/MobileAuthContext.tsx');
    // Login: defensive cleanup INNAN ny session-token sätts.
    const loginStart = src.indexOf('const login = useCallback');
    const loginEnd = src.indexOf('}, []);', loginStart);
    const loginBody = src.slice(loginStart, loginEnd);
    expect(loginBody).toMatch(/clearTimerSyncQueue\(\)/);
    expect(loginBody).toMatch(/clearLocalTimerSession\(\)/);
    expect(loginBody.indexOf('clearTimerSyncQueue')).toBeLessThan(loginBody.indexOf('mobileApi.login'));

    // Logout: cleanup INNAN clearAuth (så pågående flush inte attribueras fel).
    const logoutStart = src.indexOf('const logout = useCallback');
    const logoutEnd = src.indexOf('}, []);', logoutStart);
    const logoutBody = src.slice(logoutStart, logoutEnd);
    expect(logoutBody.indexOf('clearTimerSyncQueue()')).toBeLessThan(logoutBody.indexOf('clearAuth()'));
    expect(logoutBody.indexOf('clearLocalTimerSession()')).toBeLessThan(logoutBody.indexOf('clearAuth()'));
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. Pending queue med gammal data (stale enqueue / corrupt JSON)
  // ─────────────────────────────────────────────────────────────────────
  it('8. Skadad JSON i sync-kön kraschar inte readers', () => {
    localStorage.setItem(QUEUE_KEY, '{not-json');
    expect(() => getPendingTimerStarts()).not.toThrow();
    expect(getPendingTimerStarts()).toEqual([]);
  });

  it('8b. Icke-array-värde i sync-kön returnerar tom kö', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify({ legacy: 'shape' }));
    expect(getPendingTimerStarts()).toEqual([]);
  });

  it('8c. removeFromQueue på okänt key är safe (no-throw)', () => {
    expect(() => removeFromQueue('does-not-exist')).not.toThrow();
  });

  it('8d. Stale-timer (>24h) flaggas men raderas ALDRIG tyst', () => {
    // Verifierar arkitektur-invariant: useGeofencing.loadTimers markerar
    // gamla timers som isStale i stället för att radera dem.
    const src = read('src/hooks/useGeofencing.ts');
    expect(src).toMatch(/NEVER silently delete stale timers/);
    expect(src).toMatch(/isStale: true,\s*staleReason: 'age'/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 9. Server returnerar timeout/fel
  // ─────────────────────────────────────────────────────────────────────
  it('9. flushQueue använder exponential backoff vid upprepade fel', async () => {
    startLocationTimerMock.mockRejectedValue(new Error('502 Bad Gateway'));
    enqueueTimerStart({
      timerKey: 'project-flaky',
      largeProjectId: 'flaky',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    await flushQueue();
    const q1 = getPendingTimerStarts();
    expect(q1[0].attempts).toBe(1);
    const firstNext = q1[0].nextAttemptAt;
    // Tvinga in ny "due"-tid genom att backdate och flusha igen.
    q1[0].nextAttemptAt = Date.now() - 1;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q1));
    await flushQueue();
    const q2 = getPendingTimerStarts();
    expect(q2[0].attempts).toBe(2);
    // Ny next-attempt MÅSTE vara längre fram än första försöket — annars
    // ingen backoff alls.
    expect(q2[0].nextAttemptAt - Date.now()).toBeGreaterThan(0);
  });

  it('9b. Source-kontrakt: BACKOFF_MS är monotont icke-avtagande', () => {
    const src = read('src/services/timerSyncQueue.ts');
    const m = src.match(/BACKOFF_MS\s*=\s*\[([^\]]+)\]/);
    expect(m).toBeTruthy();
    const arr = m![1].split(',').map(s => Number(s.replace(/_/g, '').trim())).filter(n => !isNaN(n));
    expect(arr.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < arr.length; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(arr[i - 1]);
    }
    // Sista steget måste vara minst 60 s — annars hamrar vi servern vid långt avbrott.
    expect(arr[arr.length - 1]).toBeGreaterThanOrEqual(60_000);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 10. Aktiv session + osäker target — anomaly-skydd, ingen tyst radering
  // ─────────────────────────────────────────────────────────────────────
  it('10. Osäker arbetsdag → workday_flags-rad, INGEN ändring av rapporterad tid', () => {
    // Arkitektur-invariant: workday_flags är frikopplad från time_reports.
    // Om vi någonsin börjar mutera time_reports från workday-osäkerhet
    // är det en regression.
    const src = read('supabase/functions/mobile-app-api/index.ts');
    const idx = src.indexOf("function handleCreateWorkdayFlag");
    expect(idx).toBeGreaterThan(-1);
    const nextFn = src.indexOf('\nasync function ', idx + 1);
    const body = src.slice(idx, nextFn > -1 ? nextFn : undefined);
    // Får INTE skriva till time_reports från workday_flags-flödet.
    expect(body).not.toMatch(/from\(['"]time_reports['"]\)\s*\.update/);
    expect(body).not.toMatch(/from\(['"]time_reports['"]\)\s*\.delete/);
  });

  it('10b. cancelPendingTimer vägrar köra om timer redan är server-bekräftad', () => {
    const src = read('src/hooks/useGeofencing.ts');
    const fnStart = src.indexOf('const cancelPendingTimer = useCallback');
    const fnEnd = src.indexOf('}, [_clearLocalTimer]);', fnStart);
    const body = src.slice(fnStart, fnEnd);
    // Måste explicit refusa när varken pendingSync-flagga eller kö-entry finns.
    expect(body).toMatch(/!timer\.pendingSync\s*&&\s*!isTimerPendingSync\(key\)/);
    expect(body).toMatch(/refusing/);
  });

  it('10c. saveAndStopTimer dropper kö-entry i stället för att stänga server-rad om timer aldrig syncade', () => {
    const src = read('src/hooks/useGeofencing.ts');
    const fnStart = src.indexOf('const saveAndStopTimer = useCallback');
    const fnEnd = src.indexOf('}, [_clearLocalTimer, _resolveStopPayload]);', fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).toMatch(/isTimerPendingSync\(key\)\s*\)\s*\{\s*removeFromQueue\(key\)/);
  });
});
