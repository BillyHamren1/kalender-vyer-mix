// @vitest-environment node
/**
 * activeSessionHardening.contract.test.ts
 * ───────────────────────────────────────
 *
 * PROMPT 3 — Härda Aktiv tid: sessionen får inte dö eller bli oklar.
 *
 * Verifierar de robusthetsgarantier som hindrar att en pågående
 * arbetssession blir hängande, dubbel eller "spöke":
 *
 *   1. STORAGE-EVENT FILTERING
 *      `GlobalActiveTimerBanner` reagerar BARA på storage-events vars
 *      `key === TIMERS_KEY` (eller `null` för tab-clear). Annars skulle
 *      orelaterade localStorage-skrivningar (chat-drafts, theme, etc.)
 *      orsaka onödiga re-reads och flicker → spök-state.
 *
 *   2. PENDING-SYNC RECOVERY SWEEP
 *      `useGeofencing` rensar `pendingSync: true` på lokala timers som
 *      varken finns på servern (inte i restore-svaret) eller i den
 *      lokala sync-kön. Annars kan en timer fastna som "Synkroniserar…"
 *      för evigt om confirmed-eventet kom före listenern monterades.
 *
 *   3. SYNC-QUEUE IDEMPOTENS
 *      Två snabba `enqueueTimerStart` för samma `timerKey` ger EN entry
 *      med samma `clientDedupeKey`. Återanvänds även om payload-fälten
 *      skiljer sig (timerKey är dedupe-nyckel).
 *
 *   4. ORPHAN OK-PATH: pendingSync ska INTE rensas om kön fortfarande
 *      har en pending entry för samma timerKey (mid-flight).
 *
 *   5. CORRUPT QUEUE → safe.
 *      `getPendingTimerStarts` returnerar [] vid trasig JSON i stället
 *      för att kasta. UI-koden får aldrig crasha pga skadad localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import {
  enqueueTimerStart,
  getPendingTimerStarts,
  isTimerPendingSync,
  clearTimerSyncQueue,
} from '@/services/timerSyncQueue';

const QUEUE_KEY = 'eventflow-timer-sync-queue';
const read = (p: string) => fs.readFileSync(p, 'utf-8');

beforeEach(() => {
  localStorage.clear();
  clearTimerSyncQueue();
});

describe('Active session hardening contract', () => {
  // ─────────────────────────────────────────────────────────────────────
  // 1. Storage-event filtering — banner must ignore unrelated keys
  // ─────────────────────────────────────────────────────────────────────
  it('GlobalActiveTimerBanner filtrerar storage-events på TIMERS_KEY', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    // Storage handler must inspect e.key and only fire for our key (or null).
    expect(src).toMatch(/storageHandler\s*=\s*\(e:\s*StorageEvent\)/);
    expect(src).toMatch(/e\.key\s*===\s*null\s*\|\|\s*e\.key\s*===\s*TIMERS_KEY/);
    // The raw `handler` (no filter) must NOT be passed directly to addEventListener('storage', ...)
    expect(src).not.toMatch(/addEventListener\(['"]storage['"],\s*handler\)/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. Recovery sweep — useGeofencing clears stuck pendingSync flags
  // ─────────────────────────────────────────────────────────────────────
  it('useGeofencing kör recovery-sweep efter server-restore', () => {
    const src = read('src/hooks/useGeofencing.ts');
    // Must build a serverKeys set from manualEntries.
    expect(src).toMatch(/serverKeys\s*=\s*new Set<string>/);
    // Must clear pendingSync only when key is NOT on server AND NOT in queue.
    expect(src).toMatch(/t\.pendingSync\s*&&\s*!serverKeys\.has\(k\)\s*&&\s*!isTimerPendingSync\(k\)/);
    // Comment must explain the recovery intent.
    expect(src).toMatch(/RECOVERY SWEEP/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. Sync queue idempotency
  // ─────────────────────────────────────────────────────────────────────
  it('enqueueTimerStart dedupar på timerKey (samma clientDedupeKey returneras)', () => {
    const k1 = enqueueTimerStart({
      timerKey: 'project-abc',
      largeProjectId: 'abc',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    const k2 = enqueueTimerStart({
      timerKey: 'project-abc',
      largeProjectId: 'abc',
      // Different startedAt — still same dedupe key because timerKey matches.
      startedAt: '2025-01-01T10:00:05.000Z',
    });
    expect(k1).toBe(k2);
    expect(getPendingTimerStarts()).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Mid-flight protection — recovery sweep must respect the queue
  // ─────────────────────────────────────────────────────────────────────
  it('isTimerPendingSync returnerar true så länge entry finns i kön', () => {
    enqueueTimerStart({
      timerKey: 'location-xyz',
      locationId: 'xyz',
      startedAt: '2025-01-01T10:00:00.000Z',
    });
    expect(isTimerPendingSync('location-xyz')).toBe(true);
    // After clearing the queue (e.g. logout), the predicate must flip.
    clearTimerSyncQueue();
    expect(isTimerPendingSync('location-xyz')).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Corrupt queue JSON must not crash readers
  // ─────────────────────────────────────────────────────────────────────
  it('getPendingTimerStarts returnerar [] vid skadad JSON i stället för att kasta', () => {
    localStorage.setItem(QUEUE_KEY, '{not valid json');
    expect(() => getPendingTimerStarts()).not.toThrow();
    expect(getPendingTimerStarts()).toEqual([]);
  });

  it('getPendingTimerStarts returnerar [] när värdet är ett icke-array (t.ex. objekt)', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(getPendingTimerStarts()).toEqual([]);
  });
});
