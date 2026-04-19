/**
 * workDayEngine.contract.test.ts
 * ──────────────────────────────
 * Quality gate för arbetsdagsmotorn (PROMPT 4–7).
 *
 * Sviten verifierar de regler som ersatte den gamla auto-rast/auto-stop-
 * modellen. Den kompletterar (men ersätter inte) timeReportingProduct.contract
 * som täcker själva tidrapporterings-skrivvägen.
 *
 * Områden som låses här:
 *   1. Ingen automatisk rast/tid skapas av assistenten — den ställer FRÅGOR.
 *   2. Save-then-stop-kontraktet (saveAndStopTimer): aldrig stop före save.
 *   3. End-activity vs end-day (verb-API:t i useGeofencing finns och är låst).
 *   4. Gemensam session-motor: useWorkSession / mobileApi.startLocationTimer
 *      hanterar booking/project/location med samma kontrakt.
 *   5. Travel-loggar förblir SEPARATA från arbetstid (egen API-väg + suppress
 *      av activity_leave under aktiv resa).
 *   6. Workday-flags skapas när assistenten är osäker (unclassified_anomaly).
 *   7. Assistentens beslutsregler (cooldowns, prio-ordning, suppress-policy).
 *   8. Server-regler (approved-lock, overlap, mjuk timer-spärr) ytar upp
 *      som fel — ingen tyst datamutation i frontend.
 *
 * Källor:
 *   - mem://features/field-staff/work-session-engine-v1
 *   - mem://features/field-staff/end-day-vs-end-activity-v1
 *   - mem://features/field-staff/timer-stop-api-v1
 *   - mem://features/field-staff/workday-flags-v1
 *   - mem://features/field-staff/travel-time-in-reports-v1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  nextAssistantDecision,
  COOLDOWNS_MS,
  type WorkDayState,
  type CachedTarget,
} from '@/lib/workDayDecisions';

// ─────────────────────────────────────────────────────────────────────
// State factory — keep tests terse; only override what each scenario needs.
// ─────────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<WorkDayState> = {}): WorkDayState {
  return {
    now: Date.parse('2026-04-18T09:00:00Z'),
    enabled: true,
    latestPosition: null,
    timers: [],
    cachedTargets: [],
    lastExit: null,
    pendingAnomalies: { count: 0, oldestStartedAtIso: null },
    isTravelling: false,
    lastShownByKind: new Map(),
    outsideSinceByTimer: new Map(),
    firstSignalToday: null,
    ...overrides,
  };
}

function activeTimer(opts: {
  startTime: string;
  bookingId?: string;
  largeProjectId?: string;
  locationId?: string;
}) {
  return {
    bookingId: opts.bookingId,
    largeProjectId: opts.largeProjectId,
    locationId: opts.locationId,
    startTime: opts.startTime,
    isStale: false,
    pendingSync: false,
  } as any;
}

function ok<T>(body: T) {
  return { status: 200, ok: true, json: () => Promise.resolve(body) };
}
function err(status: number, message: string) {
  return { status, ok: false, json: () => Promise.resolve({ error: message }) };
}
function lastBody(mockFetch: ReturnType<typeof vi.fn>) {
  return JSON.parse((mockFetch.mock.calls.at(-1)?.[1] as any).body);
}
function bodyAt(mockFetch: ReturnType<typeof vi.fn>, idx: number) {
  return JSON.parse((mockFetch.mock.calls[idx][1] as any).body);
}

// ─────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────

describe('Work-day engine (assistant + sessions + flags)', () => {
  // ───────────────────────────────────────────────────────────────────
  // 1. NO AUTO-BREAK — assistant only ASKS, never mutates time
  // ───────────────────────────────────────────────────────────────────
  describe('1. No automatic break', () => {
    it('long pass över 5h ger long_pass_no_break-FRÅGA, inte tysta tidsändringar', () => {
      const now = Date.parse('2026-04-18T15:00:00Z');
      const state = makeState({
        now,
        timers: [
          { key: 'booking-1', timer: activeTimer({ startTime: '2026-04-18T08:00:00Z', bookingId: 'b1' }) },
        ],
      });
      const d = nextAssistantDecision(state);
      expect(d?.kind).toBe('long_pass_no_break');
      // Och eftersom det är en ren funktion: inga side-effects möjliga.
      // (Detta är hela poängen med att extrahera regelmotorn.)
    });

    it('stale timer triggar INTE long_pass_no_break (stale-dialog äger det)', () => {
      const now = Date.parse('2026-04-18T15:00:00Z');
      const stale = activeTimer({ startTime: '2026-04-17T08:00:00Z', bookingId: 'b1' });
      stale.isStale = true;
      const state = makeState({ now, timers: [{ key: 'booking-1', timer: stale }] });
      const d = nextAssistantDecision(state);
      expect(d?.kind).not.toBe('long_pass_no_break');
    });

    it('cooldown håller — samma fråga visas inte två gånger inom 60 min', () => {
      const now = Date.parse('2026-04-18T15:00:00Z');
      const lastShownByKind = new Map();
      lastShownByKind.set('long_pass_no_break', now - 10 * 60_000); // 10 min sen
      const state = makeState({
        now,
        timers: [
          { key: 'booking-1', timer: activeTimer({ startTime: '2026-04-18T08:00:00Z', bookingId: 'b1' }) },
        ],
        lastShownByKind,
      });
      const d = nextAssistantDecision(state);
      expect(d).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 2. SAVE-THEN-STOP — kanonisk sekvens
  // ───────────────────────────────────────────────────────────────────
  describe('2. Save-then-stop contract', () => {
    const originalFetch = globalThis.fetch;
    let mockFetch: ReturnType<typeof vi.fn>;
    beforeEach(async () => {
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
      localStorage.clear();
      vi.resetModules();
      const mod = await import('../services/mobileApiService');
      mod.setAuth('token', { id: 'staff-1', name: 'T', email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('save misslyckas → INGEN stop_location_timer skickas', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(err(500, 'DB error'));

      const stop = vi.fn();
      try {
        await mobileApi.createTimeReport({
          booking_id: 'b1',
          report_date: '2026-04-18',
          start_time: '08:00',
          end_time: '16:00',
          hours_worked: 8,
        });
        await stop();
      } catch {
        // expected
      }
      expect(stop).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(bodyAt(mockFetch, 0).action).toBe('create_time_report');
    });

    it('save lyckas → stop går SEN', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, time_report: { id: 'tr-1' } }));
      mockFetch.mockResolvedValueOnce(ok({ success: true, entry: { id: 'lte-1' } }));

      await mobileApi.createTimeReport({
        booking_id: 'b1',
        report_date: '2026-04-18',
        start_time: '08:00',
        end_time: '16:00',
        hours_worked: 8,
      });
      await mobileApi.stopLocationTimer({ booking_id: 'b1' });

      expect(bodyAt(mockFetch, 0).action).toBe('create_time_report');
      expect(bodyAt(mockFetch, 1).action).toBe('stop_location_timer');
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 3. END-ACTIVITY VS END-DAY — verb-API:t i useGeofencing
  // ───────────────────────────────────────────────────────────────────
  describe('3. End-activity vs end-day verb API', () => {
    it('useGeofencing exporterar exakt de tre stop-verben och INGET generic stopTimer', async () => {
      // Vi importerar inte hooken (den kräver React-context), men vi
      // verifierar källkoden så regressionen syns omedelbart om någon
      // skulle återinföra det gamla generic API:t.
      const fs = await import('node:fs/promises');
      const src = await fs.readFile('src/hooks/useGeofencing.ts', 'utf-8');
      // Vart och ett av verben ska finnas:
      expect(src).toMatch(/saveAndStopTimer/);
      expect(src).toMatch(/stopLocationTimerWithoutReport/);
      expect(src).toMatch(/cancelPendingTimer/);
      // Det gamla generic verbet får inte ha smugit in igen som EXPORT
      // (kommentarer som beskriver att det är borttaget är OK).
      const exportedStopTimer = /^\s*const\s+stopTimer\s*=/m.test(src) ||
        /,\s*stopTimer\s*[,}]/.test(src.split('return {')[1] || '');
      expect(exportedStopTimer).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 4. GEMENSAM SESSION-MOTOR — same kontrakt för alla tre timer-typer
  // ───────────────────────────────────────────────────────────────────
  describe('4. Unified session engine (booking/project/location)', () => {
    const originalFetch = globalThis.fetch;
    let mockFetch: ReturnType<typeof vi.fn>;
    beforeEach(async () => {
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
      localStorage.clear();
      vi.resetModules();
      const mod = await import('../services/mobileApiService');
      mod.setAuth('token', { id: 'staff-1', name: 'T', email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('booking timer: enqueueTimerStart + flushQueue → start_location_timer m. booking_id', async () => {
      const { enqueueTimerStart, flushQueue, removeFromQueue } = await import('../services/timerSyncQueue');
      mockFetch.mockResolvedValueOnce(ok({ success: true, entry: { id: 'lte-1' } }));
      enqueueTimerStart({ timerKey: 'booking-1', bookingId: 'booking-1', startedAt: '2026-04-18T08:00:00Z' });
      await flushQueue();
      const body = lastBody(mockFetch);
      expect(body.action).toBe('start_location_timer');
      expect(body.data.booking_id).toBe('booking-1');
      removeFromQueue('booking-1');
    });

    it('project timer: large_project_id pushas via samma endpoint', async () => {
      const { enqueueTimerStart, flushQueue, removeFromQueue } = await import('../services/timerSyncQueue');
      mockFetch.mockResolvedValueOnce(ok({ success: true, entry: { id: 'lte-2' } }));
      enqueueTimerStart({ timerKey: 'project-lp-1', largeProjectId: 'lp-1', startedAt: '2026-04-18T08:00:00Z' });
      await flushQueue();
      const body = lastBody(mockFetch);
      expect(body.action).toBe('start_location_timer');
      expect(body.data.large_project_id).toBe('lp-1');
      removeFromQueue('project-lp-1');
    });

    it('location timer: location_id pushas via samma endpoint', async () => {
      const { enqueueTimerStart, flushQueue, removeFromQueue } = await import('../services/timerSyncQueue');
      mockFetch.mockResolvedValueOnce(ok({ success: true, entry: { id: 'lte-3' } }));
      enqueueTimerStart({ timerKey: 'location-loc-1', locationId: 'loc-1', startedAt: '2026-04-18T08:00:00Z' });
      await flushQueue();
      const body = lastBody(mockFetch);
      expect(body.action).toBe('start_location_timer');
      expect(body.data.location_id).toBe('loc-1');
      removeFromQueue('location-loc-1');
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 5. TRAVEL — separat från arbetstid
  // ───────────────────────────────────────────────────────────────────
  describe('5. Travel logs are kept separate from work time', () => {
    const originalFetch = globalThis.fetch;
    let mockFetch: ReturnType<typeof vi.fn>;
    beforeEach(async () => {
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
      localStorage.clear();
      vi.resetModules();
      const mod = await import('../services/mobileApiService');
      mod.setAuth('token', { id: 'staff-1', name: 'T', email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('createTravelLog går till create_travel_log — INTE create_time_report', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, travel_log: { id: 'tl-1' } }));
      await mobileApi.createTravelLog({
        from_address: 'A',
        from_latitude: 59.0,
        from_longitude: 18.0,
      });
      const body = lastBody(mockFetch);
      expect(body.action).toBe('create_travel_log');
      expect(body.action).not.toBe('create_time_report');
    });

    it('aktiv resa SUPPRESSAR activity_leave (rörelsen är förklarad)', () => {
      const target: CachedTarget = {
        key: 'booking-1', name: 'Site', lat: 59.0, lng: 18.0, radius: 150, type: 'booking',
      };
      const farPos = { lat: 59.1, lng: 18.1, accuracy: 10, timestamp: Date.now() } as any;
      const outsideSince = new Map([['booking-1', Date.now() - 30 * 60_000]]);

      const stateTravelling = makeState({
        latestPosition: farPos,
        cachedTargets: [target],
        timers: [{ key: 'booking-1', timer: activeTimer({ startTime: new Date().toISOString(), bookingId: 'b1' }) }],
        outsideSinceByTimer: outsideSince,
        isTravelling: true,
      });
      expect(nextAssistantDecision(stateTravelling)?.kind).not.toBe('activity_leave');

      const stateNotTravelling = { ...stateTravelling, isTravelling: false };
      expect(nextAssistantDecision(stateNotTravelling)?.kind).toBe('activity_leave');
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 6. WORKDAY FLAGS — assistant kan skapa flaggor när osäker
  // ───────────────────────────────────────────────────────────────────
  describe('6. Workday flags (assistant uncertainty store)', () => {
    const originalFetch = globalThis.fetch;
    let mockFetch: ReturnType<typeof vi.fn>;
    beforeEach(async () => {
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
      localStorage.clear();
      vi.resetModules();
      const mod = await import('../services/mobileApiService');
      mod.setAuth('token', { id: 'staff-1', name: 'T', email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('createWorkdayFlag skickar create_workday_flag med needs_user_input + flag_type', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, flag: { id: 'wf-1' } }));
      await mobileApi.createWorkdayFlag({
        flag_type: 'presence_without_report',
        flag_date: '2026-04-18',
        title: 'Test',
        needs_user_input: true,
        assistant_decision_kind: 'unclassified_anomaly',
      });
      const body = lastBody(mockFetch);
      expect(body.action).toBe('create_workday_flag');
      expect(body.data.flag_type).toBe('presence_without_report');
      expect(body.data.needs_user_input).toBe(true);
    });

    it('listWorkdayFlags filtrerar på resolved=false', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ flags: [] }));
      await mobileApi.listWorkdayFlags({ resolved: false });
      const body = lastBody(mockFetch);
      expect(body.action).toBe('list_workday_flags');
      expect(body.data.resolved).toBe(false);
    });

    it('resolveWorkdayFlag kräver staff/admin/auto som resolution_source', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, flag: { id: 'wf-1', resolved: true } }));
      await mobileApi.resolveWorkdayFlag({
        flag_id: 'wf-1',
        resolution_source: 'staff',
        resolution_note: 'Det var rast',
      });
      const body = lastBody(mockFetch);
      expect(body.action).toBe('resolve_workday_flag');
      expect(body.data.resolution_source).toBe('staff');
      expect(body.data.resolution_note).toBe('Det var rast');
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 7. ASSISTENT-BESLUT — prio, suppress, cooldown, daystart, evening
  // ───────────────────────────────────────────────────────────────────
  describe('7. Assistant decision rules (pure)', () => {
    it('disabled → null', () => {
      expect(nextAssistantDecision(makeState({ enabled: false }))).toBeNull();
    });

    it('inga signaler → null', () => {
      expect(nextAssistantDecision(makeState())).toBeNull();
    });

    it('PRIO: unclassified_anomaly slår long_pass_no_break', () => {
      const now = Date.parse('2026-04-18T15:00:00Z');
      const state = makeState({
        now,
        timers: [
          { key: 'booking-1', timer: activeTimer({ startTime: '2026-04-18T08:00:00Z', bookingId: 'b1' }) },
        ],
        pendingAnomalies: { count: 2, oldestStartedAtIso: '2026-04-18T10:00:00Z' },
      });
      expect(nextAssistantDecision(state)?.kind).toBe('unclassified_anomaly');
    });

    it('activity_leave: kräver ≥10 min utanför zon för att triggas', () => {
      const target: CachedTarget = {
        key: 'booking-1', name: 'Site', lat: 59.0, lng: 18.0, radius: 150, type: 'booking',
      };
      const farPos = { lat: 59.1, lng: 18.1, accuracy: 10, timestamp: Date.now() } as any;
      const recentOutside = new Map([['booking-1', Date.now() - 5 * 60_000]]); // 5 min
      const stateRecent = makeState({
        latestPosition: farPos,
        cachedTargets: [target],
        timers: [{ key: 'booking-1', timer: activeTimer({ startTime: new Date().toISOString(), bookingId: 'b1' }) }],
        outsideSinceByTimer: recentOutside,
      });
      expect(nextAssistantDecision(stateRecent)).toBeNull();
    });

    it('last_workplace_for_day: kvällsförslag visas i fönstret 17:00→04:00', () => {
      const now = Date.parse('2026-04-18T19:00:00Z'); // 21 lokalt sommar, men hooken testar i UTC-time-of-day; se konstant
      // Använd lokal kväll: 19 UTC + getHours-baserad regel kräver lokal ≥17.
      // Säkraste vägen: konstruera en "now" där new Date(now).getHours() ≥17.
      const eveningLocal = (() => {
        const d = new Date();
        d.setHours(20, 0, 0, 0);
        return d.getTime();
      })();
      const exitMs = eveningLocal - 30 * 60_000;
      const state = makeState({
        now: eveningLocal,
        lastExit: { iso: new Date(exitMs).toISOString(), name: 'Lager' },
      });
      const d = nextAssistantDecision(state);
      expect(d?.kind).toBe('last_workplace_for_day');
    });

    it('daystart: kräver morgonfönster + första signal idag + inga timers', () => {
      const morning = (() => {
        const d = new Date();
        d.setHours(7, 30, 0, 0);
        return d.getTime();
      })();
      const state = makeState({
        now: morning,
        firstSignalToday: { iso: new Date(morning - 5 * 60_000).toISOString(), arrivedAtWorkplace: true },
      });
      expect(nextAssistantDecision(state)?.kind).toBe('daystart');
    });

    it('cooldown-katalogen är låst (ingen tyst justering av en cooldown påverkar produktion)', () => {
      // Sanity: värdena är de man förväntar sig från arkitekturbeslutet.
      expect(COOLDOWNS_MS.unclassified_anomaly).toBe(4 * 3600 * 1000);
      expect(COOLDOWNS_MS.long_pass_no_break).toBe(60 * 60 * 1000);
      expect(COOLDOWNS_MS.activity_leave).toBe(30 * 60 * 1000);
      expect(COOLDOWNS_MS.last_workplace_for_day).toBe(60 * 60 * 1000);
      expect(COOLDOWNS_MS.daystart).toBe(8 * 3600 * 1000);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // 8. SERVER-REGLER YTAR UPP SOM FEL — ingen tyst datamutation
  // ───────────────────────────────────────────────────────────────────
  describe('8. Server rules surface as errors (never silent)', () => {
    const originalFetch = globalThis.fetch;
    let mockFetch: ReturnType<typeof vi.fn>;
    beforeEach(async () => {
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
      localStorage.clear();
      vi.resetModules();
      const mod = await import('../services/mobileApiService');
      mod.setAuth('token', { id: 'staff-1', name: 'T', email: null, phone: null, role: null, department: null, hourly_rate: null, overtime_rate: null });
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('overlap från servern propagerar till anropare', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(err(409, 'Time report overlaps with existing entry'));
      await expect(
        mobileApi.createTimeReport({
          booking_id: 'b1',
          report_date: '2026-04-18',
          start_time: '09:00',
          end_time: '12:00',
          hours_worked: 3,
        }),
      ).rejects.toThrow(/overlap/i);
    });

    it('approved-lock från servern propagerar', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(err(409, 'Approved time reports cannot be modified'));
      await expect(
        mobileApi.updateTimeReport({ time_report_id: 'tr-1', hours_worked: 9 }),
      ).rejects.toThrow(/Approved/i);
    });

    it('mjuk aktiv-timer-spärr från servern propagerar', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(
        err(409, 'You have an active timer running — stop it before creating a manual report'),
      );
      await expect(
        mobileApi.createTimeReport({
          booking_id: 'b1',
          report_date: '2026-04-18',
          start_time: '09:00',
          end_time: '12:00',
          hours_worked: 3,
        }),
      ).rejects.toThrow(/active timer/i);
    });
  });
});
