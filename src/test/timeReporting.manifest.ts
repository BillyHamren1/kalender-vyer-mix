/**
 * Time-reporting quality gate — manifest.
 *
 * Detta är källan till sanning för vilka testfiler som tillsammans utgör
 * den officiella tidrapporterings-kvalitetsspärren.
 *
 * STANDARDKOMMANDO (officiell väg att köra hela paketet):
 *
 *     npm run test:time-reporting
 *
 * vilket i sin tur kör:
 *
 *     bash scripts/test-time-reporting.sh
 *
 * Båda vägarna är likvärdiga och måste hållas synkade med detta manifest.
 *
 * BAKGRUND
 * ────────
 * Tidrapporteringen vilar på fyra arkitekturbeslut (se memory-filer):
 *
 *   1. mem://architecture/time-reporting-write-path-v1
 *      `mobile-app-api` är ENDA officiell skrivväg för time_reports
 *      (create/update/delete). Den gamla `time-reports` edge-funktionen
 *      är retired (HTTP 410). DB-triggers är yttersta backstop.
 *
 *   2. mem://features/field-staff/unified-timer-architecture-v1
 *      Alla tre timer-typer (location / booking / project) skrivs till
 *      `location_time_entries` via `client_dedupe_key`. Server är
 *      source of truth. Persistent retry-kö i frontend.
 *
 *   3. mem://features/field-staff/timer-stop-api-v1
 *      `useGeofencing` exponerar bara tre stop-verb:
 *        - saveAndStopTimer (save-then-stop, kanonisk)
 *        - stopLocationTimerWithoutReport (rena platstimer)
 *        - cancelPendingTimer (endast pendingSync)
 *      Den gamla generiska `stopTimer` är borttagen.
 *
 *   4. mem://features/field-staff/anomaly-tracking-v1
 *      Stale/anomali-detektering visar varningar — raderar aldrig data.
 *
 * Lägg till nya time-reporting-tester här OCH i scripts/test-time-reporting.sh.
 */
export const TIME_REPORTING_QUALITY_GATE = {
  /**
   * Frontend-tester (vitest, jsdom). Täcker:
   *   - Mobil + admin/web write-path mot mobile-app-api (samma kontrakt)
   *   - approved-lock, datetime-overlap, mjuk aktiv-timer-spärr (felmappning)
   *   - Booking / project / location timer start-flöde
   *   - Pending-start retry/sync, save-then-stop recovery
   *   - Stale-warning (ingen tyst radering)
   */
  frontend: [
    // Samlad produktnivå-svit — primär kontraktssvit för tidrapportering.
    'src/test/timeReportingProduct.contract.test.ts',

    // Befintliga rena beräknings/summering-tester (planeringsstaff,
    // labor cost-summor, formatters). Ingår i samma quality gate så
    // gränssnittet mellan beräkning och write-path verifieras parallellt.
    'src/test/projectStaff.test.ts',
  ],

  /**
   * Backend-tester (deno test mot mobile-app-api edge function).
   * Verifierar serverregler för time_reports + location_time_entries.
   * Lägg till här när dedikerade Deno-tester finns för time-reporting-vägen.
   */
  backend: [
    // (placeholder — lägg time-reporting-fokuserade Deno-tester här när
    // de skrivs; messaging.test.ts ska INTE ingå i denna gate.)
  ],
} as const;

export type TimeReportingQualityGate = typeof TIME_REPORTING_QUALITY_GATE;
