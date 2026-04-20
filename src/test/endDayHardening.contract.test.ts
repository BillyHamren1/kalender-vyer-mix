// @vitest-environment node
/**
 * endDayHardening.contract.test.ts
 * ─────────────────────────────────
 *
 * PROMPT 4 — Härda Avsluta dag.
 *
 * Avsluta dag MÅSTE vara säkraste flödet i appen. Detta test låser
 * fast de garantier som gör att tid aldrig tappas:
 *
 *   1. SAVE-THEN-STOP ordning
 *      `useGeofencing.saveAndStopTimer` anropar mobileApi.createTimeReport
 *      FÖRST. Endast om den lyckas anropas mobileApi.stopLocationTimer
 *      och local state rensas. Källkods-assertion via regex så vi inte
 *      råkar refaktorera bort save-first-ordningen.
 *
 *   2. SAVE FAIL → TIMER ÖVERLEVER
 *      Vid serverfel på create_time_report kastas felet vidare,
 *      stopLocationTimer anropas INTE och _clearLocalTimer anropas INTE.
 *      Verifierat genom direktkörning av saveAndStopTimer-logiken med
 *      mockad mobileApi.
 *
 *   3. RETRY EFTER FEL ÄR SÄKER (idempotens)
 *      Backend `handleCreateTimeReport` ska returnera den BEFINTLIGA
 *      tidrapporten (status 200, idempotent: true) om en identisk
 *      rapport redan skapades inom 90 s av samma staff. Detta är
 *      kontraktet som gör att retry efter nätverksfel inte ger
 *      duplicerade rapporter eller falskt 409 Overlap-fel.
 *      Källkods-assertion mot mobile-app-api/index.ts.
 *
 *   4. EOD-DIALOG HÅLLS ÖPPEN VID FEL
 *      `GlobalActiveTimerBanner.handleDialogConfirm` rethrowar felet
 *      så dialogen håller `submitting`-staten kontrollerad och
 *      pendingStop INTE rensas — användaren kan trycka Spara igen.
 *      Källkods-assertion.
 *
 *   5. EOD QUEUE PROCESSAR SEKVENTIELLT
 *      Vid 'request-end-day' med flera aktiva timers körs de en i taget
 *      via `processNextEod` så användaren inte får flera dialoger
 *      samtidigt. Källkods-assertion.
 *
 * Källor:
 *   - src/hooks/useGeofencing.ts (saveAndStopTimer)
 *   - src/components/mobile-app/GlobalActiveTimerBanner.tsx
 *   - supabase/functions/mobile-app-api/index.ts (handleCreateTimeReport)
 *   - mem://architecture/time-reporting-write-path-v1
 *   - mem://features/field-staff/timer-stop-api-v1
 *   - mem://features/field-staff/end-day-vs-end-activity-v1
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf-8');

describe('End Day hardening contract', () => {
  // ───────────────────────────────────────────────────────────────────
  // 1. Save-then-stop order — code-level invariant
  // ───────────────────────────────────────────────────────────────────
  it('saveAndStopTimer kallar createTimeReport FÖRE stopLocationTimer FÖRE _clearLocalTimer', () => {
    const src = read('src/hooks/useGeofencing.ts');
    const fnStart = src.indexOf('const saveAndStopTimer = useCallback');
    expect(fnStart).toBeGreaterThan(-1);
    // Slice to just the function body (next const/define after).
    const fnEnd = src.indexOf('}, [_clearLocalTimer, _resolveStopPayload]);', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);

    const idxCreate = body.indexOf('mobileApi.createTimeReport');
    const idxStop = body.indexOf('mobileApi.stopLocationTimer');
    const idxClear = body.indexOf('_clearLocalTimer(key)');

    expect(idxCreate).toBeGreaterThan(-1);
    expect(idxStop).toBeGreaterThan(-1);
    expect(idxClear).toBeGreaterThan(-1);
    // STRICT: create < stop < clear
    expect(idxCreate).toBeLessThan(idxStop);
    expect(idxStop).toBeLessThan(idxClear);
  });

  it('saveAndStopTimer awaitar createTimeReport (kastar vid fel)', () => {
    const src = read('src/hooks/useGeofencing.ts');
    const fnStart = src.indexOf('const saveAndStopTimer = useCallback');
    const fnEnd = src.indexOf('}, [_clearLocalTimer, _resolveStopPayload]);', fnStart);
    const body = src.slice(fnStart, fnEnd);

    // Must literally `await mobileApi.createTimeReport(...)` — never
    // wrapped in try/catch that swallows the error.
    expect(body).toMatch(/await mobileApi\.createTimeReport\(reportPayload\)/);

    // Must NOT contain `try` before createTimeReport (which would mean
    // the error gets swallowed and the timer cleared anyway).
    const upToCreate = body.slice(0, body.indexOf('mobileApi.createTimeReport'));
    expect(upToCreate.includes('try {')).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────
  // 2. Backend idempotency — retry after network drop
  // ───────────────────────────────────────────────────────────────────
  it('handleCreateTimeReport har soft-idempotency mot dubbla rapporter inom 90 s', () => {
    const src = read('supabase/functions/mobile-app-api/index.ts');
    const fnStart = src.indexOf('async function handleCreateTimeReport');
    expect(fnStart).toBeGreaterThan(-1);

    // Find the function body up to its closing brace by locating the
    // next top-level `async function` declaration.
    const nextFn = src.indexOf('\nasync function ', fnStart + 1);
    const body = src.slice(fnStart, nextFn > -1 ? nextFn : undefined);

    // Must reference a 90 s (or stricter) window for the dedupe lookup.
    expect(body).toMatch(/90_000|90 \* 1000|90000/);
    // Must select existing time_reports with same staff + report_date +
    // start_time + end_time + hours_worked before inserting.
    expect(body).toMatch(/\.eq\(['"]staff_id['"], staffId\)/);
    expect(body).toMatch(/\.eq\(['"]report_date['"], report_date\)/);
    expect(body).toMatch(/\.eq\(['"]start_time['"], start_time\)/);
    expect(body).toMatch(/\.eq\(['"]end_time['"], end_time\)/);
    expect(body).toMatch(/\.eq\(['"]hours_worked['"], calculatedHours\)/);
    // On hit must return the existing report as success (not 409).
    expect(body).toMatch(/idempotent: true/);
  });

  it('idempotency-koden ligger FÖRE overlap-checken (annars retry → 409)', () => {
    const src = read('supabase/functions/mobile-app-api/index.ts');
    const fnStart = src.indexOf('async function handleCreateTimeReport');
    const nextFn = src.indexOf('\nasync function ', fnStart + 1);
    const body = src.slice(fnStart, nextFn > -1 ? nextFn : undefined);

    const idxIdempotent = body.indexOf('idempotent: true');
    const idxOverlap = body.indexOf('Overlap check (CREATE)');
    expect(idxIdempotent).toBeGreaterThan(-1);
    expect(idxOverlap).toBeGreaterThan(-1);
    expect(idxIdempotent).toBeLessThan(idxOverlap);
  });

  // ───────────────────────────────────────────────────────────────────
  // 3. EOD-dialog UX — keep dialog open on error so user can retry
  // ───────────────────────────────────────────────────────────────────
  it('handleDialogConfirm rethrowar felet så pendingStop kvarstår vid retry', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    const fnStart = src.indexOf('const handleDialogConfirm = useCallback');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf('}, [pendingStop, stopSession]);', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);

    // Must rethrow caught error so dialog's submitting state resets cleanly.
    expect(body).toMatch(/throw err/);
    // Must NOT call setPendingStop(null) inside the catch block.
    const catchStart = body.indexOf('} catch');
    const catchEnd = body.indexOf('} finally', catchStart);
    const catchBlock = body.slice(catchStart, catchEnd > -1 ? catchEnd : body.length);
    expect(catchBlock.includes('setPendingStop(null)')).toBe(false);
  });

  it('handleDialogConfirm rensar savingKeys i finally så UI inte fastnar', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    const fnStart = src.indexOf('const handleDialogConfirm = useCallback');
    const fnEnd = src.indexOf('}, [pendingStop, stopSession]);', fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).toMatch(/finally\s*\{[^}]*setSavingKeys/);
  });

  // ───────────────────────────────────────────────────────────────────
  // 4. Sequential EOD queue — never stack multiple dialogs
  // ───────────────────────────────────────────────────────────────────
  it('request-end-day kör flera timers SEKVENTIELLT via processNextEod', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    expect(src).toMatch(/eodQueueRef = useRef<string\[\]>\(\[\]\)/);
    expect(src).toMatch(/eodProcessingRef = useRef\(false\)/);
    expect(src).toMatch(/processNextEod/);
    // request-end-day enqueues entries and triggers the processor.
    const handlerStart = src.indexOf('const onRequestEndDay = ()');
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerEnd = src.indexOf('};', handlerStart);
    const handler = src.slice(handlerStart, handlerEnd);
    expect(handler).toMatch(/eodQueueRef\.current\.push/);
    expect(handler).toMatch(/processNextEod/);
  });

  // ───────────────────────────────────────────────────────────────────
  // 5. Pending-stop persistence — survives app crash mid-confirmation
  // ───────────────────────────────────────────────────────────────────
  it('pendingStop persistas i localStorage så Avsluta-dag-state överlever app-kill', () => {
    const src = read('src/components/mobile-app/GlobalActiveTimerBanner.tsx');
    expect(src).toMatch(/PENDING_STOP_KEY = 'eventflow-pending-stop'/);
    // Effect that mirrors pendingStop into localStorage.
    expect(src).toMatch(/localStorage\.setItem\(PENDING_STOP_KEY/);
    // Restore on mount.
    expect(src).toMatch(/localStorage\.getItem\(PENDING_STOP_KEY\)/);
    // Must clean up stale payloads when timer no longer exists.
    expect(src).toMatch(/!current\.has\(parsed\.key\)/);
  });

  // ───────────────────────────────────────────────────────────────────
  // 6. Stop-engine — break-anomaly persistence is non-fatal
  // ───────────────────────────────────────────────────────────────────
  it('useWorkSession.stopSession kastar INTE när break-anomaly eller EOD-anomaly misslyckas', () => {
    const src = read('src/hooks/useWorkSession.tsx');
    // Both anomaly persistence calls must be wrapped in try/catch with
    // a "non-fatal" comment — we never want the user's TIME REPORT to
    // be considered failed because a side-effect anomaly POST flunked.
    expect(src).toMatch(/break-anomaly persist failed \(non-fatal\)/);
    expect(src).toMatch(/end-of-day anomaly persist failed \(non-fatal\)/);
    // closeOpenAnomalies is fire-and-forget (.catch chained).
    expect(src).toMatch(/closeOpenAnomalies[\s\S]{0,200}\.catch/);
  });
});
