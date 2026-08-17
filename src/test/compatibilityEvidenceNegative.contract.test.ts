import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { evaluateCompatibilityEvidence } from '../../scripts/sync-e2e/gate.mjs';
import {
  computeReleaseBinding,
  verifyMigrationFingerprints,
} from '../../scripts/sync-e2e/releaseBinding.mjs';

/**
 * Negativa tester för compatibility-evidensen.
 * Evaluatorn får ALDRIG släppa igenom saknad, malformed, stale eller
 * ofullständig evidens – och får aldrig reparera något själv.
 */

const REPORT_PATH = 'reports/sync-release-migration-compatibility.json';
const hasReport = fs.existsSync(REPORT_PATH);
const baseReport = hasReport ? JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')) : null;

const binding = computeReleaseBinding(process.cwd());
const fingerprints = verifyMigrationFingerprints(process.cwd());
let gitCommit: string | null = null;
try {
  gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  gitCommit = null;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const run = (report: unknown, over: Record<string, unknown> = {}) =>
  evaluateCompatibilityEvidence({
    report,
    evidenceTxtExists: true,
    actualBinding: binding.release_content_binding,
    actualScopeHash: binding.scope_manifest_hash,
    actualFingerprintHash: binding.migration_fingerprint_manifest_hash,
    fingerprintStatus: fingerprints.status,
    gitCommit,
    ...over,
  });

describe('compatibility evidence – fail-closed grundfall', () => {
  it('saknad evidens ⇒ NOT_EXECUTED, aldrig PASS', () => {
    const res = run(null);
    expect(res.status).toBe('NOT_EXECUTED');
  });

  it('malformed evidens ⇒ FAIL', () => {
    expect(run(null, { reportMalformed: true }).status).toBe('FAIL');
  });

  it('tomt objekt ⇒ FAIL', () => {
    expect(run({}).status).toBe('FAIL');
  });
});

describe.runIf(hasReport && baseReport)('compatibility evidence – mutationer av giltig rapport', () => {
  it('baslinjen (rapporten på disk) utvärderas utan att kasta', () => {
    const res = run(clone(baseReport));
    expect(['PASS', 'FAIL', 'NOT_EXECUTED']).toContain(res.status);
  });

  it('klassificering eller harness-namn manipulerat ⇒ FAIL', () => {
    expect(run({ ...clone(baseReport), classification: 'ALLT_OK' }).status).toBe('FAIL');
    expect(run({ ...clone(baseReport), harness: 'annat' }).status).toBe('FAIL');
  });

  it('production-miljö eller osäker miljö ⇒ FAIL', () => {
    expect(run({ ...clone(baseReport), environment: 'production' }).status).toBe('FAIL');
    expect(run({ ...clone(baseReport), safe_environment: 'FAIL' }).status).toBe('FAIL');
  });

  it('inga mutationer körda eller cleanup saknas ⇒ FAIL', () => {
    expect(run({ ...clone(baseReport), mutations_executed: false }).status).toBe('FAIL');
    expect(run({ ...clone(baseReport), cleanup_status: 'DIRTY' }).status).toBe('FAIL');
  });

  it('för få migrationer eller failade migrationer ⇒ FAIL', () => {
    expect(run({ ...clone(baseReport), migrations_passed: 23 }).status).toBe('FAIL');
    expect(run({ ...clone(baseReport), migrations_failed: 1 }).status).toBe('FAIL');
    expect(run({ ...clone(baseReport), migrations_not_executed: 1 }).status).toBe('FAIL');
    expect(run({ ...clone(baseReport), first_failure: 'x.sql' }).status).toBe('FAIL');
  });

  it('saknad variant ⇒ FAIL (båda legacy-varianterna krävs)', () => {
    const r = clone(baseReport);
    r.variants_executed = [r.variants_executed?.[0]].filter(Boolean);
    expect(run(r).status).toBe('FAIL');
  });

  it('en enskild migration med annat resultat än PASS ⇒ FAIL', () => {
    const r = clone(baseReport);
    if (Array.isArray(r.migrations) && r.migrations.length > 0) {
      r.migrations[0].result = 'FAIL';
      expect(run(r).status).toBe('FAIL');
    }
    const r2 = clone(baseReport);
    if (Array.isArray(r2.migrations) && r2.migrations.length > 0) {
      r2.migrations[0].completed = false;
      expect(run(r2).status).toBe('FAIL');
    }
  });

  it('postconditions saknade eller failade ⇒ FAIL', () => {
    const r = clone(baseReport);
    r.postconditions = {};
    expect(run(r).status).toBe('FAIL');

    const r2 = clone(baseReport);
    const firstVariant = Object.keys(r2.postconditions ?? {})[0];
    if (firstVariant) {
      r2.postconditions[firstVariant].status = 'FAIL';
      expect(run(r2).status).toBe('FAIL');
    }
  });

  it('stale evidens: content-binding matchar inte aktuell kod ⇒ FAIL', () => {
    const r = clone(baseReport);
    r.evidence_binding = { ...(r.evidence_binding ?? {}), release_content_binding: 'stale-hash' };
    const res = run(r);
    expect(res.status).toBe('FAIL');
    expect(res.reasons.join(' ')).toContain('stale evidence');
  });

  it('stale evidens: scope- eller fingerprint-hash mismatch ⇒ FAIL', () => {
    const r = clone(baseReport);
    r.evidence_binding = { ...(r.evidence_binding ?? {}), scope_manifest_hash: 'x' };
    expect(run(r).status).toBe('FAIL');

    const r2 = clone(baseReport);
    r2.evidence_binding = {
      ...(r2.evidence_binding ?? {}),
      migration_fingerprint_manifest_hash: 'x',
    };
    expect(run(r2).status).toBe('FAIL');
  });

  it('evidence_binding eller git_commit saknas ⇒ FAIL', () => {
    const r = clone(baseReport);
    delete r.evidence_binding;
    expect(run(r).status).toBe('FAIL');

    const r2 = clone(baseReport);
    r2.evidence_binding = { ...(r2.evidence_binding ?? {}), git_commit: null };
    expect(run(r2).status).toBe('FAIL');
  });

  it('saknad .txt-evidens eller ej verifierade fingerprints ⇒ FAIL', () => {
    expect(run(clone(baseReport), { evidenceTxtExists: false }).status).toBe('FAIL');
    expect(run(clone(baseReport), { fingerprintStatus: 'UNKNOWN' }).status).toBe('FAIL');
    expect(run(clone(baseReport), { fingerprintStatus: 'FAIL' }).status).toBe('FAIL');
  });
});

describe('evaluatorn reparerar aldrig själv', () => {
  const src = fs.readFileSync('scripts/sync-e2e/evaluate-compatibility.mjs', 'utf8');

  it('kör aldrig harnessen eller migrationer – bara git rev-parse', () => {
    expect(src).not.toMatch(/run-compat\.sh/);
    expect(src).not.toMatch(/\bpsql\b/);
    const execCalls = [...src.matchAll(/execSync\(\s*['"]([^'"]+)/g)].map((m) => m[1]);
    expect(execCalls).toEqual(['git rev-parse HEAD']);
  });

  it('exit-koden är fail-closed (endast PASS ger 0)', () => {
    expect(src).toContain("result.status === 'PASS' ? 0 : 1");
  });
});
