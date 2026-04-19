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
 * Tidrapporteringen vilar på arkitekturbeslut (se memory-filer):
 *
 *   1. mem://architecture/time-reporting-write-path-v1
 *      `mobile-app-api` är ENDA officiell skrivväg för time_reports.
 *      Den gamla `time-reports` edge-funktionen är retired (HTTP 410).
 *      DB-triggers är yttersta backstop.
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
 *   5. mem://features/field-staff/work-session-engine-v1
 *      `useWorkSession` är gemensam motor för booking/project/location.
 *      INGEN automatisk rast längre; assistenten ställer frågor.
 *
 *   6. mem://features/field-staff/end-day-vs-end-activity-v1
 *      Två explicita stoppvägar: stopSession (en signal) vs endDay
 *      (alla signaler + EOD-rekonciliering).
 *
 *   7. mem://features/field-staff/workday-flags-v1
 *      `workday_flags` är förstklassig store för arbetsdags-osäkerhet.
 *      Skild från `time_report_anomalies`. Ändrar aldrig rapporterad tid.
 *
 *   8. mem://features/field-staff/travel-time-in-reports-v1
 *      Travel-loggar är SEPARATA från arbetstid; egen API-väg.
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
   *   - Arbetsdagsmotorn: ingen auto-rast, assistent-beslut, end-activity vs
   *     end-day, gemensam session-motor, travel-separation, workday-flags
   */
  frontend: [
    // Samlad produktnivå-svit för time-reports skrivvägen.
    'src/test/timeReportingProduct.contract.test.ts',

    // Arbetsdagsmotorn — assistent-beslut, save-then-stop, travel,
    // workday_flags och end-activity vs end-day-kontraktet.
    'src/test/workDayEngine.contract.test.ts',

    // End-of-day-stop-dialogens regelset (tid-rullning, beskrivningskrav).
    'src/test/endOfDayStop.contract.test.ts',

    // Recovery-kontrakt: dedupe-start, retry på nätverksfel, EOD pendingStop
    // survival över app-omstart. Låser in robusthetsgarantierna som Fas 1+2
    // inte får bryta.
    'src/test/timeReportingRecovery.contract.test.ts',

    // Befintliga rena beräknings/summering-tester.
    'src/test/projectStaff.test.ts',
  ],

  /**
   * Backend-tester (deno test mot mobile-app-api edge function).
   * Verifierar serverkontraktet:
   *   - time_reports CRUD (auth, payload-validering, ingen bypass)
   *   - workday_flags CRUD (auth, vokabulär, resolution_source-katalog)
   *   - timer-relaterade endpoints kräver auth + giltig payload
   */
  backend: [
    'supabase/functions/mobile-app-api/timeReports.test.ts',
    'supabase/functions/mobile-app-api/workdayFlags.test.ts',
  ],
} as const;

export type TimeReportingQualityGate = typeof TIME_REPORTING_QUALITY_GATE;
