#!/usr/bin/env node
/**
 * STEG 5C – FINAL RELEASE GATE för Booking→Planning.
 *
 * TRE NIVÅER (blanda dem aldrig):
 *
 *   1. Historical migration replay      UNVERIFIABLE — diagnostic, non-blocking
 *   2. Booking→Planning SQL/E2E gate    blockerande DB/sync-gate (run-sync-e2e.sh)
 *   3. FINAL RELEASE GATE (denna fil)   SQL/E2E + contract-tests + typecheck +
 *                                       build + aktuell content-binding
 *
 * Gaten är fail-closed: FAIL, NOT EXECUTED, UNKNOWN, saknad sektion, stale
 * binding eller SQL/E2E-rapport från en annan release_run_id → RED.
 * Den ändrar aldrig runtime, migrationer eller databaser.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileHash, computeReleaseBinding, readScopeMigrations } from './releaseBinding.mjs';
import { RELEASE_RUNTIME_FILES } from './releaseBinding.mjs';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Blockerande sektioner i FINAL RELEASE GATE. */
export const FINAL_REQUIRED_SECTIONS = [
  'safe_environment',
  'release_migration_compatibility',
  'sql_e2e_release_gate',
  'contract_tests',
  'typecheck',
  'build',
  'final_release_content_binding',
];

/** Statusvärden som aldrig får räknas som PASS. */
export const NON_PASS_STATUSES = ['FAIL', 'NOT EXECUTED', 'NOT_EXECUTED', 'UNKNOWN', 'RED'];

export const HISTORICAL_ALLOWED_STATUSES = ['UNVERIFIABLE', 'FAIL', 'NOT EXECUTED'];

/** Läser den obligatoriska contract-test-listan ur TS-manifestet (enda källan). */
export function readReleaseTestManifest(root = process.cwd()) {
  const file = path.join(root, 'src/test/bookingPlanningReleaseTests.manifest.ts');
  if (!fs.existsSync(file)) return { files: [], areas: [], missing_manifest: true };
  const src = fs.readFileSync(file, 'utf8');
  const body = src.split('BOOKING_PLANNING_RELEASE_TESTS')[1] ?? '';
  const list = body.split('REQUIRED_RELEASE_TEST_AREAS')[0] ?? '';
  const files = [...list.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
  const areas = [...list.matchAll(/area:\s*'([^']+)'/g)].map((m) => m[1]);
  return { files, areas, missing_manifest: false };
}

/** Filer som FINAL RELEASE-bindningen täcker (utöver de 12 migrationerna). */
export function finalReleaseBindingFiles(root = process.cwd()) {
  const harness = 'scripts/sync-e2e/release-migration-compat';
  const sqlSections = fs
    .readdirSync(path.join(root, 'scripts/sync-e2e'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => `scripts/sync-e2e/${f}`);
  const { files: testFiles } = readReleaseTestManifest(root);
  return [
    // migrations-scope + fingerprints
    'src/test/syncReleaseMigrationScope.manifest.ts',
    'src/test/syncReleaseMigrationFingerprints.json',
    // compatibility-harness
    `${harness}/run-compat.sh`,
    `${harness}/fixture.sql`,
    `${harness}/fixture_bsa_legacy_identity.sql`,
    `${harness}/variant_wce_legacy_constraint.sql`,
    `${harness}/variant_wce_legacy_index.sql`,
    `${harness}/postconditions.sql`,
    `${harness}/fixture-provenance.json`,
    // SQL/E2E-sektioner + gate-kod
    ...sqlSections,
    'scripts/preflight-sync-e2e.sh',
    'scripts/run-sync-e2e.sh',
    'scripts/run-booking-planning-final-release.sh',
    'scripts/sync-e2e/gate.mjs',
    'scripts/sync-e2e/evaluate-compatibility.mjs',
    'scripts/sync-e2e/releaseBinding.mjs',
    'scripts/sync-e2e/finalReleaseGate.mjs',
    // Booking→Planning runtime som release-contract-testerna avser
    ...RELEASE_RUNTIME_FILES,
    // test-manifest + de obligatoriska testerna
    'src/test/bookingPlanningReleaseTests.manifest.ts',
    ...testFiles,
    // bygg-/beroendekonfiguration
    'package.json',
    'bun.lock',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
  ];
}

/** Deterministisk SHA-256 över hela FINAL RELEASE-ytan. */
export function computeFinalReleaseBinding(root = process.cwd()) {
  const parts = [];
  const missing = [];
  const rels = [
    ...readScopeMigrations(root).map((f) => `supabase/migrations/${f}`),
    ...finalReleaseBindingFiles(root),
  ];
  for (const rel of rels) {
    const h = fileHash(rel, root);
    if (!h) missing.push(rel);
    parts.push(`${rel}:${h ?? 'MISSING'}`);
  }
  return {
    algorithm: 'sha256',
    files: parts.length,
    missing,
    release_content_binding: computeReleaseBinding(root).release_content_binding,
    final_release_content_binding: sha256(parts.join('\n')),
  };
}

/** Utvärderar contract-test-körningen. Ingen parsing får rädda ett fel kommando. */
export function evaluateContractTests(input = {}) {
  const reasons = [];
  const {
    manifestFiles = [],
    missingFiles = [],
    executedFiles = [],
    testFilesPassed = 0,
    testsPassed = 0,
    testsFailed = 0,
    exitCode = null,
    noTestFilesFound = false,
    executed = false,
  } = input;

  if (!executed) return { status: 'NOT_EXECUTED', reasons: ['contract tests kördes aldrig'] };
  if (manifestFiles.length === 0) reasons.push('test-manifestet är tomt');
  if (missingFiles.length > 0) reasons.push(`testfiler saknas på disk: ${missingFiles.join(', ')}`);
  if (noTestFilesFound) reasons.push('vitest: No test files found');
  if (exitCode !== 0) reasons.push(`vitest exit_code=${exitCode}`);
  if (testsFailed > 0) reasons.push(`${testsFailed} tester FAIL`);

  const missingExec = manifestFiles.filter((f) => !executedFiles.includes(f));
  if (missingExec.length > 0) reasons.push(`ej exekverade testfiler: ${missingExec.join(', ')}`);
  if (testFilesPassed !== manifestFiles.length) {
    reasons.push(`test files passed ${testFilesPassed}/${manifestFiles.length}`);
  }
  if (testsPassed <= 0) reasons.push('inga tester passerade');

  return { status: reasons.length === 0 ? 'PASS' : 'FAIL', reasons };
}

/** Generisk utvärdering av typecheck/build. */
export function evaluateCommandSection(name, input = {}) {
  const { executed = false, exitCode = null } = input;
  if (!executed) return { status: 'NOT_EXECUTED', reasons: [`${name} kördes aldrig`] };
  if (exitCode !== 0) return { status: 'FAIL', reasons: [`${name} exit_code=${exitCode}`] };
  return { status: 'PASS', reasons: [] };
}

/** SQL/E2E-rapporten måste komma från DENNA körning och vara GREEN. */
export function evaluateSqlE2eReport(input = {}) {
  const {
    report,
    reportMalformed = false,
    expectedRunId = null,
    requiredSections = [],
  } = input;
  if (reportMalformed) return { status: 'FAIL', reasons: ['sync-e2e-report.json är malformed'] };
  if (!report) return { status: 'NOT_EXECUTED', reasons: ['sync-e2e-report.json saknas'] };

  const reasons = [];
  if (expectedRunId) {
    if (!report.release_run_id) reasons.push('sync-e2e-rapporten saknar release_run_id');
    else if (report.release_run_id !== expectedRunId) {
      reasons.push('sync-e2e-rapporten kommer från en annan release-körning (stale)');
    }
  }
  if (report.final !== 'GREEN') reasons.push(`sql_e2e final=${report.final ?? 'saknas'}`);
  if (report.safe_environment !== 'PASS') {
    reasons.push(`sql_e2e safe_environment=${report.safe_environment ?? 'saknas'}`);
  }
  const results = report.results ?? {};
  if (String(results.release_migration_compatibility ?? '') !== 'PASS') {
    reasons.push('sql_e2e release_migration_compatibility != PASS');
  }
  for (const key of requiredSections) {
    const value = String(results[key] ?? '').trim();
    if (value !== 'PASS') reasons.push(`sql_e2e ${key}: ${value || 'saknas'}`);
  }
  const hist = report.historical_migration_replay ?? {};
  if (hist.status && !HISTORICAL_ALLOWED_STATUSES.includes(String(hist.status).trim())) {
    reasons.push(`historical_migration_replay: otillåten status "${hist.status}"`);
  }
  if (hist.blocking === true) reasons.push('historical_migration_replay markerad som blocking');

  return { status: reasons.length === 0 ? 'PASS' : 'FAIL', reasons };
}

/** Content-binding i rapporten måste matcha aktuell disk. */
export function evaluateFinalBinding(input = {}) {
  const { recorded = null, actual = null } = input;
  if (!actual) return { status: 'UNKNOWN', reasons: ['kunde inte beräkna final content-binding'] };
  if (!recorded) return { status: 'NOT_EXECUTED', reasons: ['final content-binding saknas'] };
  if (recorded !== actual) {
    return {
      status: 'FAIL',
      reasons: ['stale evidence: final_release_content_binding matchar inte aktuell kod'],
    };
  }
  return { status: 'PASS', reasons: [] };
}

/**
 * FINAL RELEASE GATE.
 * GREEN endast om samtliga blockerande sektioner är PASS och historical replay
 * inte har förfalskats till PASS.
 */
export function computeFinalReleaseGate(input = {}) {
  const sections = input.sections ?? {};
  const reasons = [];
  const notExecuted = [];

  const histStatus = String(input.historical_migration_replay?.status ?? 'UNVERIFIABLE').trim();
  if (!HISTORICAL_ALLOWED_STATUSES.includes(histStatus)) {
    reasons.push(
      `historical_migration_replay: otillåten status "${histStatus}" (baseline B / provenance P2 tillåter aldrig PASS)`,
    );
  }
  if (input.historical_migration_replay?.blocking === true) {
    reasons.push('historical_migration_replay får inte vara blocking');
  }

  for (const key of FINAL_REQUIRED_SECTIONS) {
    const entry = sections[key];
    const status = String(entry?.status ?? 'missing').trim();
    if (status === 'PASS') continue;
    if (status === 'NOT EXECUTED' || status === 'NOT_EXECUTED') notExecuted.push(key);
    if (status === 'missing') reasons.push(`${key}: saknas i rapporten`);
    else reasons.push(`${key}: ${status}${entry?.reasons?.length ? ` (${entry.reasons.join('; ')})` : ''}`);
  }

  const final = reasons.length === 0 ? 'GREEN' : 'RED';
  return {
    final,
    exit_code: final === 'GREEN' ? 0 : 1,
    reasons,
    required_sections: FINAL_REQUIRED_SECTIONS,
    not_executed_sections: notExecuted,
    historical_migration_replay: {
      status: histStatus,
      classification: 'DIAGNOSTIC / NON_RELEASE_BLOCKING',
      blocking: false,
    },
  };
}

// CLI: läser JSON på stdin, skriver gate-beslutet på stdout, exit = exit_code.
if (process.argv[1] && process.argv[1].endsWith('finalReleaseGate.mjs')) {
  if (process.argv.includes('--binding')) {
    process.stdout.write(JSON.stringify(computeFinalReleaseBinding(), null, 2) + '\n');
  } else if (process.argv.includes('--manifest')) {
    process.stdout.write(JSON.stringify(readReleaseTestManifest(), null, 2) + '\n');
  } else {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => {
      let parsed = {};
      try {
        parsed = JSON.parse(raw || '{}');
      } catch {
        process.stdout.write(
          JSON.stringify({ final: 'RED', exit_code: 1, reasons: ['invalid final gate input json'] }),
        );
        process.exit(1);
      }
      const out = computeFinalReleaseGate(parsed);
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      process.exit(out.exit_code);
    });
  }
}
