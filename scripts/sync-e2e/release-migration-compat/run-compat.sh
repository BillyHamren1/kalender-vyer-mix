#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# STEG 4Z/5A · release_migration_compatibility (hardened)
#
# Kör de 12 Booking→Planning-release-migrationerna sekventiellt mot ett strikt
# definierat COMPATIBILITY CONTRACT SCHEMA (fixture) och verifierar slutläget.
#
# Detta är INTE historisk replay och rekonstruerar ingen saknad baseline.
#
# SÄKERHET (5A):
#   - Ingen CREATE/DROP DATABASE, ingen fixture-SQL och ingen migration körs
#     innan scripts/preflight-sync-e2e.sh har godkänt miljön.
#   - Harnessen kräver dessutom E2E_ENVIRONMENT=local och den explicita flaggan
#     E2E_ALLOW_COMPAT_DATABASE_CREATE_DROP=true.
#   - Scratch-databaser får unika namn (ef_sync_compat_<runid>_*) och droppas
#     ENDAST om just den här processen skapade dem (trap-baserad cleanup).
#
# Resultat: reports/sync-release-migration-compatibility.json (+ .txt evidens)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/../../.."

HERE="scripts/sync-e2e/release-migration-compat"
REPORT="reports/sync-release-migration-compatibility.json"
EVIDENCE_TXT="reports/sync-release-migration-compatibility.txt"
LOG="reports/sync-release-migration-compatibility.log"
DISCLAIMER="This compatibility harness does not prove historical migration replay or reconstruct the missing historical EventFlow baseline."
mkdir -p reports
: > "$LOG"

SETUP_JSON="[]"
RESULTS_JSON="[]"
POSTCOND_JSON="{}"
VARIANTS_RUN=()
CREATED_DBS=()
FIRST_FAILURE=""
FIRST_SQLSTATE=""
FIRST_VARIANT=""
TOTAL_EXECUTED=0
TOTAL_PASSED=0
TOTAL_FAILED=0
MUTATIONS_EXECUTED=false
SAFE_ENVIRONMENT="FAIL"
CLEANUP_STATUS="NOT_REQUIRED"
SCOPE_SIZE=0
EXPECTED_TOTAL=0

add_setup_step() { # name started completed result sqlstate error
  SETUP_JSON="$(node -e '
    const a=JSON.parse(process.argv[1]);
    a.push({step:process.argv[2],started:process.argv[3]==="true",completed:process.argv[4]==="true",result:process.argv[5],sqlstate:process.argv[6]||null,error:process.argv[7]||null});
    console.log(JSON.stringify(a));' "$SETUP_JSON" "$1" "$2" "$3" "$4" "${5:-}" "${6:-}")"
}

write_report() { # classification
  local cls="$1"
  local not_executed=$(( EXPECTED_TOTAL - TOTAL_EXECUTED ))
  [ "$not_executed" -lt 0 ] && not_executed=0
  node -e '
    const [cls,env,safeEnv,mut,cleanup,scope,expected,executed,passed,failed,notExec,results,setup,postcond,firstFail,sqlstate,variants,disclaimer] = process.argv.slice(1);
    const fs=require("fs");
    fs.writeFileSync("reports/sync-release-migration-compatibility.json", JSON.stringify({
      harness: "release_migration_compatibility",
      generated_at: new Date().toISOString(),
      classification: cls,
      safe_environment: safeEnv,
      environment: env || null,
      mutations_executed: mut === "true",
      cleanup_status: cleanup,
      scope_source: "src/test/syncReleaseMigrationScope.manifest.ts",
      scope_size: Number(scope),
      migrations_expected: Number(expected),
      migrations_executed: Number(executed),
      migrations_passed: Number(passed),
      migrations_failed: Number(failed),
      migrations_not_executed: Number(notExec),
      variants_executed: variants.split(",").filter(Boolean),
      setup_steps: JSON.parse(setup),
      migrations: JSON.parse(results),
      postconditions: JSON.parse(postcond),
      first_failure: firstFail || null,
      sqlstate: sqlstate || null,
      fixture_objects: JSON.parse(fs.readFileSync("scripts/sync-e2e/release-migration-compat/fixture-provenance.json","utf8")),
      disclaimer,
      log: "reports/sync-release-migration-compatibility.log",
      evidence_txt: "reports/sync-release-migration-compatibility.txt",
    }, null, 2) + "\n");
  ' "$cls" "${E2E_ENVIRONMENT:-}" "$SAFE_ENVIRONMENT" "$MUTATIONS_EXECUTED" "$CLEANUP_STATUS" \
    "$SCOPE_SIZE" "$EXPECTED_TOTAL" "$TOTAL_EXECUTED" "$TOTAL_PASSED" "$TOTAL_FAILED" "$not_executed" \
    "$RESULTS_JSON" "$SETUP_JSON" "$POSTCOND_JSON" "$FIRST_FAILURE" "$FIRST_SQLSTATE" \
    "$(IFS=,; echo "${VARIANTS_RUN[*]:-}")" "$DISCLAIMER"

  # Exportbar evidens (ingen connection string / inga credentials skrivs någonsin
  # till loggen; psql-URL:er ekas aldrig av harnessen).
  {
    echo "release_migration_compatibility evidence"
    echo "generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "classification:      $cls"
    echo "safe_environment:    $SAFE_ENVIRONMENT"
    echo "environment:         ${E2E_ENVIRONMENT:-none}"
    echo "mutations_executed:  $MUTATIONS_EXECUTED"
    echo "cleanup_status:      $CLEANUP_STATUS"
    echo "scope_size:          $SCOPE_SIZE"
    echo "migrations:          $TOTAL_PASSED passed / $TOTAL_EXECUTED executed / $EXPECTED_TOTAL expected"
    echo "variants:            ${VARIANTS_RUN[*]:-none}"
    echo "first_failure:       ${FIRST_FAILURE:-none}"
    echo "sqlstate:            ${FIRST_SQLSTATE:-none}"
    echo "disclaimer:          $DISCLAIMER"
    echo "--------------------------------------------------------------"
    cat "$LOG" 2>/dev/null
  } > "$EVIDENCE_TXT"
}

fail_closed() { # reason exit_code
  FIRST_FAILURE="${FIRST_FAILURE:-$1}"
  echo "$1" >> "$LOG"
  write_report "COMPATIBILITY_FAIL"
  echo "COMPATIBILITY_FAIL ($1)"
  exit "${2:-1}"
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. FAIL-CLOSED SAFETY – körs FÖRE varje databasmutation
# ─────────────────────────────────────────────────────────────────────────────
PREFLIGHT_OUT="$(bash scripts/preflight-sync-e2e.sh 2>&1)"
PREFLIGHT_RC=$?
echo "$PREFLIGHT_OUT" >> "$LOG"
if [ "$PREFLIGHT_RC" -ne 0 ]; then
  add_setup_step "preflight_safe_environment" true true FAIL "" "preflight rc=$PREFLIGHT_RC"
  fail_closed "SAFE TEST CONFIGURATION NOT PROVIDED – NO MUTATIONS EXECUTED (preflight rc=$PREFLIGHT_RC)" 10
fi

# Extra krav: compat-harnessen skapar/droppar databaser → endast LOCAL.
if [ "${E2E_ENVIRONMENT:-}" != "local" ]; then
  add_setup_step "compat_local_only" true true FAIL "" "E2E_ENVIRONMENT=${E2E_ENVIRONMENT:-none} (kräver local)"
  fail_closed "COMPAT DATABASE CREATE/DROP IS LOCAL-ONLY – NO MUTATIONS EXECUTED (E2E_ENVIRONMENT=${E2E_ENVIRONMENT:-none})" 20
fi
if [ "${E2E_ALLOW_COMPAT_DATABASE_CREATE_DROP:-}" != "true" ]; then
  add_setup_step "compat_create_drop_flag" true true FAIL "" "E2E_ALLOW_COMPAT_DATABASE_CREATE_DROP != true"
  fail_closed "E2E_ALLOW_COMPAT_DATABASE_CREATE_DROP != true – NO MUTATIONS EXECUTED" 10
fi
SAFE_ENVIRONMENT="PASS"
add_setup_step "preflight_safe_environment" true true PASS
add_setup_step "compat_local_only" true true PASS
add_setup_step "compat_create_drop_flag" true true PASS

BASE_URL="${E2E_DATABASE_URL:-}"
[ -n "$BASE_URL" ] || fail_closed "E2E_DATABASE_URL saknas" 10
ADMIN_URL="$(printf '%s' "$BASE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Scope ur det enda auktoritativa manifestet (STEG 4Y)
# ─────────────────────────────────────────────────────────────────────────────
mapfile -t MIGRATIONS < <(node -e '
  const src = require("fs").readFileSync("src/test/syncReleaseMigrationScope.manifest.ts","utf8");
  const body = src.split("SYNC_RELEASE_MIGRATIONS")[1];
  const files = [...body.matchAll(/'"'"'([0-9]{14}_[0-9a-f-]+\.sql)'"'"'/g)].map(m=>m[1]);
  if (!files.length) { console.error("scope tomt"); process.exit(1); }
  console.log(files.join("\n"));
') || fail_closed "kunde inte läsa scope-manifestet"

SCOPE_SIZE=$(node -e '
  const src = require("fs").readFileSync("src/test/syncReleaseMigrationScope.manifest.ts","utf8");
  console.log((src.match(/SYNC_RELEASE_SCOPE_SIZE = (\d+)/)||[])[1] ?? "0");
')
[ "${#MIGRATIONS[@]}" -eq "$SCOPE_SIZE" ] || fail_closed "scope-mismatch ${#MIGRATIONS[@]} != $SCOPE_SIZE"
EXPECTED_TOTAL=$(( SCOPE_SIZE * 2 ))
add_setup_step "scope_manifest" true true PASS

# ─────────────────────────────────────────────────────────────────────────────
# 3. Unikt run-id + trap-baserad cleanup (endast egna scratch-databaser)
# ─────────────────────────────────────────────────────────────────────────────
RUN_ID="$(node -e 'console.log(Date.now().toString(36)+Math.random().toString(36).slice(2,8))')"
DB_PREFIX="ef_sync_compat_${RUN_ID}"

cleanup_scratch() {
  local rc_saved=$?
  if [ "${#CREATED_DBS[@]}" -eq 0 ]; then
    CLEANUP_STATUS="NOT_REQUIRED"
    return $rc_saved
  fi
  local failed=0
  for db in "${CREATED_DBS[@]}"; do
    case "$db" in
      "${DB_PREFIX}_"*) ;;                       # endast DB skapade av denna run
      *) echo "cleanup skipped (unexpected name): $db" >> "$LOG"; failed=1; continue ;;
    esac
    psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" >>"$LOG" 2>&1 || failed=1
  done
  CLEANUP_STATUS=$([ "$failed" -eq 0 ] && echo "CLEANED" || echo "CLEANUP_FAILED")
  echo "cleanup_status: $CLEANUP_STATUS (${CREATED_DBS[*]})" >> "$LOG"
  return $rc_saved
}
on_signal() { cleanup_scratch; write_report "COMPATIBILITY_FAIL"; exit 130; }
trap cleanup_scratch EXIT
trap on_signal INT TERM

psql_step() { # variant step_name url file
  local variant="$1" name="$2" url="$3" file="$4"
  local errf; errf="$(mktemp)"
  if psql "$url" -v ON_ERROR_STOP=1 -q --set=VERBOSITY=verbose -f "$file" >>"$LOG" 2>"$errf"; then
    add_setup_step "$variant/$name" true true PASS
    rm -f "$errf"; return 0
  fi
  cat "$errf" >> "$LOG"
  local state msg
  state="$(sed -nE 's/^([0-9A-Z]{5}): .*/\1/p' "$errf" | head -1)"
  msg="$(grep -m1 'ERROR:' "$errf" | sed 's/.*ERROR:  *//')"
  add_setup_step "$variant/$name" true false FAIL "$state" "$msg"
  FIRST_FAILURE="${FIRST_FAILURE:-$variant/$name}"
  FIRST_SQLSTATE="${FIRST_SQLSTATE:-$state}"
  FIRST_VARIANT="${FIRST_VARIANT:-$variant}"
  rm -f "$errf"; return 1
}

run_variant() {
  local variant="$1" variant_file="$2"
  local db="${DB_PREFIX}_${variant}"
  local url; url="$(printf '%s' "$BASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$db\1#")"

  echo "=== VARIANT $variant (db=$db) ===" >> "$LOG"
  # CREATE sker på ett nytt unikt namn – ingen DROP av fasta namn före start.
  local cerr; cerr="$(mktemp)"
  if ! psql "$ADMIN_URL" -q -c "CREATE DATABASE $db" >>"$LOG" 2>"$cerr"; then
    cat "$cerr" >> "$LOG"
    add_setup_step "$variant/create_database" true false FAIL "" "$(grep -m1 'ERROR:' "$cerr" | sed 's/.*ERROR:  *//')"
    FIRST_FAILURE="${FIRST_FAILURE:-$variant/create_database}"
    rm -f "$cerr"; return 1
  fi
  rm -f "$cerr"
  MUTATIONS_EXECUTED=true
  CREATED_DBS+=("$db")
  add_setup_step "$variant/create_database" true true PASS

  psql_step "$variant" "supabase_shim" "$url" scripts/sync-e2e/bootstrap_supabase_shim.sql || return 1
  psql_step "$variant" "compat_fixture" "$url" "$HERE/fixture.sql" || return 1
  # VERIFIED_PRESTATE: definitioner som finns ordagrant i repots historik.
  psql_step "$variant" "verified_prestate_advance_booking_source_revision" "$url" \
    supabase/migrations/20260805053328_85ea3d0f-e442-48da-b202-7abd2eccb8ff.sql || return 1
  psql_step "$variant" "verified_prestate_recompute_booking_staff_for_day" "$url" \
    supabase/migrations/20260429183626_192dd820-b4ba-4ce3-9aef-3612c2c40a47.sql || return 1
  # VERIFIED_EXISTENCE_ONLY: legacy BSA-identitet + legacy warehouse-unikhet (variant).
  psql_step "$variant" "legacy_bsa_identity" "$url" "$HERE/fixture_bsa_legacy_identity.sql" || return 1
  psql_step "$variant" "legacy_variant_fixture" "$url" "$HERE/$variant_file" || return 1

  local idx=0
  for f in "${MIGRATIONS[@]}"; do
    idx=$((idx+1))
    local path="supabase/migrations/$f"
    if [ ! -f "$path" ]; then
      RESULTS_JSON="$(node -e '
        const a=JSON.parse(process.argv[1]); a.push({variant:process.argv[2],order:Number(process.argv[3]),migration:process.argv[4],started:false,completed:false,sqlstate:null,result:"MISSING",detail:"file missing"});
        console.log(JSON.stringify(a));' "$RESULTS_JSON" "$variant" "$idx" "$f")"
      FIRST_FAILURE="${FIRST_FAILURE:-missing:$f}"; FIRST_VARIANT="${FIRST_VARIANT:-$variant}"
      return 1
    fi
    local errf; errf="$(mktemp)"
    if psql "$url" -v ON_ERROR_STOP=1 -q --set=VERBOSITY=verbose -f "$path" >>"$LOG" 2>"$errf"; then
      TOTAL_PASSED=$((TOTAL_PASSED+1)); TOTAL_EXECUTED=$((TOTAL_EXECUTED+1))
      RESULTS_JSON="$(node -e '
        const a=JSON.parse(process.argv[1]); a.push({variant:process.argv[2],order:Number(process.argv[3]),migration:process.argv[4],started:true,completed:true,sqlstate:null,result:"PASS"});
        console.log(JSON.stringify(a));' "$RESULTS_JSON" "$variant" "$idx" "$f")"
      rm -f "$errf"
    else
      TOTAL_EXECUTED=$((TOTAL_EXECUTED+1)); TOTAL_FAILED=$((TOTAL_FAILED+1))
      cat "$errf" >> "$LOG"
      local state msg
      state="$(sed -nE 's/^([0-9A-Z]{5}): .*/\1/p' "$errf" | head -1)"
      msg="$(grep -m1 'ERROR:' "$errf" | sed 's/.*ERROR:  *//')"
      RESULTS_JSON="$(node -e '
        const a=JSON.parse(process.argv[1]); a.push({variant:process.argv[2],order:Number(process.argv[3]),migration:process.argv[4],started:true,completed:false,sqlstate:process.argv[5]||null,result:"FAIL",detail:process.argv[6]||null});
        console.log(JSON.stringify(a));' "$RESULTS_JSON" "$variant" "$idx" "$f" "$state" "$msg")"
      FIRST_FAILURE="${FIRST_FAILURE:-$f}"; FIRST_SQLSTATE="${FIRST_SQLSTATE:-$state}"; FIRST_VARIANT="${FIRST_VARIANT:-$variant}"
      rm -f "$errf"
      return 1
    fi
  done

  # Post-conditions (samma assertions för varje variant)
  local pcout; pcout="$(mktemp)"
  local POSTCOND_STATUS
  if psql "$url" -v ON_ERROR_STOP=1 -q -A -F'|' -f "$HERE/postconditions.sql" >"$pcout" 2>>"$LOG"; then
    POSTCOND_STATUS="PASS"
  else
    POSTCOND_STATUS="FAIL"
    FIRST_FAILURE="${FIRST_FAILURE:-postconditions}"; FIRST_VARIANT="${FIRST_VARIANT:-$variant}"
  fi
  cat "$pcout" >> "$LOG"
  POSTCOND_JSON="$(node -e '
    const fs=require("fs");
    const prev=JSON.parse(process.argv[1]);
    const lines=fs.readFileSync(process.argv[2],"utf8").split("\n");
    const out={};
    for (const l of lines) {
      const p=l.split("|");
      if (p.length>=2 && /^(PASS|FAIL)$/.test(p[1])) out[p[0]]=p[1];
    }
    prev[process.argv[3]]={status:process.argv[4],checks:out};
    console.log(JSON.stringify(prev));' "$POSTCOND_JSON" "$pcout" "$variant" "$POSTCOND_STATUS")"
  rm -f "$pcout"
  [ "$POSTCOND_STATUS" = "PASS" ] || return 1
  return 0
}

OVERALL=0
for pair in "legacy_unique_as_constraint:variant_wce_legacy_constraint.sql" \
            "legacy_unique_as_index:variant_wce_legacy_index.sql"; do
  v="${pair%%:*}"; vf="${pair##*:}"
  VARIANTS_RUN+=("$v")
  run_variant "$v" "$vf" || OVERALL=1
done

cleanup_scratch || true
trap - EXIT INT TERM

if [ "$OVERALL" -eq 0 ] && [ "$TOTAL_EXECUTED" -eq "$EXPECTED_TOTAL" ] \
   && [ "$TOTAL_PASSED" -eq "$EXPECTED_TOTAL" ] && [ "$TOTAL_FAILED" -eq 0 ] \
   && [ "$SAFE_ENVIRONMENT" = "PASS" ]; then
  CLASS="COMPATIBILITY_PASS"
else
  CLASS="COMPATIBILITY_FAIL"
  FIRST_FAILURE="${FIRST_FAILURE:-unknown}"
  OVERALL=1
fi

write_report "$CLASS"
echo "$CLASS ($TOTAL_PASSED/$EXPECTED_TOTAL migrationer, varianter: ${VARIANTS_RUN[*]}, cleanup: $CLEANUP_STATUS)"
exit "$OVERALL"
