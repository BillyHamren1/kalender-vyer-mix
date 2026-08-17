#!/usr/bin/env node
/**
 * STEG 5B – Release gate semantics för Booking→Planning-syncen.
 *
 * TVÅ SKILDA FRÅGOR – blanda dem aldrig:
 *
 *  1. HISTORICAL MIGRATION REPLAY (diagnostic, NON_RELEASE_BLOCKING)
 *     Kan hela repositoryts migrationshistorik köras från tom databas?
 *     Nej – repositoryt saknar EventFlows ursprungliga databas-baseline
 *     (baseline audit = B, targeted provenance = P2). Statusen exponeras som
 *     UNVERIFIABLE och får ALDRIG skrivas som PASS.
 *
 *  2. RELEASE MIGRATION COMPATIBILITY (BLOCKERANDE)
 *     Är exakt de 12 release-migrationerna verifierade mot sitt definierade
 *     kontrakt, i två legacy-varianter, med strikta postconditions,
 *     SHA-256-låst SQL-innehåll och content-bunden evidens?
 *
 * Gaten är fail-closed: saknad, stale, malformed eller ofullständig evidens
 * ger alltid RED. Ingen implicit PASS.
 */

/** Release-blockerande sektioner (utöver safe_environment). */
export const REQUIRED_SECTIONS = [
  "release_migration_compatibility",
  "schema_provisioning",
  "bsa_tenant_identity",
  "bsa_v2_rpc",
  "security_definer",
  "revision_lease",
  "worker_jobs",
  "batch_cursor",
  "warehouse_uniqueness",
  "canonical_error_propagation",
  "destructive_cancellation_off",
];

/** Diagnostiska sektioner – redovisas, blockerar aldrig. */
export const DIAGNOSTIC_SECTIONS = ["historical_migration_replay"];

/** Statusar som historical replay får ha. PASS är förbjudet (baseline B/P2). */
export const HISTORICAL_ALLOWED_STATUSES = ["UNVERIFIABLE", "FAIL", "NOT EXECUTED"];

export const HISTORICAL_NON_BLOCKING_REASON =
  "Repository history does not contain the original EventFlow database baseline; full historical replay cannot be reconstructed without fabricated schema.";

export const REQUIRED_COMPAT_VARIANTS = [
  "legacy_unique_as_constraint",
  "legacy_unique_as_index",
];

export const REQUIRED_POSTCONDITIONS = [
  "wce_tenant_unique_present",
  "wce_legacy_unique_removed",
  "bsa_tenant_unique_present",
  "bsa_legacy_global_unique_removed",
  "v2_on_conflict_tenant_safe",
  "v2_reads_scoped_by_org",
  "legacy_bsa_rpc_not_client_executable",
  "warehouse_assignments_tenant_unique",
  "destructive_cancellation_off",
  "canonical_error_no_cursor_write",
  "jobs_claim_with_lease",
  "batch_partial_no_cursor_move",
];

export const RELEASE_SCOPE_SIZE = 12;
export const RELEASE_EXPECTED_MIGRATION_EXECUTIONS =
  RELEASE_SCOPE_SIZE * REQUIRED_COMPAT_VARIANTS.length;

/**
 * Strikt validering av compatibility-evidensen.
 *
 * @param {object} args
 * @param {object|null} args.report              parsad compatibility-JSON (null = saknas)
 * @param {boolean}     args.reportMalformed     true om JSON inte kunde parsas
 * @param {boolean}     args.evidenceTxtExists   .txt-evidensen finns på disk
 * @param {string|null} args.actualBinding       content-binding beräknad från disk
 * @param {string|null} args.actualScopeHash
 * @param {string|null} args.actualFingerprintHash
 * @param {string}      args.fingerprintStatus   "PASS" om de 12 migrationerna matchar disk
 * @param {string|null} args.gitCommit           aktuell commit (valfri, informativ)
 */
export function evaluateCompatibilityEvidence(args = {}) {
  const reasons = [];
  const {
    report,
    reportMalformed = false,
    evidenceTxtExists = false,
    actualBinding = null,
    actualScopeHash = null,
    actualFingerprintHash = null,
    fingerprintStatus = "UNKNOWN",
    gitCommit = null,
  } = args;

  if (reportMalformed) return { status: "FAIL", reasons: ["compatibility report är malformed"] };
  if (!report) return { status: "NOT_EXECUTED", reasons: ["compatibility report saknas"] };

  const eq = (label, actual, expected) => {
    if (actual !== expected) reasons.push(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  };

  eq("harness", report.harness, "release_migration_compatibility");
  eq("classification", report.classification, "COMPATIBILITY_PASS");
  eq("safe_environment", report.safe_environment, "PASS");
  eq("environment", report.environment, "local");
  eq("mutations_executed", report.mutations_executed, true);
  eq("cleanup_status", report.cleanup_status, "CLEANED");
  eq("scope_size", report.scope_size, RELEASE_SCOPE_SIZE);
  eq("migrations_expected", report.migrations_expected, RELEASE_EXPECTED_MIGRATION_EXECUTIONS);
  eq("migrations_executed", report.migrations_executed, RELEASE_EXPECTED_MIGRATION_EXECUTIONS);
  eq("migrations_passed", report.migrations_passed, RELEASE_EXPECTED_MIGRATION_EXECUTIONS);
  eq("migrations_failed", report.migrations_failed, 0);
  eq("migrations_not_executed", report.migrations_not_executed, 0);
  if (report.first_failure !== null && report.first_failure !== undefined && report.first_failure !== "") {
    reasons.push(`first_failure: ${report.first_failure}`);
  }

  const variants = Array.isArray(report.variants_executed) ? report.variants_executed : [];
  for (const v of REQUIRED_COMPAT_VARIANTS) {
    if (!variants.includes(v)) reasons.push(`variant saknas: ${v}`);
  }

  const migrations = Array.isArray(report.migrations) ? report.migrations : [];
  for (const v of REQUIRED_COMPAT_VARIANTS) {
    const rows = migrations.filter((m) => m.variant === v);
    if (rows.length !== RELEASE_SCOPE_SIZE) {
      reasons.push(`variant ${v}: ${rows.length}/${RELEASE_SCOPE_SIZE} migrationer`);
    }
    for (const m of rows) {
      if (m.result !== "PASS" || m.started !== true || m.completed !== true) {
        reasons.push(`migration ${v}/${m.migration}: ${m.result}`);
      }
    }
  }

  const post = report.postconditions ?? {};
  for (const v of REQUIRED_COMPAT_VARIANTS) {
    const entry = post[v];
    if (!entry) {
      reasons.push(`postconditions saknas för variant ${v}`);
      continue;
    }
    if (entry.status !== "PASS") reasons.push(`postconditions ${v}: ${entry.status}`);
    const checks = entry.checks ?? {};
    for (const name of REQUIRED_POSTCONDITIONS) {
      if (!(name in checks)) reasons.push(`postcondition saknas: ${v}/${name}`);
      else if (checks[name] !== "PASS") reasons.push(`postcondition ${v}/${name}: ${checks[name]}`);
    }
    for (const [name, status] of Object.entries(checks)) {
      if (status !== "PASS") reasons.push(`postcondition ${v}/${name}: ${status}`);
    }
  }

  if (!evidenceTxtExists) reasons.push(".txt evidence saknas");
  if (fingerprintStatus !== "PASS") reasons.push(`migration fingerprints: ${fingerprintStatus}`);

  const binding = report.evidence_binding ?? {};
  if (!binding.release_content_binding) reasons.push("evidence_binding saknas i rapporten");
  if (actualBinding && binding.release_content_binding !== actualBinding) {
    reasons.push("stale evidence: release_content_binding matchar inte aktuell kod");
  }
  if (actualScopeHash && binding.scope_manifest_hash !== actualScopeHash) {
    reasons.push("stale evidence: scope_manifest_hash mismatch");
  }
  if (actualFingerprintHash && binding.migration_fingerprint_manifest_hash !== actualFingerprintHash) {
    reasons.push("stale evidence: migration_fingerprint_manifest_hash mismatch");
  }
  if (!binding.git_commit) reasons.push("git_commit saknas i evidence_binding");
  if (gitCommit && binding.git_commit && binding.git_commit !== gitCommit && !actualBinding) {
    reasons.push("stale evidence: git_commit mismatch och ingen content-binding");
  }

  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** Historical replay får aldrig påstås vara PASS/GREEN. */
export function evaluateHistoricalReplay(section = {}) {
  const status = String(section.status ?? "UNVERIFIABLE").trim();
  const reasons = [];
  if (!HISTORICAL_ALLOWED_STATUSES.includes(status)) {
    reasons.push(
      `historical_migration_replay: otillåten status "${status}" (baseline B / provenance P2 tillåter aldrig PASS)`,
    );
  }
  if (section.blocking === true) reasons.push("historical_migration_replay får inte vara blocking");
  return {
    status,
    classification: "DIAGNOSTIC / NON_RELEASE_BLOCKING",
    blocking: false,
    reason: HISTORICAL_NON_BLOCKING_REASON,
    misrepresented: reasons.length > 0,
    reasons,
  };
}

/**
 * BOOKING→PLANNING SQL/E2E RELEASE GATE.
 * GREEN endast om safe_environment PASS och samtliga required sections PASS.
 */
export function computeFinalGate(input) {
  const safe = String(input?.safe_environment ?? "").trim();
  const results = input?.results ?? {};
  const reasons = [];

  const historical = evaluateHistoricalReplay(input?.historical_migration_replay ?? {});
  if (historical.misrepresented) {
    return { final: "RED", exit_code: 1, reasons: historical.reasons, historical };
  }

  if (safe !== "PASS") {
    return {
      final: "NOT EXECUTED",
      exit_code: 10,
      reasons: ["safe_environment != PASS – ingen säker testmiljö, inga mutationer utförda"],
      historical,
    };
  }

  for (const key of REQUIRED_SECTIONS) {
    const value = String(results[key] ?? "").trim();
    if (value === "PASS") continue;
    if (value === "FAIL") reasons.push(`${key}: FAIL`);
    else if (value === "NOT EXECUTED" || value === "NOT_EXECUTED")
      reasons.push(`${key}: NOT EXECUTED efter godkänd preflight`);
    else reasons.push(`${key}: okänt värde "${value}"`);
  }

  if (reasons.length > 0) return { final: "RED", exit_code: 1, reasons, historical };
  return { final: "GREEN", exit_code: 0, reasons: [], historical };
}

// CLI: läser JSON på stdin, skriver JSON på stdout, exit = exit_code.
if (process.argv[1] && process.argv[1].endsWith("gate.mjs")) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let parsed = {};
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      process.stdout.write(
        JSON.stringify({ final: "RED", exit_code: 1, reasons: ["invalid gate input json"] }),
      );
      process.exit(1);
    }
    const out = computeFinalGate(parsed);
    process.stdout.write(JSON.stringify(out));
    process.exit(out.exit_code);
  });
}
