#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# STEG 4Z · release_migration_compatibility
#
# Kör de 12 Booking→Planning-release-migrationerna sekventiellt mot ett strikt
# definierat COMPATIBILITY CONTRACT SCHEMA (fixture) och verifierar slutläget.
#
# Detta är INTE historisk replay och rekonstruerar ingen saknad baseline.
#
# Kräver E2E_DATABASE_URL mot en ISOLERAD testinstans (aldrig produktion).
# Resultat: reports/sync-release-migration-compatibility.json
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/../../.."

HERE="scripts/sync-e2e/release-migration-compat"
REPORT="reports/sync-release-migration-compatibility.json"
LOG="reports/sync-release-migration-compatibility.log"
mkdir -p reports
: > "$LOG"

BASE_URL="${E2E_DATABASE_URL:-}"
if [ -z "$BASE_URL" ]; then
  node -e 'console.log(JSON.stringify({classification:"COMPATIBILITY_FAIL",reason:"E2E_DATABASE_URL saknas – ingen isolerad testmiljö"},null,2))' > "$REPORT"
  echo "COMPATIBILITY_FAIL (E2E_DATABASE_URL saknas)"; exit 10
fi

# Scope hämtas ur det enda auktoritativa manifestet (STEG 4Y).
mapfile -t MIGRATIONS < <(node -e '
  const src = require("fs").readFileSync("src/test/syncReleaseMigrationScope.manifest.ts","utf8");
  const body = src.split("SYNC_RELEASE_MIGRATIONS")[1];
  const files = [...body.matchAll(/'"'"'([0-9]{14}_[0-9a-f-]+\.sql)'"'"'/g)].map(m=>m[1]);
  if (!files.length) { console.error("scope tomt"); process.exit(1); }
  console.log(files.join("\n"));
') || { echo "COMPATIBILITY_FAIL (kunde inte läsa manifest)"; exit 1; }

SCOPE_SIZE=$(node -e '
  const src = require("fs").readFileSync("src/test/syncReleaseMigrationScope.manifest.ts","utf8");
  console.log((src.match(/SYNC_RELEASE_SCOPE_SIZE = (\d+)/)||[])[1] ?? "0");
')

if [ "${#MIGRATIONS[@]}" -ne "$SCOPE_SIZE" ]; then
  echo "COMPATIBILITY_FAIL (scope-mismatch ${#MIGRATIONS[@]} != $SCOPE_SIZE)"; exit 1
fi

ADMIN_URL="$(printf '%s' "$BASE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"

RESULTS_JSON="[]"
FIRST_FAILURE=""
FIRST_SQLSTATE=""
FIRST_VARIANT=""
TOTAL_EXECUTED=0
TOTAL_PASSED=0
VARIANTS_RUN=()
POSTCOND_JSON="{}"

run_variant() {
  local variant="$1" variant_file="$2"
  local db="compat_${variant}"
  local url; url="$(printf '%s' "$BASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$db\1#")"

  echo "=== VARIANT $variant ===" >> "$LOG"
  psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $db" >>"$LOG" 2>&1
  psql "$ADMIN_URL" -q -c "CREATE DATABASE $db" >>"$LOG" 2>&1 || return 1

  psql "$url" -v ON_ERROR_STOP=1 -q -f scripts/sync-e2e/bootstrap_supabase_shim.sql >>"$LOG" 2>&1 || return 1
  psql "$url" -v ON_ERROR_STOP=1 -q -f "$HERE/fixture.sql" >>"$LOG" 2>&1 || return 1
  # VERIFIED_PRESTATE: definitioner som finns ordagrant i repots historik.
  psql "$url" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260805053328_85ea3d0f-e442-48da-b202-7abd2eccb8ff.sql >>"$LOG" 2>&1 || return 1
  psql "$url" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260429183626_192dd820-b4ba-4ce3-9aef-3612c2c40a47.sql >>"$LOG" 2>&1 || return 1
  # VERIFIED_EXISTENCE_ONLY: legacy BSA-identitet + legacy warehouse-unikhet (variant).
  psql "$url" -v ON_ERROR_STOP=1 -q -f "$HERE/fixture_bsa_legacy_identity.sql" >>"$LOG" 2>&1 || return 1
  psql "$url" -v ON_ERROR_STOP=1 -q -f "$HERE/$variant_file" >>"$LOG" 2>&1 || return 1

  local idx=0 ok=0
  for f in "${MIGRATIONS[@]}"; do
    idx=$((idx+1))
    local path="supabase/migrations/$f"
    if [ ! -f "$path" ]; then
      RESULTS_JSON="$(node -e '
        const a=JSON.parse(process.argv[1]); a.push({variant:process.argv[2],order:Number(process.argv[3]),migration:process.argv[4],started:false,completed:false,sqlstate:null,result:"FAIL",detail:"file missing"});
        console.log(JSON.stringify(a));' "$RESULTS_JSON" "$variant" "$idx" "$f")"
      FIRST_FAILURE="${FIRST_FAILURE:-$f}"; FIRST_VARIANT="${FIRST_VARIANT:-$variant}"
      return 1
    fi
    local errf; errf="$(mktemp)"
    if psql "$url" -v ON_ERROR_STOP=1 -q --set=VERBOSITY=verbose -f "$path" >>"$LOG" 2>"$errf"; then
      ok=$((ok+1)); TOTAL_PASSED=$((TOTAL_PASSED+1)); TOTAL_EXECUTED=$((TOTAL_EXECUTED+1))
      RESULTS_JSON="$(node -e '
        const a=JSON.parse(process.argv[1]); a.push({variant:process.argv[2],order:Number(process.argv[3]),migration:process.argv[4],started:true,completed:true,sqlstate:null,result:"PASS"});
        console.log(JSON.stringify(a));' "$RESULTS_JSON" "$variant" "$idx" "$f")"
      rm -f "$errf"
    else
      TOTAL_EXECUTED=$((TOTAL_EXECUTED+1))
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
  psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $db" >>"$LOG" 2>&1
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

CLASS=$([ "$OVERALL" -eq 0 ] && echo COMPATIBILITY_PASS || echo COMPATIBILITY_FAIL)

node -e '
const [cls, scope, executed, passed, results, postcond, firstFail, sqlstate, variants] = process.argv.slice(1);
const res = JSON.parse(results);
require("fs").writeFileSync("reports/sync-release-migration-compatibility.json", JSON.stringify({
  harness: "release_migration_compatibility",
  classification: cls,
  scope_source: "src/test/syncReleaseMigrationScope.manifest.ts",
  scope_size: Number(scope),
  migrations_executed: Number(executed),
  migrations_passed: Number(passed),
  migrations_failed: Number(executed) - Number(passed),
  variants_executed: variants.split(",").filter(Boolean),
  migrations: res,
  postconditions: JSON.parse(postcond),
  first_failure: firstFail || null,
  sqlstate: sqlstate || null,
  fixture_objects: JSON.parse(require("fs").readFileSync("scripts/sync-e2e/release-migration-compat/fixture-provenance.json","utf8")),
  disclaimer: "This compatibility harness does not prove historical migration replay or reconstruct the missing historical EventFlow baseline.",
  log: "reports/sync-release-migration-compatibility.log",
}, null, 2) + "\n");
' "$CLASS" "$SCOPE_SIZE" "$TOTAL_EXECUTED" "$TOTAL_PASSED" "$RESULTS_JSON" "$POSTCOND_JSON" "$FIRST_FAILURE" "$FIRST_SQLSTATE" "$(IFS=,; echo "${VARIANTS_RUN[*]}")"

echo "$CLASS ($TOTAL_PASSED/$TOTAL_EXECUTED migrationer, varianter: ${VARIANTS_RUN[*]})"
exit "$OVERALL"
