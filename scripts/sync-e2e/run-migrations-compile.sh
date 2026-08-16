#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Migrations compile mot en TOM databas (fail-closed, ingen fejkad PASS).
#
# Körs endast efter godkänd preflight. Skapar och droppar en scratch-databas
# ("<db>_migtest") i den ISOLERADE testinstansen – rör aldrig production.
#
# Utskrift: "PASS" eller "FAIL <ok>/<total>" på sista raden.
# Detaljlogg: $E2E_MIGRATION_LOG (default /tmp/sync-e2e-migrations.log)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/../.."

LOG="${E2E_MIGRATION_LOG:-/tmp/sync-e2e-migrations.log}"
: > "$LOG"

BASE_URL="${E2E_DATABASE_URL:-}"
if [ -z "$BASE_URL" ]; then echo "FAIL 0/0 (E2E_DATABASE_URL saknas)"; exit 1; fi

# Härled admin-URL (postgres) och scratch-databasnamn
ADMIN_URL="$(printf '%s' "$BASE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
SCRATCH_DB="sync_e2e_migtest"
SCRATCH_URL="$(printf '%s' "$BASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$SCRATCH_DB\1#")"

psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $SCRATCH_DB" >>"$LOG" 2>&1
psql "$ADMIN_URL" -q -c "CREATE DATABASE $SCRATCH_DB" >>"$LOG" 2>&1 || { echo "FAIL 0/0 (kunde inte skapa scratch-db)"; exit 1; }

# Supabase-shim (roller, scheman, auth/storage-stubbar)
psql "$SCRATCH_URL" -q -f scripts/sync-e2e/bootstrap_supabase_shim.sql >>"$LOG" 2>&1

OK=0; TOTAL=0; FIRST_FAIL=""
for f in $(ls supabase/migrations/*.sql | sort); do
  TOTAL=$((TOTAL+1))
  if psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 -q -f "$f" >>"$LOG" 2>&1; then
    OK=$((OK+1))
  else
    echo "MIGRATION FAILED: $f" >> "$LOG"
    [ -z "$FIRST_FAIL" ] && FIRST_FAIL="$f"
  fi
done

psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $SCRATCH_DB" >>"$LOG" 2>&1

if [ "$OK" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
  echo "PASS"
  exit 0
fi
echo "FAIL $OK/$TOTAL (första fel: ${FIRST_FAIL:-okänt}, logg: $LOG)"
exit 1
