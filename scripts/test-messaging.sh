#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Messaging quality gate
# ─────────────────────────────────────────────────────────────────────────────
#
# Kör hela messaging-kvalitetspaketet i ETT kommando:
#
#   bash scripts/test-messaging.sh
#
# eller (om filen är körbar):
#
#   ./scripts/test-messaging.sh
#
# Den officiella messaging quality gate består av två delar:
#
#   1. Frontend (vitest, jsdom)
#      - src/test/messagingProduct.contract.test.ts  ← samlad produktnivå-svit
#      - src/test/chatFlow.test.ts                   ← UI-helper (avatar initials)
#      - src/services/__tests__/mobileApiService.chat.test.ts
#      - src/services/__tests__/directMessageService.test.ts
#      - src/services/__tests__/jobChatService.test.ts
#
#   2. Backend (deno test mot mobile-app-api)
#      - supabase/functions/mobile-app-api/messaging.test.ts
#
# Lägg till nya messaging-tester i båda listorna nedan så ingår de
# automatiskt i kvalitetsspärren.
#
# Källa-i-sanning för vilka tester som ingår: src/test/messaging.manifest.ts
# (samma lista används av npx vitest run – håll synkad).
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FRONTEND_TESTS=(
  "src/test/messagingProduct.contract.test.ts"
  "src/test/chatFlow.test.ts"
  "src/services/__tests__/mobileApiService.chat.test.ts"
  "src/services/__tests__/directMessageService.test.ts"
  "src/services/__tests__/jobChatService.test.ts"
)

BACKEND_TESTS=(
  "supabase/functions/mobile-app-api/messaging.test.ts"
)

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
gray()  { printf "\033[90m%s\033[0m\n" "$*"; }

bold "▶ Messaging quality gate"
gray "  Frontend tests: ${#FRONTEND_TESTS[@]}"
gray "  Backend tests:  ${#BACKEND_TESTS[@]}"
echo

FRONTEND_RC=0
BACKEND_RC=0

# ── 1. Frontend ──
bold "── 1/2  Frontend (vitest) ──"
if command -v npx >/dev/null 2>&1; then
  # Kör alla frontend-test serialiserat (en fil i taget) för att undvika
  # mock-läckage mellan suiter som mockar fetch vs supabase.functions.invoke.
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
if command -v deno >/dev/null 2>&1; then
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
