#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# STEG 4O – SYNC SQL/E2E GATE
# ─────────────────────────────────────────────────────────────────────────────
#
#   bash scripts/run-sync-e2e.sh
#
# Kör riktiga SQL/E2E-tester mot LOKAL Supabase eller ett EXPLICIT test/staging-
# projekt. Aldrig production (blockeras av scripts/preflight-sync-e2e.sh).
#
# Saknas säker miljö → allt rapporteras NOT EXECUTED och exit 10.
# Ingenting fejkas någonsin som PASS.
#
# Rapport: stdout + reports/sync-e2e-report.json
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

REPORT_DIR="reports"
REPORT_JSON="$REPORT_DIR/sync-e2e-report.json"
mkdir -p "$REPORT_DIR"

SAFE_ENV="FAIL"
R_MIGRATIONS="NOT EXECUTED"
R_BSA_IDENTITY="NOT EXECUTED"
R_BSA_RPC="NOT EXECUTED"
R_SECDEF="NOT EXECUTED"
R_LEASE="NOT EXECUTED"
R_JOBS="NOT EXECUTED"
R_BATCH="NOT EXECUTED"
R_WAREHOUSE="NOT EXECUTED"
R_CANONICAL="NOT EXECUTED"
R_CANCELLATION="NOT EXECUTED"
LOG_DIR="$(mktemp -d)"

results_json() {
  cat <<EOF
{
  "safe_environment": "$SAFE_ENV",
  "results": {
    "migrations": "$R_MIGRATIONS",
    "bsa_tenant_identity": "$R_BSA_IDENTITY",
    "bsa_v2_rpc": "$R_BSA_RPC",
    "security_definer": "$R_SECDEF",
    "revision_lease": "$R_LEASE",
    "worker_jobs": "$R_JOBS",
    "batch_cursor": "$R_BATCH",
    "warehouse_uniqueness": "$R_WAREHOUSE",
    "canonical_error_propagation": "$R_CANONICAL",
    "destructive_cancellation_off": "$R_CANCELLATION"
  }
}
EOF
}

# Enda källan för final-beslutet: scripts/sync-e2e/gate.mjs (fail-closed).
# Sätter globalt FINAL + GATE_EXIT + GATE_REASONS.
compute_gate() {
  local out
  out="$(results_json | node scripts/sync-e2e/gate.mjs)"
  GATE_EXIT=$?
  FINAL="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).final)}catch{process.stdout.write("RED")}})')"
  GATE_REASONS="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s).reasons||[]).join("; "))}catch{process.stdout.write("gate parse error")}})')"
  if [ -z "$FINAL" ]; then FINAL="RED"; GATE_EXIT=1; fi
}

emit_report() {
  local final="$1"

  cat <<EOF

SYNC SQL/E2E GATE
Safe environment: $SAFE_ENV
Migrations: $R_MIGRATIONS
BSA tenant identity: $R_BSA_IDENTITY
BSA V2 RPC: $R_BSA_RPC
SECURITY DEFINER: $R_SECDEF
Revision lease: $R_LEASE
Worker jobs: $R_JOBS
Batch/cursor: $R_BATCH
Warehouse uniqueness: $R_WAREHOUSE
Canonical error propagation: $R_CANONICAL
Destructive cancellation OFF: $R_CANCELLATION

FINAL SQL/E2E GATE: $final
${GATE_REASONS:+Orsak: $GATE_REASONS}
EOF
  cat > "$REPORT_JSON" <<EOF
{
  "gate": "sync_sql_e2e",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "safe_environment": "$SAFE_ENV",
  "results": {
    "migrations": "$R_MIGRATIONS",
    "bsa_tenant_identity": "$R_BSA_IDENTITY",
    "bsa_v2_rpc": "$R_BSA_RPC",
    "security_definer": "$R_SECDEF",
    "revision_lease": "$R_LEASE",
    "worker_jobs": "$R_JOBS",
    "batch_cursor": "$R_BATCH",
    "warehouse_uniqueness": "$R_WAREHOUSE",
    "canonical_error_propagation": "$R_CANONICAL",
    "destructive_cancellation_off": "$R_CANCELLATION"
  },
  "reasons": "${GATE_REASONS:-}",
  "final": "$final"
}
EOF

  echo ""
  echo "Rapport skriven: $REPORT_JSON"
}

# ── 1. PRE-FLIGHT ────────────────────────────────────────────────────────────
GATE_REASONS=""
GATE_EXIT=1
bash scripts/preflight-sync-e2e.sh
PRE=$?
if [ $PRE -ne 0 ]; then
  SAFE_ENV="FAIL"
  echo ""
  echo "SAFE TEST CONFIGURATION NOT PROVIDED"
  echo "NO MUTATIONS EXECUTED"
  compute_gate
  emit_report "$FINAL"
  exit "$GATE_EXIT"
fi
SAFE_ENV="PASS"


run_section() {
  local file="$1"; local name="$2"
  local log="$LOG_DIR/$(basename "$file").log"
  if psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" > "$log" 2>&1; then
    echo "── $name: PASS"
    sed -n '1,80p' "$log"
    return 0
  else
    echo "── $name: FAIL"
    sed -n '1,120p' "$log"
    return 1
  fi
}

# ── 2. MIGRATIONS (clean DB) – OBLIGATORISK för GREEN ────────────────────────
if [ "${E2E_ALLOW_MIGRATION_RESET:-false}" = "true" ] && [ "${E2E_ENVIRONMENT}" = "local" ]; then
  if command -v supabase >/dev/null 2>&1 && supabase db reset --local >/dev/null 2>&1; then
    R_MIGRATIONS="PASS"
  else
    # Ingen supabase CLI → kör riktig migration-compile mot tom scratch-databas.
    MIG_OUT="$(bash scripts/sync-e2e/run-migrations-compile.sh | tail -1)"
    echo "── Migrations (compile mot tom DB): $MIG_OUT"
    case "$MIG_OUT" in
      PASS) R_MIGRATIONS="PASS" ;;
      *) R_MIGRATIONS="FAIL" ;;
    esac
  fi
else
  # Migrations compile testades inte → gaten kan aldrig bli GREEN (fail-closed).
  echo "── Migrations: NOT EXECUTED (E2E_ALLOW_MIGRATION_RESET != true eller ej lokal miljö) → gaten kan inte bli GREEN"
  R_MIGRATIONS="NOT EXECUTED"
fi



# ── 3. SEKTIONER ─────────────────────────────────────────────────────────────
if run_section scripts/sync-e2e/01_bsa_tenant.sql "BSA tenant identity + V2 RPC"; then
  R_BSA_IDENTITY="PASS"; R_BSA_RPC="PASS"
else
  R_BSA_IDENTITY="FAIL"; R_BSA_RPC="FAIL"
fi

run_section scripts/sync-e2e/02_security_definer.sql "SECURITY DEFINER" && R_SECDEF="PASS" || R_SECDEF="FAIL"
run_section scripts/sync-e2e/03_revision_lease.sql "Revision lease" && R_LEASE="PASS" || R_LEASE="FAIL"

if run_section scripts/sync-e2e/04_jobs_batch_cursor.sql "Worker jobs + batch/cursor"; then
  R_JOBS="PASS"; R_BATCH="PASS"
else
  R_JOBS="FAIL"; R_BATCH="FAIL"
fi

run_section scripts/sync-e2e/05_warehouse_unique.sql "Warehouse uniqueness" && R_WAREHOUSE="PASS" || R_WAREHOUSE="FAIL"
run_section scripts/sync-e2e/06_canonical_error.sql "Canonical error propagation" && R_CANONICAL="PASS" || R_CANONICAL="FAIL"
run_section scripts/sync-e2e/07_cancellation_flag_off.sql "Cancellation flag OFF" && R_CANCELLATION="PASS" || R_CANCELLATION="FAIL"

# ── 4. CLEANUP (endast testmiljö, endast E2E-data) ───────────────────────────
psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sync-e2e/99_cleanup.sql >/dev/null 2>&1 \
  && echo "── Cleanup: OK" || echo "── Cleanup: WARN (se testmiljön manuellt)"

# ── 5. RAPPORT (fail-closed gate, se scripts/sync-e2e/gate.mjs) ──────────────
compute_gate
emit_report "$FINAL"
exit "$GATE_EXIT"
