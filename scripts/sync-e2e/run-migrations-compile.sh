#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Migrations compile mot en TOM databas (fail-closed, ingen fejkad PASS).
#
# STEG 4V: fail-fast på FÖRSTA verkliga migrationsfelet så att kaskadfel inte
# döljer grundorsaken. SQLSTATE + felande statement sparas persistent i
# reports/sync-e2e-migrations.log (inte bara /tmp).
#
# Körs endast efter godkänd preflight. Skapar och droppar en scratch-databas
# ("sync_e2e_migtest") i den ISOLERADE testinstansen – rör aldrig production.
#
# Utskrift (sista raden): "PASS" eller "FAIL <ok>/<total>"
# Maskinläsbara fakta: reports/sync-e2e-migrations.json
#   { first_failure, sqlstate, error_message, statement_line, ok, total }
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/../.."

mkdir -p reports
LOG="${E2E_MIGRATION_LOG:-reports/sync-e2e-migrations.log}"
FACTS="reports/sync-e2e-migrations.json"
: > "$LOG"

write_facts() {
  # $1=first_failure $2=sqlstate $3=error_message $4=statement_line $5=ok $6=total
  node -e '
    const [f,s,m,l,ok,total] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({
      first_failure: f || null,
      sqlstate: s || null,
      error_message: m || null,
      statement_line: l || null,
      ok: Number(ok), total: Number(total),
      log: "reports/sync-e2e-migrations.log",
    }, null, 2) + "\n");
  ' "$1" "$2" "$3" "$4" "$5" "$6" > "$FACTS"
}

BASE_URL="${E2E_DATABASE_URL:-}"
if [ -z "$BASE_URL" ]; then
  echo "E2E_DATABASE_URL saknas" >> "$LOG"
  write_facts "" "" "E2E_DATABASE_URL saknas" "" 0 0
  echo "FAIL 0/0 (E2E_DATABASE_URL saknas)"; exit 1
fi

ADMIN_URL="$(printf '%s' "$BASE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
SCRATCH_DB="sync_e2e_migtest"
SCRATCH_URL="$(printf '%s' "$BASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$SCRATCH_DB\1#")"

psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $SCRATCH_DB" >>"$LOG" 2>&1
psql "$ADMIN_URL" -q -c "CREATE DATABASE $SCRATCH_DB" >>"$LOG" 2>&1 || {
  write_facts "" "" "kunde inte skapa scratch-db" "" 0 0
  echo "FAIL 0/0 (kunde inte skapa scratch-db)"; exit 1; }

# Supabase-shim (roller, scheman, auth/storage-stubbar) – motsvarar det riktig
# Supabase alltid tillhandahåller innan första migrationen körs.
psql "$SCRATCH_URL" -q -f scripts/sync-e2e/bootstrap_supabase_shim.sql >>"$LOG" 2>&1

FILES=$(ls supabase/migrations/*.sql | sort)
TOTAL=$(printf '%s\n' "$FILES" | grep -c . )
OK=0
FIRST_FAIL=""
SQLSTATE=""
ERRMSG=""
ERRLINE=""

for f in $FILES; do
  ERRFILE="$(mktemp)"
  if psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 -q \
        --set=VERBOSITY=verbose --set=SHOW_CONTEXT=errors \
        -f "$f" >>"$LOG" 2>"$ERRFILE"; then
    cat "$ERRFILE" >> "$LOG"
    OK=$((OK+1))
    rm -f "$ERRFILE"
  else
    cat "$ERRFILE" >> "$LOG"
    FIRST_FAIL="$f"
    SQLSTATE="$(grep -oE '^SQLSTATE: [0-9A-Z]{5}' "$ERRFILE" | head -1 | awk '{print $2}')"
    if [ -z "$SQLSTATE" ]; then
      # psql skriver SQLSTATE endast i verbose-läge; hämta via separat körning
      SQLSTATE="$(grep -oE 'SQLSTATE [0-9A-Z]{5}' "$ERRFILE" | head -1 | awk '{print $2}')"
    fi
    ERRMSG="$(grep -m1 'ERROR:' "$ERRFILE" | sed 's/.*ERROR:  *//')"
    if [ -z "$SQLSTATE" ]; then
      # psql --set=VERBOSITY=verbose prefixar meddelandet med SQLSTATE-koden
      SQLSTATE="$(printf '%s' "$ERRMSG" | grep -oE '^[0-9A-Z]{5}(?=:)' 2>/dev/null || printf '%s' "$ERRMSG" | sed -nE 's/^([0-9A-Z]{5}): .*/\1/p')"
    fi
    ERRLINE="$(grep -m1 -oE ':[0-9]+: ERROR' "$ERRFILE" | tr -d ':' | sed 's/ ERROR//')"
    {
      echo "=============================================================="
      echo "FIRST MIGRATION FAILURE (fail-fast, körningen avbryts här)"
      echo "file:      $f"
      echo "sqlstate:  ${SQLSTATE:-unknown}"
      echo "line:      ${ERRLINE:-unknown}"
      echo "error:     ${ERRMSG:-unknown}"
      echo "--- raw psql stderr ---"
      cat "$ERRFILE"
      echo "=============================================================="
    } >> "$LOG"
    rm -f "$ERRFILE"
    break
  fi
done

psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $SCRATCH_DB" >>"$LOG" 2>&1

# Exportbart bevis: *.log är gitignorerad, därför speglas loggen till en .txt
# som följer med i export/zip. Påverkar INTE vad som räknas som PASS/FAIL.
EVIDENCE_TXT="reports/sync-e2e-migrations.txt"
{
  echo "sync-e2e migrations evidence (mirror of $LOG)"
  echo "generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "first_failure: ${FIRST_FAIL:-none}"
  echo "sqlstate:      ${SQLSTATE:-none}"
  echo "line:          ${ERRLINE:-none}"
  echo "error:         ${ERRMSG:-none}"
  echo "ok/total:      $OK/$TOTAL"
  echo "--------------------------------------------------------------"
  cat "$LOG" 2>/dev/null
} > "$EVIDENCE_TXT"

if [ -z "$FIRST_FAIL" ] && [ "$OK" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
  write_facts "" "" "" "" "$OK" "$TOTAL"
  echo "PASS"
  exit 0
fi

write_facts "$FIRST_FAIL" "${SQLSTATE:-}" "${ERRMSG:-}" "${ERRLINE:-}" "$OK" "$TOTAL"
echo "FAIL $OK/$TOTAL (första fel: ${FIRST_FAIL:-okänt} — ${ERRMSG:-okänt}, logg: $LOG)"
exit 1
