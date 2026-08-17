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
R_MIGRATIONS="NOT EXECUTED"          # historical migration replay (DIAGNOSTIC)
R_COMPAT="NOT_EXECUTED"              # release migration compatibility (BLOCKING)
COMPAT_REASONS=""
COMPAT_EVIDENCE_JSON="null"
R_SCHEMA="NOT EXECUTED"              # schema provisioning (BLOCKING)
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

# Historical migration replay är alltid diagnostiskt och får aldrig bli PASS.
HISTORICAL_STATUS="UNVERIFIABLE"
HISTORICAL_REASON="Repository history does not contain the original EventFlow database baseline; full historical replay cannot be reconstructed without fabricated schema."

results_json() {
  cat <<EOF
{
  "safe_environment": "$SAFE_ENV",
  "historical_migration_replay": {
    "status": "$HISTORICAL_STATUS",
    "blocking": false
  },
  "results": {
    "release_migration_compatibility": "$R_COMPAT",
    "schema_provisioning": "$R_SCHEMA",
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

# Blockerande compatibility-sektion: strikt, content-bunden evidensvalidering.
evaluate_compatibility() {
  local out
  out="$(node scripts/sync-e2e/evaluate-compatibility.mjs 2>/dev/null)"
  if [ -z "$out" ]; then
    R_COMPAT="FAIL"; COMPAT_REASONS="evaluate-compatibility.mjs gav inget svar"; return
  fi
  COMPAT_EVIDENCE_JSON="$out"
  R_COMPAT="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).status)}catch{process.stdout.write("FAIL")}})')"
  COMPAT_REASONS="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s).reasons||[]).join("; "))}catch{process.stdout.write("")}})')"
  [ -n "$R_COMPAT" ] || R_COMPAT="FAIL"
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

BOOKING→PLANNING SQL/E2E RELEASE GATE
Safe environment: $SAFE_ENV
Historical migration replay: $HISTORICAL_STATUS (DIAGNOSTIC / NON_RELEASE_BLOCKING)
  reason: $HISTORICAL_REASON
  raw migration compile: $R_MIGRATIONS (reports/sync-e2e-migrations.json)
Release migration compatibility: $R_COMPAT (BLOCKING)
${COMPAT_REASONS:+  orsak: $COMPAT_REASONS}
Schema provisioning: $R_SCHEMA (BLOCKING, contract fixture + release migrations)
BSA tenant identity: $R_BSA_IDENTITY
BSA V2 RPC: $R_BSA_RPC
SECURITY DEFINER: $R_SECDEF
Revision lease: $R_LEASE
Worker jobs: $R_JOBS
Batch/cursor: $R_BATCH
Warehouse uniqueness: $R_WAREHOUSE
Canonical error propagation: $R_CANONICAL
Destructive cancellation OFF: $R_CANCELLATION

BOOKING→PLANNING SQL/E2E RELEASE GATE: $final
${GATE_REASONS:+Orsak: $GATE_REASONS}
EOF
  node -e '
    const fs = require("fs");
    const [final, safeEnv, hist, histReason, rawMig, migFirst, migSummary, compatStatus, compatReasons, compatEvidence, gateReasons, schemaStatus, ...sections] = process.argv.slice(1);
    const keys = ["bsa_tenant_identity","bsa_v2_rpc","security_definer","revision_lease","worker_jobs","batch_cursor","warehouse_uniqueness","canonical_error_propagation","destructive_cancellation_off"];
    const results = { release_migration_compatibility: compatStatus };
    keys.forEach((k,i) => { results[k] = sections[i]; });
    let evidence = null; try { evidence = JSON.parse(compatEvidence); } catch {}
    fs.writeFileSync("reports/sync-e2e-report.json", JSON.stringify({
      gate: "booking_planning_sql_e2e_release_gate",
      generated_at: new Date().toISOString(),
      release_run_id: process.env.BOOKING_PLANNING_RELEASE_RUN_ID || null,
      schema_provisioning: {
        status: schemaStatus,
        method: "contract_fixture_plus_release_migrations",
        blocking: true,
      },
      safe_environment: safeEnv,
      historical_migration_replay: {
        status: hist,
        classification: "DIAGNOSTIC / NON_RELEASE_BLOCKING",
        blocking: false,
        reason: histReason,
        baseline_classification: "B",
        provenance_classification: "P2",
        raw_migration_compile: rawMig,
        first_failure: migFirst || null,
        error_summary: migSummary || null,
        log: "reports/sync-e2e-migrations.log",
        evidence_txt: "reports/sync-e2e-migrations.txt",
        report: "reports/sync-e2e-migrations.json",
      },
      release_migration_compatibility: {
        status: compatStatus,
        blocking: true,
        reasons: compatReasons ? compatReasons.split("; ") : [],
        evidence: evidence?.evidence ?? null,
      },
      results,
      reasons: gateReasons || "",
      final,
    }, null, 2) + "\n");
  ' "$final" "$SAFE_ENV" "$HISTORICAL_STATUS" "$HISTORICAL_REASON" "$R_MIGRATIONS" \
    "${MIG_FIRST_FAILURE:-}" "${MIG_ERROR_SUMMARY:-}" "$R_COMPAT" "$COMPAT_REASONS" "$COMPAT_EVIDENCE_JSON" \
    "${GATE_REASONS:-}" "$R_SCHEMA" "$R_BSA_IDENTITY" "$R_BSA_RPC" "$R_SECDEF" "$R_LEASE" "$R_JOBS" "$R_BATCH" \
    "$R_WAREHOUSE" "$R_CANONICAL" "$R_CANCELLATION"

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

# ── 2. HISTORICAL MIGRATION REPLAY (DIAGNOSTIC, NON_RELEASE_BLOCKING) ────────
# Rapporteras alltid ärligt. Ingen fake-GREEN, ingen skippad 2025-historik.
MIG_FIRST_FAILURE=""
MIG_ERROR_SUMMARY=""
if [ "${E2E_ALLOW_MIGRATION_RESET:-false}" = "true" ] && [ "${E2E_ENVIRONMENT}" = "local" ]; then
  if command -v supabase >/dev/null 2>&1 && supabase db reset --local >/dev/null 2>&1; then
    R_MIGRATIONS="PASS"
  else
    # Ingen supabase CLI → kör riktig migration-compile mot tom scratch-databas.
    MIG_OUT="$(bash scripts/sync-e2e/run-migrations-compile.sh | tail -1)"
    echo "── Historical migration replay (compile mot tom DB): $MIG_OUT"
    case "$MIG_OUT" in
      PASS) R_MIGRATIONS="PASS" ;;
      *) R_MIGRATIONS="FAIL" ;;
    esac
  fi
else
  echo "── Historical migration replay: NOT EXECUTED (diagnostic)"
  R_MIGRATIONS="NOT EXECUTED"
fi

if [ -f reports/sync-e2e-migrations.json ]; then
  MIG_FIRST_FAILURE="$(node -e 'const j=require("./reports/sync-e2e-migrations.json");process.stdout.write(j.first_failure||"")')"
  MIG_ERROR_SUMMARY="$(node -e 'const j=require("./reports/sync-e2e-migrations.json");process.stdout.write(j.first_failure?`SQLSTATE ${j.sqlstate||"unknown"} @ line ${j.statement_line||"?"}: ${(j.error_message||"").replace(/"/g,"\u0027")} (ok ${j.ok}/${j.total})`:"")')"
fi

# ── 2b. RELEASE MIGRATION COMPATIBILITY (BLOCKERANDE) ────────────────────────
evaluate_compatibility
echo "── Release migration compatibility: $R_COMPAT${COMPAT_REASONS:+ ($COMPAT_REASONS)}"

# ── 2c. SCHEMA PROVISIONING (BLOCKERANDE) ────────────────────────────────────
# SQL/E2E-sektionerna kräver ett schema. Historisk replay är UNVERIFIABLE, så
# schemat byggs från det verifierade compatibility-kontraktet:
#   supabase-shim + contract fixture + verified prestate + de 12 release-
#   migrationerna. Exakt samma filer som release_migration_compatibility PASS
#   bevisar. Ingen mutation sker utan lokal miljö + explicit flagga.
provision_schema() {
  local HERE="scripts/sync-e2e/release-migration-compat"
  local plog="$LOG_DIR/schema-provisioning.log"

  if [ "${E2E_ENVIRONMENT}" != "local" ]; then
    R_SCHEMA="NOT EXECUTED"
    echo "── Schema provisioning: NOT EXECUTED (endast local)"
    return 1
  fi
  if [ "${E2E_ALLOW_SCHEMA_PROVISION:-}" != "true" ]; then
    R_SCHEMA="NOT EXECUTED"
    echo "── Schema provisioning: NOT EXECUTED (E2E_ALLOW_SCHEMA_PROVISION != true)"
    return 1
  fi

  local files=(
    scripts/sync-e2e/bootstrap_supabase_shim.sql
    "$HERE/fixture.sql"
    supabase/migrations/20260805053328_85ea3d0f-e442-48da-b202-7abd2eccb8ff.sql
    supabase/migrations/20260429183626_192dd820-b4ba-4ce3-9aef-3612c2c40a47.sql
    "$HERE/fixture_bsa_legacy_identity.sql"
    "$HERE/variant_wce_legacy_constraint.sql"
  )
  mapfile -t REL_MIGRATIONS < <(node -e '
    const fs = require("fs");
    const src = fs.readFileSync("src/test/syncReleaseMigrationScope.manifest.ts","utf8");
    const body = src.split("SYNC_RELEASE_MIGRATIONS")[1] || "";
    for (const m of body.matchAll(/'"'"'([0-9]{14}_[0-9a-f-]+\.sql)'"'"'/g)) console.log(m[1]);
  ')
  for m in "${REL_MIGRATIONS[@]}"; do files+=("supabase/migrations/$m"); done

  : > "$plog"
  for f in "${files[@]}"; do
    if ! psql "$E2E_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >>"$plog" 2>&1; then
      R_SCHEMA="FAIL"
      echo "── Schema provisioning: FAIL vid $f"
      tail -20 "$plog"
      return 1
    fi
  done
  R_SCHEMA="PASS"
  echo "── Schema provisioning: PASS (${#files[@]} filer, ${#REL_MIGRATIONS[@]} release-migrationer)"
  return 0
}

provision_schema
if [ "$R_SCHEMA" != "PASS" ]; then
  # Fail-closed: utan schema körs INGA sektioner och inget rapporteras som PASS.
  compute_gate
  emit_report "$FINAL"
  exit "$GATE_EXIT"
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
