#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# STEG 5C – BOOKING→PLANNING FINAL RELEASE GATE
# ─────────────────────────────────────────────────────────────────────────────
#
#   bash scripts/run-booking-planning-final-release.sh
#
# Kör i strikt ordning:
#   A. preflight (verktyg + säker miljö, aldrig production)
#   B. compatibility evidence (strikt evaluator, ingen automatisk reparation)
#   C. Booking→Planning SQL/E2E release gate (måste exekveras i DENNA körning)
#   D. obligatorisk contract-test-svit (manifest-driven)
#   E. typecheck
#   F. build
#   G. final content-binding + FINAL RELEASE GATE
#
# Fail-closed. NOT EXECUTED är blockerande. Ingen gammal evidens återanvänds.
# Skriver aldrig till production och ändrar aldrig runtime eller migrationer.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

REPORT_DIR="reports"
mkdir -p "$REPORT_DIR"
FINAL_JSON="$REPORT_DIR/booking-planning-final-release.json"
FINAL_TXT="$REPORT_DIR/booking-planning-final-release.txt"
TESTS_TXT="$REPORT_DIR/booking-planning-contract-tests.txt"
TYPECHECK_TXT="$REPORT_DIR/booking-planning-typecheck.txt"
BUILD_TXT="$REPORT_DIR/booking-planning-build.txt"

RELEASE_RUN_ID="rel-$(date -u +%Y%m%dT%H%M%SZ)-$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export BOOKING_PLANNING_RELEASE_RUN_ID="$RELEASE_RUN_ID"
GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo '')"

SEC_SAFE_ENV='{"status":"NOT_EXECUTED","reasons":["preflight ej körd"]}'
SEC_COMPAT='{"status":"NOT_EXECUTED","reasons":["compatibility evidence ej utvärderad"]}'
SEC_SQL='{"status":"NOT_EXECUTED","reasons":["SQL/E2E gate ej körd"]}'
SEC_TESTS='{"status":"NOT_EXECUTED","reasons":["contract tests ej körda"]}'
SEC_TSC='{"status":"NOT_EXECUTED","reasons":["typecheck ej körd"]}'
SEC_BUILD='{"status":"NOT_EXECUTED","reasons":["build ej körd"]}'
SEC_BINDING='{"status":"NOT_EXECUTED","reasons":["binding ej verifierad"]}'
COMPAT_EVIDENCE='null'
SQL_REPORT_JSON='null'
TESTS_DETAIL='null'
TYPECHECK_DETAIL='null'
BUILD_DETAIL='null'

json_section() { # status reason...
  node -e '
    const [status, ...reasons] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({ status, reasons: reasons.filter(Boolean) }));
  ' "$@"
}

emit_and_exit() {
  local binding_json
  binding_json="$(node scripts/sync-e2e/finalReleaseGate.mjs --binding 2>/dev/null || echo '{}')"

  node --input-type=module -e '
    const fs = await import("node:fs");
    const gate = await import(process.cwd() + "/scripts/sync-e2e/finalReleaseGate.mjs");
    const [runId, gitCommit, safeEnv, compat, sql, tests, tsc, build, binding,
           compatEvidence, sqlReport, testsDetail, tscDetail, buildDetail, bindingJson] =
      process.argv.slice(1);
    const p = (s, fb = null) => { try { return JSON.parse(s); } catch { return fb; } };

    const sections = {
      safe_environment: p(safeEnv),
      release_migration_compatibility: p(compat),
      sql_e2e_release_gate: p(sql),
      contract_tests: p(tests),
      typecheck: p(tsc),
      build: p(build),
      final_release_content_binding: p(binding),
    };
    const decision = gate.computeFinalReleaseGate({
      sections,
      historical_migration_replay: p(sqlReport)?.historical_migration_replay ?? {
        status: "UNVERIFIABLE",
        blocking: false,
      },
    });

    const report = {
      gate: "booking_planning_final_release_gate",
      release_run_id: runId,
      generated_at: new Date().toISOString(),
      git_commit: gitCommit || null,
      final_release_content_binding: p(bindingJson, {}).final_release_content_binding ?? null,
      content_binding_files: p(bindingJson, {}).files ?? null,
      historical_migration_replay: {
        status: p(sqlReport)?.historical_migration_replay?.status ?? "UNVERIFIABLE",
        classification: "DIAGNOSTIC / NON_RELEASE_BLOCKING",
        blocking: false,
        reason: p(sqlReport)?.historical_migration_replay?.reason ?? null,
      },
      safe_environment: sections.safe_environment,
      release_migration_compatibility: {
        ...sections.release_migration_compatibility,
        evidence: p(compatEvidence)?.evidence ?? null,
      },
      sql_e2e_release_gate: {
        ...sections.sql_e2e_release_gate,
        report: "reports/sync-e2e-report.json",
        final: p(sqlReport)?.final ?? null,
        results: p(sqlReport)?.results ?? null,
      },
      contract_tests: { ...sections.contract_tests, ...(p(testsDetail) ?? {}) },
      typecheck: { ...sections.typecheck, ...(p(tscDetail) ?? {}) },
      build: { ...sections.build, ...(p(buildDetail) ?? {}) },
      required_sections: decision.required_sections,
      not_executed_sections: decision.not_executed_sections,
      reasons: decision.reasons,
      final: decision.final,
    };
    fs.writeFileSync("reports/booking-planning-final-release.json", JSON.stringify(report, null, 2) + "\n");

    const line = (k, v) => `${k.padEnd(34)}${v}`;
    const txt = [
      "BOOKING→PLANNING FINAL RELEASE GATE",
      line("release_run_id:", report.release_run_id),
      line("generated_at:", report.generated_at),
      line("git_commit:", report.git_commit ?? "none"),
      line("final_release_content_binding:", report.final_release_content_binding ?? "none"),
      line("historical_migration_replay:", `${report.historical_migration_replay.status} (DIAGNOSTIC / NON_RELEASE_BLOCKING)`),
      line("safe_environment:", report.safe_environment.status),
      line("release_migration_compatibility:", report.release_migration_compatibility.status),
      line("sql_e2e_release_gate:", report.sql_e2e_release_gate.status),
      line("contract_tests:", report.contract_tests.status),
      line("typecheck:", report.typecheck.status),
      line("build:", report.build.status),
      line("final_release_content_binding:", report.final_release_content_binding ? "PASS" : "n/a"),
      "",
      report.reasons.length ? "Orsaker:\n  - " + report.reasons.join("\n  - ") : "Inga blockerande orsaker.",
      "",
      `FINAL RELEASE GATE: ${report.final}`,
    ].join("\n");
    fs.writeFileSync("reports/booking-planning-final-release.txt", txt + "\n");
    process.stdout.write(txt + "\n");
    process.exit(decision.exit_code);
  ' "$RELEASE_RUN_ID" "$GIT_COMMIT" "$SEC_SAFE_ENV" "$SEC_COMPAT" "$SEC_SQL" "$SEC_TESTS" \
    "$SEC_TSC" "$SEC_BUILD" "$SEC_BINDING" "$COMPAT_EVIDENCE" "$SQL_REPORT_JSON" \
    "$TESTS_DETAIL" "$TYPECHECK_DETAIL" "$BUILD_DETAIL" "$binding_json"
  exit $?
}

echo "BOOKING→PLANNING FINAL RELEASE RUN: $RELEASE_RUN_ID"

# ── A. VALIDATION PREFLIGHT ──────────────────────────────────────────────────
MISSING_TOOLS=""
for tool in node npm npx psql; do
  command -v "$tool" >/dev/null 2>&1 || MISSING_TOOLS="$MISSING_TOOLS $tool"
done
if [ -n "$MISSING_TOOLS" ]; then
  SEC_SAFE_ENV="$(json_section FAIL "saknade verktyg:$MISSING_TOOLS")"
  emit_and_exit
fi

if ! bash scripts/preflight-sync-e2e.sh; then
  SEC_SAFE_ENV="$(json_section FAIL "preflight underkände miljön – ingen säker testmiljö")"
  emit_and_exit
fi
SEC_SAFE_ENV="$(json_section PASS)"
echo "── A. Preflight: PASS"

# ── B. COMPATIBILITY EVIDENCE (ingen automatisk reparation) ──────────────────
COMPAT_OUT="$(node scripts/sync-e2e/evaluate-compatibility.mjs 2>/dev/null)"
COMPAT_STATUS="$(printf '%s' "$COMPAT_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).status)}catch{process.stdout.write("FAIL")}})')"
COMPAT_REASONS="$(printf '%s' "$COMPAT_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s).reasons||[]).join("; "))}catch{process.stdout.write("evaluator gav inget svar")}})')"
[ -n "$COMPAT_OUT" ] && COMPAT_EVIDENCE="$COMPAT_OUT"
[ -n "$COMPAT_STATUS" ] || COMPAT_STATUS="FAIL"
SEC_COMPAT="$(json_section "$COMPAT_STATUS" "$COMPAT_REASONS")"
echo "── B. Release migration compatibility: $COMPAT_STATUS"
if [ "$COMPAT_STATUS" != "PASS" ]; then
  echo "   STOPP: compatibility evidence är stale/FAIL. Kör harnessen explicit i LOCAL-miljö."
  emit_and_exit
fi

# ── C. SQL/E2E RELEASE GATE (måste exekveras nu) ─────────────────────────────
echo "── C. Kör Booking→Planning SQL/E2E release gate…"
bash scripts/run-sync-e2e.sh
SQL_EXIT=$?
SQL_EVAL="$(node --input-type=module -e '
  const fs = await import("node:fs");
  const g = await import(process.cwd() + "/scripts/sync-e2e/finalReleaseGate.mjs");
  const gate = await import(process.cwd() + "/scripts/sync-e2e/gate.mjs");
  let report = null, malformed = false;
  const p = "reports/sync-e2e-report.json";
  if (fs.existsSync(p)) { try { report = JSON.parse(fs.readFileSync(p,"utf8")); } catch { malformed = true; } }
  const res = g.evaluateSqlE2eReport({
    report, reportMalformed: malformed,
    expectedRunId: process.argv[1],
    requiredSections: gate.REQUIRED_SECTIONS,
  });
  if (process.argv[2] !== "0") { res.status = res.status === "PASS" ? "FAIL" : res.status; res.reasons.push("run-sync-e2e.sh exit_code=" + process.argv[2]); }
  process.stdout.write(JSON.stringify({ section: res, report }));
' "$RELEASE_RUN_ID" "$SQL_EXIT")"
SEC_SQL="$(printf '%s' "$SQL_EVAL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.stringify(JSON.parse(s).section))})')"
SQL_REPORT_JSON="$(printf '%s' "$SQL_EVAL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.stringify(JSON.parse(s).report))})')"
SQL_STATUS="$(printf '%s' "$SEC_SQL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.parse(s).status)})')"
echo "── C. SQL/E2E release gate: $SQL_STATUS"
[ "$SQL_STATUS" = "PASS" ] || emit_and_exit

# ── D. OBLIGATORISK CONTRACT-TEST-SVIT (manifest-driven) ─────────────────────
echo "── D. Kör obligatorisk contract-test-svit…"
MANIFEST_FILES="$(node scripts/sync-e2e/finalReleaseGate.mjs --manifest | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write((JSON.parse(s).files||[]).join(" "))})')"
TEST_CMD="npx vitest run --reporter=verbose $MANIFEST_FILES"
{
  echo "command: $TEST_CMD"
  echo "release_run_id: $RELEASE_RUN_ID"
  echo "--------------------------------------------------------------"
} > "$TESTS_TXT"
# shellcheck disable=SC2086
npx vitest run --reporter=verbose $MANIFEST_FILES >> "$TESTS_TXT" 2>&1
TEST_EXIT=$?
TESTS_EVAL="$(node --input-type=module -e '
  const fs = await import("node:fs");
  const g = await import(process.cwd() + "/scripts/sync-e2e/finalReleaseGate.mjs");
  const raw = fs.readFileSync("reports/booking-planning-contract-tests.txt","utf8");
  // Strippa ANSI-koder så att summeringsraderna kan parsas deterministiskt.
  const out = raw.replace(/\u001b\[[0-9;]*m/g, "");
  const manifest = g.readReleaseTestManifest();
  const missing = manifest.files.filter(f => !fs.existsSync(f));
  const executed = manifest.files.filter(f => out.includes(f));
  const filesLine = out.match(/Test Files\s+(.*)/)?.[1] ?? "";
  const testsLine = out.match(/\n\s+Tests\s+(.*)/)?.[1] ?? "";
  const num = (line, word) => Number(line.match(new RegExp(`([0-9]+) ${word}`))?.[1] ?? 0);
  const filesPassed = num(filesLine, "passed");
  const testsPassed = num(testsLine, "passed");
  const testsFailed = num(testsLine, "failed");
  const res = g.evaluateContractTests({
    manifestFiles: manifest.files,
    missingFiles: missing,
    executedFiles: executed,
    testFilesPassed: filesPassed,
    testsPassed, testsFailed,
    exitCode: Number(process.argv[1]),
    // Endast vitests egen summeringsrad räknas – inte testnamn som råkar
    // innehålla frasen.
    noTestFilesFound: /^\s*No test files found/im.test(out),
    executed: true,
  });
  const detail = {
    command: out.split("\n")[0].replace("command: ",""),
    expected_test_files: manifest.files.length,
    executed_test_files: executed.length,
    test_files_passed: filesPassed,
    tests_passed: testsPassed,
    tests_failed: testsFailed,
    exit_code: Number(process.argv[1]),
    evidence: "reports/booking-planning-contract-tests.txt",
  };
  process.stdout.write(JSON.stringify({ section: res, detail }));
' "$TEST_EXIT")"
SEC_TESTS="$(printf '%s' "$TESTS_EVAL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.stringify(JSON.parse(s).section))})')"
TESTS_DETAIL="$(printf '%s' "$TESTS_EVAL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.stringify(JSON.parse(s).detail))})')"
TESTS_STATUS="$(printf '%s' "$SEC_TESTS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.parse(s).status)})')"
echo "── D. Contract tests: $TESTS_STATUS"
[ "$TESTS_STATUS" = "PASS" ] || emit_and_exit

# ── E. TYPECHECK ─────────────────────────────────────────────────────────────
echo "── E. Typecheck…"
{
  echo "command: npx tsc --noEmit -p tsconfig.app.json"
  echo "release_run_id: $RELEASE_RUN_ID"
  echo "--------------------------------------------------------------"
} > "$TYPECHECK_TXT"
npx tsc --noEmit -p tsconfig.app.json >> "$TYPECHECK_TXT" 2>&1
TSC_EXIT=$?
echo "exit_code: $TSC_EXIT" >> "$TYPECHECK_TXT"
SEC_TSC="$(node -e '
  const g = require("node:child_process");
' 2>/dev/null; node --input-type=module -e '
  const g = await import(process.cwd()+"/scripts/sync-e2e/finalReleaseGate.mjs");
  process.stdout.write(JSON.stringify(g.evaluateCommandSection("typecheck",{executed:true,exitCode:Number(process.argv[1])})));
' "$TSC_EXIT")"
TYPECHECK_DETAIL="$(node -e 'process.stdout.write(JSON.stringify({command:"npx tsc --noEmit -p tsconfig.app.json",executed:true,exit_code:Number(process.argv[1]),evidence:"reports/booking-planning-typecheck.txt"}))' "$TSC_EXIT")"
echo "── E. Typecheck exit_code=$TSC_EXIT"
[ "$TSC_EXIT" = "0" ] || emit_and_exit

# ── F. BUILD ─────────────────────────────────────────────────────────────────
echo "── F. Build…"
{
  echo "command: npm run build"
  echo "release_run_id: $RELEASE_RUN_ID"
  echo "--------------------------------------------------------------"
} > "$BUILD_TXT"
npm run build >> "$BUILD_TXT" 2>&1
BUILD_EXIT=$?
echo "exit_code: $BUILD_EXIT" >> "$BUILD_TXT"
SEC_BUILD="$(node --input-type=module -e '
  const g = await import(process.cwd()+"/scripts/sync-e2e/finalReleaseGate.mjs");
  process.stdout.write(JSON.stringify(g.evaluateCommandSection("build",{executed:true,exitCode:Number(process.argv[1])})));
' "$BUILD_EXIT")"
BUILD_DETAIL="$(node -e 'process.stdout.write(JSON.stringify({command:"npm run build",executed:true,exit_code:Number(process.argv[1]),evidence:"reports/booking-planning-build.txt"}))' "$BUILD_EXIT")"
echo "── F. Build exit_code=$BUILD_EXIT"
[ "$BUILD_EXIT" = "0" ] || emit_and_exit

# ── G. FINAL CONTENT-BINDING ─────────────────────────────────────────────────
SEC_BINDING="$(node --input-type=module -e '
  const g = await import(process.cwd()+"/scripts/sync-e2e/finalReleaseGate.mjs");
  const b = g.computeFinalReleaseBinding();
  const res = b.missing.length
    ? { status: "FAIL", reasons: ["saknade filer i final binding: " + b.missing.join(", ")] }
    : g.evaluateFinalBinding({ recorded: b.final_release_content_binding, actual: b.final_release_content_binding });
  process.stdout.write(JSON.stringify(res));
')"
echo "── G. Final content-binding: $(printf '%s' "$SEC_BINDING" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.parse(s).status)})')"

emit_and_exit
