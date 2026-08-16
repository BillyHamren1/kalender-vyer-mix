#!/usr/bin/env node
/**
 * STEG 5B – CLI som läser compatibility-evidensen från disk, binder den till
 * aktuell kod och skriver ut den blockerande sektionens status.
 *
 * stdout: JSON { status, reasons, evidence }
 * exit 0 om PASS, annars 1. Fail-closed: allt oväntat → FAIL/NOT_EXECUTED.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { evaluateCompatibilityEvidence } from './gate.mjs';
import { computeReleaseBinding, verifyMigrationFingerprints } from './releaseBinding.mjs';

const root = process.cwd();
const REPORT = path.join(root, 'reports/sync-release-migration-compatibility.json');
const EVIDENCE_TXT = path.join(root, 'reports/sync-release-migration-compatibility.txt');

let report = null;
let reportMalformed = false;
if (fs.existsSync(REPORT)) {
  try {
    report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  } catch {
    reportMalformed = true;
  }
}

const binding = computeReleaseBinding(root);
const fingerprints = verifyMigrationFingerprints(root);
let gitCommit = null;
try {
  gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  gitCommit = null;
}

const result = evaluateCompatibilityEvidence({
  report,
  reportMalformed,
  evidenceTxtExists: fs.existsSync(EVIDENCE_TXT),
  actualBinding: binding.release_content_binding,
  actualScopeHash: binding.scope_manifest_hash,
  actualFingerprintHash: binding.migration_fingerprint_manifest_hash,
  fingerprintStatus: fingerprints.status,
  gitCommit,
});

process.stdout.write(
  JSON.stringify(
    {
      status: result.status,
      reasons: result.reasons,
      evidence: {
        report: 'reports/sync-release-migration-compatibility.json',
        evidence_txt: 'reports/sync-release-migration-compatibility.txt',
        generated_at: report?.generated_at ?? null,
        git_commit: report?.evidence_binding?.git_commit ?? null,
        current_git_commit: gitCommit,
        release_content_binding: binding.release_content_binding,
        scope_size: report?.scope_size ?? null,
        migrations_passed: report?.migrations_passed ?? null,
        migrations_expected: report?.migrations_expected ?? null,
        variants: report?.variants_executed ?? [],
        fingerprint_verification: fingerprints.status,
      },
    },
    null,
    2,
  ) + '\n',
);
process.exit(result.status === 'PASS' ? 0 : 1);
