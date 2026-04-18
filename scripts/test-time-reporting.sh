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
  "src/test/projectStaff.test.ts"
)

BACKEND_TESTS=(
  # Inga dedikerade Deno-tester ännu för time-reporting-vägen.
  # När de läggs till: ange relativ sökväg, t.ex.
  # "supabase/functions/mobile-app-api/timeReports.test.ts"
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
