#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# STEG 4O – PRE-FLIGHT SAFETY GATE för SQL/E2E-sync-testerna
# ─────────────────────────────────────────────────────────────────────────────
#
# Detta script gör INGA mutationer. Det avgör bara om det finns en SÄKER
# testmiljö att köra E2E-sviten mot.
#
# Krävda variabler (sätts i din lokala shell, ALDRIG i repot):
#
#   E2E_SAFE_TEST_ENV=true          # explicit bekräftelse
#   E2E_ENVIRONMENT=local|test|staging
#   E2E_SUPABASE_URL=...            # test-projektets URL (ej production)
#   E2E_SUPABASE_SERVICE_ROLE_KEY=... # service role key för TESTprojektet
#   E2E_DATABASE_URL=postgres://... # direkt psql-anslutning till TESTdatabasen
#
# Valfritt:
#   E2E_ALLOW_MIGRATION_RESET=true  # tillåt `supabase db reset` (endast lokalt)
#
# Exit codes:
#   0  = säker miljö bekräftad
#   10 = ingen säker konfiguration (NOT EXECUTED, inga mutationer)
#   20 = productionblockering utlöst
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# Kända production-markörer. Dessa får ALDRIG köras mot.
PROD_PROJECT_REFS=("pihrhltinhewhoxefjxv")
PROD_HOST_MARKERS=("planning.e-flow.se" "kalender-vyer-mix.lovable.app")

fail_not_executed() {
  echo "SAFE TEST CONFIGURATION NOT PROVIDED"
  echo "NO MUTATIONS EXECUTED"
  [ -n "${1:-}" ] && echo "reason: $1"
  exit 10
}

fail_production() {
  echo "PRODUCTION TARGET BLOCKED"
  echo "NO MUTATIONS EXECUTED"
  echo "reason: ${1:-production marker detected}"
  exit 20
}

# 1. Explicit flagga
[ "${E2E_SAFE_TEST_ENV:-}" = "true" ] || fail_not_executed "E2E_SAFE_TEST_ENV != true"

# 2. Environment marker
ENVIRONMENT="${E2E_ENVIRONMENT:-}"
case "$ENVIRONMENT" in
  local|test|staging) ;;
  production|prod|live) fail_production "E2E_ENVIRONMENT=$ENVIRONMENT" ;;
  "") fail_not_executed "E2E_ENVIRONMENT saknas" ;;
  *) fail_not_executed "okänd E2E_ENVIRONMENT=$ENVIRONMENT" ;;
esac

# 3. Obligatoriska värden
[ -n "${E2E_SUPABASE_URL:-}" ] || fail_not_executed "E2E_SUPABASE_URL saknas"
[ -n "${E2E_SUPABASE_SERVICE_ROLE_KEY:-}" ] || fail_not_executed "E2E_SUPABASE_SERVICE_ROLE_KEY saknas"
[ -n "${E2E_DATABASE_URL:-}" ] || fail_not_executed "E2E_DATABASE_URL saknas"

# 4. Production block – URL/DB-URL får inte innehålla kända prod-markörer
for ref in "${PROD_PROJECT_REFS[@]}"; do
  case "${E2E_SUPABASE_URL}${E2E_DATABASE_URL}" in
    *"$ref"*) fail_production "URL matchar production project ref ($ref)" ;;
  esac
done
for marker in "${PROD_HOST_MARKERS[@]}"; do
  case "${E2E_SUPABASE_URL}" in
    *"$marker"*) fail_production "URL matchar production host ($marker)" ;;
  esac
done

# 5. Extra skydd: production service role key från appens .env får inte återanvändas
if [ -f .env ]; then
  if grep -q -- "${E2E_SUPABASE_URL}" .env 2>/dev/null; then
    fail_production "E2E_SUPABASE_URL är samma som projektets .env (production)"
  fi
fi

# 6. psql måste finnas
command -v psql >/dev/null 2>&1 || fail_not_executed "psql saknas i PATH"

# 7. Anslutning + sanity: databasen måste vara tom-ish eller uttryckligen märkt test
CONN_CHECK=$(psql "$E2E_DATABASE_URL" -tAc "select 1" 2>&1)
if [ "$CONN_CHECK" != "1" ]; then
  fail_not_executed "kunde inte ansluta till E2E_DATABASE_URL"
fi

echo "SAFE TEST ENVIRONMENT CONFIRMED"
echo "environment: $ENVIRONMENT"
echo "migration reset allowed: ${E2E_ALLOW_MIGRATION_RESET:-false}"
exit 0
