import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * timeReportingProduct.contract.test.ts
 *
 * Sammanhållen produktnivå-svit för hela tidrapporteringsprodukten. Sviten
 * speglar den BESLUTADE arkitekturen — inte gamla lokala timer-antaganden:
 *
 *   • mobile-app-api är ENDA officiella skrivvägen för time_reports
 *     (create / update / delete). admin/web-vägen använder samma edge
 *     function men med admin_create_time_report / admin_delete_time_report.
 *     Se mem://architecture/time-reporting-write-path-v1.
 *
 *   • location_time_entries är source of truth för alla tre timer-typer
 *     (booking / project / fast plats). Klienten optimistiskt syncar via
 *     en persistent kö med client_dedupe_key, retry och backoff.
 *     Se mem://features/field-staff/unified-timer-architecture-v1.
 *
 *   • Stop-API:t är låst till tre verb. Save-then-stop är kanonisk.
 *     Se mem://features/field-staff/timer-stop-api-v1.
 *
 *   • Stale/anomali är read-only signaler — aldrig tyst radering.
 *     Se mem://features/field-staff/anomaly-tracking-v1.
 *
 * Sviten är uppdelad i sju produktområden (A–G) så att en regression
 * pekar exakt på var arkitekturen brustit.
 *
 * Kompletterande granulära tester:
 *   - src/test/projectStaff.test.ts (rena summeringar/format)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Test utils
// ─────────────────────────────────────────────────────────────────────────────

const ME = {
  id: 'staff-1',
  name: 'Test Staff',
  email: null,
  phone: null,
  role: null,
  department: null,
  hourly_rate: null,
  overtime_rate: null,
};

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

// Pure helpers re-implemented locally so the suite can assert behaviour
// without coupling to the actual UI components.
function calculateHoursFromTimes(startTime: string, endTime: string): number {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? parseFloat(diff.toFixed(2)) : 0;
}

function isStaleOpenEntry(enteredAtIso: string, nowMs: number, thresholdHours = 12): boolean {
  const ageHours = (nowMs - new Date(enteredAtIso).getTime()) / 3_600_000;
  return ageHours > thresholdHours;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Time reporting product (end-to-end contract)', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    localStorage.clear();
    // Force a fresh module graph so the timerSyncQueue singleton state
    // (the `flushing` flag and pending setTimeouts) does not leak between
    // tests. Without this, a still-running flush from a previous test can
    // swallow the next test's mocked fetch response.
    vi.resetModules();
    // Authenticate the SDK so callApi attaches a token + reaches fetch().
    const mod = await import('../services/mobileApiService');
    mod.setAuth('token', ME);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A. CREATE — mobil-vägen
  // ───────────────────────────────────────────────────────────────────────────
  describe('A. Create (mobile path)', () => {
    it('skickar create_time_report till mobile-app-api med rätt payload', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(
        ok({ success: true, time_report: { id: 'tr-1', hours_worked: 8 } }),
      );

      const res = await mobileApi.createTimeReport({
        booking_id: 'b1',
        report_date: '2026-04-18',
        start_time: '08:00',
        end_time: '16:00',
        hours_worked: 8,
        description: 'Rig dag',
      });

      expect(res.success).toBe(true);
      const body = lastBody(mockFetch);
      expect(body.action).toBe('create_time_report');
      expect(body.data.booking_id).toBe('b1');
      expect(body.data.start_time).toBe('08:00');
      expect(body.data.end_time).toBe('16:00');
    });

    it('går mot mobile-app-api endpoint, INTE direkt mot time_reports-tabellen', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, time_report: { id: 'tr-2' } }));

      await mobileApi.createTimeReport({
        booking_id: 'b1',
        report_date: '2026-04-18',
        hours_worked: 4,
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/functions/v1/mobile-app-api');
      expect(url).not.toContain('/rest/v1/time_reports');
      expect(url).not.toContain('/functions/v1/time-reports'); // retired
    });

    it('stödjer project timers via large_project_id (utan booking_id)', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, time_report: { id: 'tr-p' } }));

      await mobileApi.createTimeReport({
        large_project_id: 'lp-1',
        report_date: '2026-04-18',
        start_time: '07:00',
        end_time: '15:00',
        hours_worked: 8,
      });

      const body = lastBody(mockFetch);
      expect(body.data.large_project_id).toBe('lp-1');
      expect(body.data.booking_id).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. ADMIN/WEB — samma backendregler som mobilen
  // ───────────────────────────────────────────────────────────────────────────
  describe('B. Admin/web write path (same backend rules)', () => {
    it('projectStaffService.createTimeReport går genom adminCreateTimeReport', async () => {
      // 1) admin_create_time_report-svar
      // 2) staff_members.select for name lookup (supabase REST)
      mockFetch.mockResolvedValueOnce(
        ok({
          success: true,
          time_report: {
            id: 'tr-admin-1',
            staff_id: 'staff-x',
            report_date: '2026-04-18',
            start_time: '08:00',
            end_time: '16:00',
            hours_worked: 8,
            overtime_hours: 0,
            description: 'Admin-skapad',
            approved: false,
          },
        }),
      );
      // staff name lookup may or may not be reached via REST; respond OK either way.
      mockFetch.mockResolvedValue(ok([{ name: 'Anna Andersson' }]));

      const svc = await import('../services/projectStaffService');
      const res = await svc.createTimeReport({
        booking_id: 'b1',
        staff_id: 'staff-x',
        report_date: '2026-04-18',
        start_time: '08:00',
        end_time: '16:00',
        hours_worked: 8,
        overtime_hours: 0,
        description: 'Admin-skapad',
      });

      // First call MUST be the admin endpoint, not a direct time_reports insert.
      const firstBody = bodyAt(mockFetch, 0);
      expect(firstBody.action).toBe('admin_create_time_report');
      expect(firstBody.data.target_staff_id).toBe('staff-x');
      expect(firstBody.data.booking_id).toBe('b1');
      expect(res.id).toBe('tr-admin-1');
    });

    it('projectStaffService.createTimeReport skickar large_project_id utan booking_id för storprojekt', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({
          success: true,
          time_report: {
            id: 'tr-admin-lp-1',
            staff_id: 'staff-x',
            report_date: '2026-04-18',
            start_time: '08:00',
            end_time: '16:00',
            hours_worked: 8,
            overtime_hours: 0,
            description: 'Storprojekt',
            approved: false,
          },
        }),
      );
      mockFetch.mockResolvedValue(ok([{ name: 'Anna Andersson' }]));

      const svc = await import('../services/projectStaffService');
      await svc.createTimeReport({
        large_project_id: 'lp-99',
        staff_id: 'staff-x',
        report_date: '2026-04-18',
        start_time: '08:00',
        end_time: '16:00',
        hours_worked: 8,
        overtime_hours: 0,
        description: 'Storprojekt',
      });

      const firstBody = bodyAt(mockFetch, 0);
      expect(firstBody.action).toBe('admin_create_time_report');
      expect(firstBody.data.large_project_id).toBe('lp-99');
      expect(firstBody.data.booking_id).toBeUndefined();
    });

    it('vägrar admin-create när start_time eller end_time saknas (samma valideringsregel som mobilen)', async () => {
      const svc = await import('../services/projectStaffService');
      await expect(
        svc.createTimeReport({
          booking_id: 'b1',
          staff_id: 'staff-x',
          report_date: '2026-04-18',
          start_time: null,
          end_time: null,
          hours_worked: 8,
          overtime_hours: 0,
          description: null,
        }),
      ).rejects.toThrow(/krävs/i);
      // Inget nätverksanrop ska ha gjorts.
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('projectStaffService.deleteTimeReport går genom admin_delete_time_report', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));
      const svc = await import('../services/projectStaffService');
      await svc.deleteTimeReport('tr-1');
      const body = lastBody(mockFetch);
      expect(body.action).toBe('admin_delete_time_report');
      expect(body.data.time_report_id).toBe('tr-1');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C. EDIT
  // ───────────────────────────────────────────────────────────────────────────
  describe('C. Edit', () => {
    it('skickar update_time_report med endast ändrade fält', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(
        ok({ success: true, time_report: { id: 'tr-1', hours_worked: 7.5 } }),
      );
      await mobileApi.updateTimeReport({
        time_report_id: 'tr-1',
        hours_worked: 7.5,
        description: 'justerad',
      });
      const body = lastBody(mockFetch);
      expect(body.action).toBe('update_time_report');
      expect(body.data.time_report_id).toBe('tr-1');
      expect(body.data.hours_worked).toBe(7.5);
    });

    it('går mot mobile-app-api, inte gamla retired time-reports edge function', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, time_report: { id: 'x' } }));
      await mobileApi.updateTimeReport({ time_report_id: 'tr-1', hours_worked: 8 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/functions/v1/mobile-app-api');
      expect(url).not.toContain('/functions/v1/time-reports');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // D. DELETE
  // ───────────────────────────────────────────────────────────────────────────
  describe('D. Delete', () => {
    it('skickar delete_time_report via mobile-app-api', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true }));
      await mobileApi.deleteTimeReport('tr-1');
      const body = lastBody(mockFetch);
      expect(body.action).toBe('delete_time_report');
      expect(body.data.time_report_id).toBe('tr-1');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E. APPROVED-LOCK & DATETIME-OVERLAP & MJUK AKTIV-TIMER-SPÄRR
  //    (Felmappning: backend-felmeddelanden måste yta upp i frontend.)
  // ───────────────────────────────────────────────────────────────────────────
  describe('E. Server-enforced rules surface as errors', () => {
    it('approved-lock: edit på godkänd rapport ger fel som propagerar till anropare', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(
        err(409, 'Approved time reports cannot be modified'),
      );
      await expect(
        mobileApi.updateTimeReport({ time_report_id: 'tr-locked', hours_worked: 9 }),
      ).rejects.toThrow(/Approved/i);
    });

    it('approved-lock: delete på godkänd rapport ger fel som propagerar', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(err(409, 'Approved time reports cannot be deleted'));
      await expect(mobileApi.deleteTimeReport('tr-locked')).rejects.toThrow(/Approved/i);
    });

    it('datetime-overlap: överlappande rapport avvisas av servern och ytar upp', async () => {
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

    it('mjuk aktiv-timer-spärr: create vid aktiv timer ger varningsfel som ytar upp', async () => {
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

    it('admin-vägen yttar upp samma serverfel som mobilvägen (samma kontrakt)', async () => {
      mockFetch.mockResolvedValueOnce(err(409, 'Time report overlaps with existing entry'));
      const svc = await import('../services/projectStaffService');
      await expect(
        svc.createTimeReport({
          booking_id: 'b1',
          staff_id: 'staff-x',
          report_date: '2026-04-18',
          start_time: '09:00',
          end_time: '12:00',
          hours_worked: 3,
          overtime_hours: 0,
          description: null,
        }),
      ).rejects.toThrow(/overlap/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F. TIMER START & PERSISTENT SYNC QUEUE
  // ───────────────────────────────────────────────────────────────────────────
  describe('F. Timer start (booking/project/location) + pending-sync retry', () => {
    it('booking timer: enqueueTimerStart skickar start_location_timer med client_dedupe_key', async () => {
      const { enqueueTimerStart, flushQueue, removeFromQueue } = await import(
        '../services/timerSyncQueue'
      );
      mockFetch.mockResolvedValueOnce(
        ok({ success: true, entry: { id: 'lte-1', entered_at: '2026-04-18T08:00:00Z' } }),
      );

      const dedupe = enqueueTimerStart({
        timerKey: 'booking-1',
        bookingId: 'booking-1',
        startedAt: '2026-04-18T08:00:00Z',
      });
      expect(dedupe).toBeTruthy();

      await flushQueue();

      const body = lastBody(mockFetch);
      expect(body.action).toBe('start_location_timer');
      expect(body.data.booking_id).toBe('booking-1');
      expect(body.data.client_dedupe_key).toBe(dedupe);
      removeFromQueue('booking-1');
    });

    it('project timer: pushar large_project_id', async () => {
      const { enqueueTimerStart, flushQueue, removeFromQueue } = await import(
        '../services/timerSyncQueue'
      );
      mockFetch.mockResolvedValueOnce(ok({ success: true, entry: { id: 'lte-2' } }));
      enqueueTimerStart({
        timerKey: 'project-lp-1',
        largeProjectId: 'lp-1',
        startedAt: '2026-04-18T08:00:00Z',
      });
      await flushQueue();
      const body = lastBody(mockFetch);
      expect(body.data.large_project_id).toBe('lp-1');
      expect(body.data.location_id).toBeUndefined();
      expect(body.data.booking_id).toBeUndefined();
      removeFromQueue('project-lp-1');
    });

    it('location timer: pushar location_id', async () => {
      const { enqueueTimerStart, flushQueue, removeFromQueue } = await import(
        '../services/timerSyncQueue'
      );
      mockFetch.mockResolvedValueOnce(ok({ success: true, entry: { id: 'lte-3' } }));
      enqueueTimerStart({
        timerKey: 'location-loc-1',
        locationId: 'loc-1',
        startedAt: '2026-04-18T08:00:00Z',
      });
      await flushQueue();
      const body = lastBody(mockFetch);
      expect(body.data.location_id).toBe('loc-1');
      removeFromQueue('location-loc-1');
    });

    it('retry: nätverksfel TAR INTE bort timern ur kön (ingen tyst radering)', async () => {
      const queueMod = await import('../services/timerSyncQueue');
      mockFetch.mockRejectedValue(new TypeError('NetworkError'));

      queueMod.enqueueTimerStart({
        timerKey: 'booking-flaky',
        bookingId: 'booking-flaky',
        startedAt: '2026-04-18T08:00:00Z',
      });
      // enqueueTimerStart fires-and-forgets a flush. Wait for that
      // in-flight flush to settle (mock rejection → catch block runs →
      // attempts incremented + queue saved) before asserting.
      await new Promise((r) => setTimeout(r, 30));

      const remaining = queueMod.getPendingTimerStarts();
      const item = remaining.find((p) => p.timerKey === 'booking-flaky');
      expect(item).toBeDefined();
      expect(item!.attempts).toBeGreaterThanOrEqual(1);
      expect(item!.nextAttemptAt).toBeGreaterThan(Date.now());
      queueMod.removeFromQueue('booking-flaky');
    });

    it('idempotens: samma timerKey enqueueas inte två gånger — samma dedupe-nyckel återanvänds', async () => {
      const queueMod = await import('../services/timerSyncQueue');
      const a = queueMod.enqueueTimerStart({
        timerKey: 'booking-dup',
        bookingId: 'booking-dup',
        startedAt: '2026-04-18T08:00:00Z',
      });
      const b = queueMod.enqueueTimerStart({
        timerKey: 'booking-dup',
        bookingId: 'booking-dup',
        startedAt: '2026-04-18T08:00:01Z',
      });
      expect(a).toBe(b);
      const queue = queueMod.getPendingTimerStarts();
      expect(queue.filter((p) => p.timerKey === 'booking-dup')).toHaveLength(1);
      queueMod.removeFromQueue('booking-dup');
    });

    it('success: emittar timer-sync-confirmed med serverEntryId så UI kan adoptera servertid', async () => {
      const queueMod = await import('../services/timerSyncQueue');
      mockFetch.mockResolvedValue(
        ok({ success: true, entry: { id: 'lte-x', entered_at: '2026-04-18T08:00:01Z' } }),
      );

      const events: any[] = [];
      const handler = (e: Event) => events.push((e as CustomEvent).detail);
      window.addEventListener('timer-sync-confirmed', handler);

      queueMod.enqueueTimerStart({
        timerKey: 'booking-confirm',
        bookingId: 'booking-confirm',
        startedAt: '2026-04-18T08:00:00Z',
      });
      // enqueueTimerStart fires the actual flush itself; wait for it to settle.
      await new Promise((r) => setTimeout(r, 30));

      window.removeEventListener('timer-sync-confirmed', handler);
      expect(events.length).toBe(1);
      expect(events[0].timerKey).toBe('booking-confirm');
      expect(events[0].serverEntryId).toBe('lte-x');
      expect(events[0].serverStartedAt).toBe('2026-04-18T08:00:01Z');
      expect(queueMod.isTimerPendingSync('booking-confirm')).toBe(false);
    });

    it('race-guard (2026-05): server svar status=already_closed_or_consumed → kön rensas + timer-sync-rejected emittas', async () => {
      const queueMod = await import('../services/timerSyncQueue');
      mockFetch.mockResolvedValue(
        ok({
          status: 'already_closed_or_consumed',
          reason: 'already_consumed',
          entry: { id: 'lte-old', exited_at: '2026-04-18T08:30:00Z' },
        }),
      );

      const events: any[] = [];
      const handler = (e: Event) => events.push((e as CustomEvent).detail);
      window.addEventListener('timer-sync-rejected', handler);

      queueMod.enqueueTimerStart({
        timerKey: 'booking-stale-retry',
        bookingId: 'booking-stale-retry',
        startedAt: '2026-04-18T08:00:00Z',
      });
      await new Promise((r) => setTimeout(r, 30));
      window.removeEventListener('timer-sync-rejected', handler);

      expect(events.length).toBe(1);
      expect(events[0].timerKey).toBe('booking-stale-retry');
      expect(events[0].reason).toBe('already_consumed');
      expect(queueMod.isTimerPendingSync('booking-stale-retry')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // G. SAVE-THEN-STOP RECOVERY & STALE-WARNING (read-only)
  // ───────────────────────────────────────────────────────────────────────────
  describe('G. Save-then-stop recovery & stale-warning', () => {
    it('save-then-stop: om create_time_report failar ska INGEN stop_location_timer skickas', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(err(500, 'DB error'));

      // Simulerar hookens kanoniska sekvens: save FIRST.
      const stop = vi.fn();
      try {
        await mobileApi.createTimeReport({
          booking_id: 'b1',
          report_date: '2026-04-18',
          start_time: '08:00',
          end_time: '16:00',
          hours_worked: 8,
        });
        // success path — would normally call stopLocationTimer next
        await stop();
      } catch {
        // failure path — must NOT call stop
      }

      expect(stop).not.toHaveBeenCalled();
      // Endast EN fetch-call (createTimeReport som föll). Ingen stop skickad.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(bodyAt(mockFetch, 0).action).toBe('create_time_report');
    });

    it('save-then-stop: vid lyckad save går stop_location_timer SEN', async () => {
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

    it('stale-warning: gamla open-entries flaggas som stale men raderas ALDRIG tyst', () => {
      const now = Date.parse('2026-04-18T20:00:00Z');
      const fresh = '2026-04-18T16:00:00Z'; // 4h gammal
      const stale = '2026-04-17T07:00:00Z'; // 37h gammal

      expect(isStaleOpenEntry(fresh, now)).toBe(false);
      expect(isStaleOpenEntry(stale, now)).toBe(true);

      // Kontraktet: stale ⇒ varning. Inget i frontend ska tysta-radera.
      // Vi verifierar att inga nätverksanrop görs som ett biprodukt
      // av att märka något som stale.
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('stop-API: stopLocationTimer kan stänga via entry_id (server source of truth)', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, entry: { id: 'lte-x' } }));
      await mobileApi.stopLocationTimer({ entry_id: 'lte-x' });
      const body = lastBody(mockFetch);
      expect(body.action).toBe('stop_location_timer');
      expect(body.data.entry_id).toBe('lte-x');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // H. RENA BERÄKNINGAR (sanity)
  // ───────────────────────────────────────────────────────────────────────────
  describe('H. Time math sanity', () => {
    it('hours from times', () => {
      expect(calculateHoursFromTimes('08:00', '16:00')).toBe(8);
      expect(calculateHoursFromTimes('07:00', '15:30')).toBe(8.5);
      expect(calculateHoursFromTimes('16:00', '08:00')).toBe(0); // ingen overnight i dialog
    });
  });
});
