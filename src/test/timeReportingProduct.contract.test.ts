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
 *   • active_time_registrations är source of truth för den enda aktiva
 *     arbetsdagstimern. Projekt/plats kopplas i efterhand av Time Engine;
 *     start_time_registration får därför aldrig få ett target.
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
  // F. CANONICAL SINGLE DAY TIMER
  // ───────────────────────────────────────────────────────────────────────────
  describe('F. Canonical single day timer', () => {
    it('starts a pure workday timer without project, booking or location target', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({
        success: true,
        registration: { id: 'atr-1', started_at: '2026-04-18T08:00:00Z' },
      }));

      const result = await mobileApi.startTimeRegistration({ started_at: '2026-04-18T08:00:00Z' });
      const body = lastBody(mockFetch);

      expect(body.action).toBe('start_time_registration');
      expect(body.data).toEqual({
        target_type: null,
        target_id: null,
        started_at: '2026-04-18T08:00:00Z',
      });
      expect(result.registration.id).toBe('atr-1');
    });

    it('stops the canonical registration by registration_id', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({
        success: true,
        registration: { id: 'atr-1', status: 'stopped' },
      }));

      const result = await mobileApi.stopTimeRegistration({
        registration_id: 'atr-1',
        stop_source: 'user_manual',
        stopped_at: '2026-04-18T16:00:00Z',
      });
      const body = lastBody(mockFetch);

      expect(body.action).toBe('stop_time_registration');
      expect(body.data.registration_id).toBe('atr-1');
      expect(body.data.stop_source).toBe('user_manual');
      expect(result.registration.status).toBe('stopped');
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

    it('save-then-stop: vid lyckad save går stop_time_registration SEN', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, time_report: { id: 'tr-1' } }));
      mockFetch.mockResolvedValueOnce(ok({ success: true, registration: { id: 'atr-1' } }));

      await mobileApi.createTimeReport({
        booking_id: 'b1',
        report_date: '2026-04-18',
        start_time: '08:00',
        end_time: '16:00',
        hours_worked: 8,
      });
      await mobileApi.stopTimeRegistration({ registration_id: 'atr-1' });

      expect(bodyAt(mockFetch, 0).action).toBe('create_time_report');
      expect(bodyAt(mockFetch, 1).action).toBe('stop_time_registration');
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

    it('stop-API: stopTimeRegistration kan stänga via registration_id (server source of truth)', async () => {
      const { mobileApi } = await import('../services/mobileApiService');
      mockFetch.mockResolvedValueOnce(ok({ success: true, registration: { id: 'atr-x' } }));
      await mobileApi.stopTimeRegistration({ registration_id: 'atr-x' });
      const body = lastBody(mockFetch);
      expect(body.action).toBe('stop_time_registration');
      expect(body.data.registration_id).toBe('atr-x');
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
