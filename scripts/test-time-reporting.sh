#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Time-reporting quality gate
# ─────────────────────────────────────────────────────────────────────────────
#
# Kör hela tidrapporterings-kvalitetspaketet i ETT kommando:
#
#   bash scripts/test-time-reporting.sh
#
# eller (om filen är körbar):
#
#   ./scripts/test-time-reporting.sh
#
# Den officiella time-reporting quality gate består av:
#
#   1. Frontend (vitest, jsdom)
#      - src/test/timeReportingProduct.contract.test.ts  ← samlad produktnivå-svit
#                                                          (create/edit/delete,
#                                                          approved-lock, overlap,
#                                                          mjuk timer-spärr,
#                                                          booking/project/location
#                                                          timer start, pending-sync
#                                                          retry, save-then-stop,
#                                                          stale-warning,
#                                                          admin/web-vägen)
#      - src/test/projectStaff.test.ts                   ← rena summeringar/format
#
#   2. Backend (deno test mot mobile-app-api)
#      - (lägg till dedikerade Deno-tester här när de skrivs)
#
# Lägg till nya time-reporting-tester här OCH i src/test/timeReporting.manifest.ts
# så ingår de automatiskt i kvalitetsspärren.
#
# Källa-i-sanning för vilka tester som ingår: src/test/timeReporting.manifest.ts
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FRONTEND_TESTS=(
  "src/test/timeReportingProduct.contract.test.ts"
  # Arbetsdagsmotorn: ingen auto-rast, save-then-stop, end-activity vs end-day,
  # gemensam session-motor, travel-separation, workday_flags, assistent-beslut.
  "src/test/workDayEngine.contract.test.ts"
  # End-of-day-stop-dialogens regelset (suggested vs custom, natt-rullning,
  # beskrivningskrav).
  "src/test/endOfDayStop.contract.test.ts"
  # Recovery-kontrakt: dedupe-start, retry på nätverksfel, EOD pendingStop
  # survival. Låser in robusthetsgarantierna inför Fas 1+2.
  "src/test/timeReportingRecovery.contract.test.ts"
  # Start-härdning (PROMPT 2): payload-dedupe per target-typ, offline-survival
  # av payload-fält över crash, logout/login-cleanup för cross-user-säkerhet.
  "src/test/timeReportingStartHardening.contract.test.ts"
  # Aktiv-tid-härdning (PROMPT 3): pendingSync-recovery + storage-filter +
  # sync-queue-idempotens.
  "src/test/activeSessionHardening.contract.test.ts"
  # Avsluta-dag-härdning (PROMPT 4): save-then-stop-ordning, server-side
  # idempotency, EOD-dialog stays open vid save-fail, sekventiell EOD-
  # processing.
  "src/test/endDayHardening.contract.test.ts"
  # Edge-case-härdning (PROMPT 5): 10 verkliga driftsscenarier — app-kill,
  # nät dör under start/stop, reload, dubbeltryck, logout/login med aktiv
  # session, korrupt kö, server-timeout, osäker target.
  "src/test/edgeCaseHardening.contract.test.ts"
  # Location-presence livscykel (A–K): regressionsskydd för Ranjan-fallet +
  # de 7 öppna raderna 20 april. Verifierar att alla stop-vägar stänger
  # location_time_entries oavsett source (gps/manual).
  "src/test/locationPresenceLifecycle.contract.test.ts"
  # End-of-day reconciliation (L–R): EOD stänger allt, save-then-stop
  # atomicitet, server-idempotens, dialog stays open vid fel, pending-stop
  # survival över app-omstart.
  "src/test/endDayReconciliation.contract.test.ts"
  "src/test/projectStaff.test.ts"
  # Unified arrival prompt (parity-suite): låser fast att Lager / stort
  # projekt / vanlig bokning visar EXAKT samma promptstruktur, samma CTA,
  # samma payload till onConfirm/onDismiss. Utan dessa tester driver de
  # tre kindarna isär igen.
  "src/test/unifiedArrivalPrompt.parity.test.tsx"
  # useArrivalPrompt — generisk target-shape: server/legacy normalisering
  # och markResolved skickar (target_type, target_id, arrived_at) för
  # alla tre kindar.
  "src/test/arrivalPromptHook.parity.test.ts"
)

BACKEND_TESTS=(
  # time_reports skrivvägen: auth, payload, admin-vägen, idempotent timers.
  "supabase/functions/mobile-app-api/timeReports.test.ts"
  # workday_flags skrivvägen: auth, vokabulär, resolution_source-katalog.
  "supabase/functions/mobile-app-api/workdayFlags.test.ts"
  # Stale-entry auto-close (S–Z): server-side stängningsregler för
  # location_time_entries. Auth-guard mot cron + kontrakt för stop-endpoint.
  # Tester som beror på (kommande) close-stale-location-entries är ignored.
  "supabase/functions/mobile-app-api/staleEntryAutoClose.test.ts"
  # Unified arrival API parity (location/project/booking): report_arrival,
  # mark_arrival_resolved och get_arrival_state måste behandla alla tre
  # target-kindar likadant på auth/validation-ytan.
  "supabase/functions/mobile-app-api/arrivalParity_test.ts"
)

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
gray()  { printf "\033[90m%s\033[0m\n" "$*"; }

bold "▶ Time-reporting quality gate"
gray "  Frontend tests: ${#FRONTEND_TESTS[@]}"
gray "  Backend tests:  ${#BACKEND_TESTS[@]}"
echo

FRONTEND_RC=0
BACKEND_RC=0

# ── 1. Frontend ──
bold "── 1/2  Frontend (vitest) ──"
if command -v npx >/dev/null 2>&1; then
  # Kör en fil i taget för att undvika mock-läckage mellan suiter.
  for f in "${FRONTEND_TESTS[@]}"; do
    echo
    bold "  • $f"
    if ! npx vitest run "$f"; then
      FRONTEND_RC=1
    fi
  done
else
  red "  npx saknas – kan inte köra vitest"
  FRONTEND_RC=127
fi

# ── 2. Backend ──
echo
bold "── 2/2  Backend (deno test, mobile-app-api) ──"
if [ "${#BACKEND_TESTS[@]}" -eq 0 ]; then
  gray "  (inga dedikerade Deno-tester ännu — hoppar över)"
elif command -v deno >/dev/null 2>&1; then
  for f in "${BACKEND_TESTS[@]}"; do
    echo
    bold "  • $f"
    if ! deno test --allow-net --allow-env --allow-read "$f"; then
      BACKEND_RC=1
    fi
  done
else
  gray "  deno saknas – hoppar över backend-svit (kör i CI eller lokalt med Deno installerat)"
fi

# ── Slutsummering ──
echo
bold "── Resultat ──"
if [ "$FRONTEND_RC" -eq 0 ]; then green "  ✔ Frontend: PASS"; else red "  ✘ Frontend: FAIL"; fi
if [ "$BACKEND_RC"  -eq 0 ]; then green "  ✔ Backend:  PASS"; else red "  ✘ Backend:  FAIL"; fi

if [ "$FRONTEND_RC" -ne 0 ] || [ "$BACKEND_RC" -ne 0 ]; then
  exit 1
fi
exit 0
