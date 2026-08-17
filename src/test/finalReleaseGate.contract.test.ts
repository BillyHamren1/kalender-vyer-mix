import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
// .mjs-moduler utan typdeklarationer – körs av vitest
import {
  FINAL_REQUIRED_SECTIONS,
  computeFinalReleaseGate,
  evaluateContractTests,
  evaluateCommandSection,
  evaluateSqlE2eReport,
  evaluateFinalBinding,
  computeFinalReleaseBinding,
  readReleaseTestManifest,
} from '../../scripts/sync-e2e/finalReleaseGate.mjs';

const PASS = { status: 'PASS', reasons: [] };
const allPass = () =>
  Object.fromEntries(FINAL_REQUIRED_SECTIONS.map((k: string) => [k, { ...PASS }]));

describe('STEG 5C – FINAL RELEASE GATE semantik', () => {
  it('GREEN endast när samtliga blockerande sektioner är PASS', () => {
    const res = computeFinalReleaseGate({
      sections: allPass(),
      historical_migration_replay: { status: 'UNVERIFIABLE', blocking: false },
    });
    expect(res.final).toBe('GREEN');
    expect(res.exit_code).toBe(0);
  });

  it.each(FINAL_REQUIRED_SECTIONS)('RED när %s är FAIL', (key: string) => {
    const sections = allPass();
    sections[key] = { status: 'FAIL', reasons: ['x'] };
    expect(computeFinalReleaseGate({ sections }).final).toBe('RED');
  });

  it.each(FINAL_REQUIRED_SECTIONS)('RED när %s är NOT EXECUTED', (key: string) => {
    const sections = allPass();
    sections[key] = { status: 'NOT EXECUTED', reasons: [] };
    const res = computeFinalReleaseGate({ sections });
    expect(res.final).toBe('RED');
    expect(res.not_executed_sections).toContain(key);
  });

  it.each(FINAL_REQUIRED_SECTIONS)('RED när %s saknas helt', (key: string) => {
    const sections = allPass();
    delete sections[key];
    const res = computeFinalReleaseGate({ sections });
    expect(res.final).toBe('RED');
    expect(res.reasons.join(' ')).toContain(key);
  });

  it('RED på tom rapport (fail-closed default)', () => {
    expect(computeFinalReleaseGate({}).final).toBe('RED');
    expect(computeFinalReleaseGate({ sections: {} }).exit_code).toBe(1);
  });

  it('historical_migration_replay får aldrig vara PASS/GREEN och är aldrig blockerande', () => {
    expect(
      computeFinalReleaseGate({
        sections: allPass(),
        historical_migration_replay: { status: 'PASS' },
      }).final,
    ).toBe('RED');

    const ok = computeFinalReleaseGate({
      sections: allPass(),
      historical_migration_replay: { status: 'UNVERIFIABLE', blocking: false },
    });
    expect(ok.final).toBe('GREEN');
    expect(ok.historical_migration_replay.blocking).toBe(false);
    expect(ok.historical_migration_replay.classification).toBe('DIAGNOSTIC / NON_RELEASE_BLOCKING');
  });

  it('RED om historical replay markeras som blocking', () => {
    expect(
      computeFinalReleaseGate({
        sections: allPass(),
        historical_migration_replay: { status: 'UNVERIFIABLE', blocking: true },
      }).final,
    ).toBe('RED');
  });
});

describe('contract-test-sektionen', () => {
  const base = {
    manifestFiles: ['a.test.ts', 'b.test.ts'],
    missingFiles: [],
    executedFiles: ['a.test.ts', 'b.test.ts'],
    testFilesPassed: 2,
    testsPassed: 10,
    testsFailed: 0,
    exitCode: 0,
    executed: true,
  };

  it('PASS när alla manifest-filer kördes och passerade', () => {
    expect(evaluateContractTests(base).status).toBe('PASS');
  });

  it('NOT_EXECUTED när sviten aldrig kördes', () => {
    expect(evaluateContractTests({ ...base, executed: false }).status).toBe('NOT_EXECUTED');
  });

  it('FAIL vid "No test files found" trots exit 0', () => {
    const res = evaluateContractTests({
      ...base,
      noTestFilesFound: true,
      testFilesPassed: 0,
      testsPassed: 0,
    });
    expect(res.status).toBe('FAIL');
  });

  it('FAIL när en manifest-fil inte exekverades', () => {
    const res = evaluateContractTests({ ...base, executedFiles: ['a.test.ts'], testFilesPassed: 1 });
    expect(res.status).toBe('FAIL');
    expect(res.reasons.join(' ')).toContain('b.test.ts');
  });

  it('FAIL när en manifest-fil saknas på disk', () => {
    expect(evaluateContractTests({ ...base, missingFiles: ['b.test.ts'] }).status).toBe('FAIL');
  });

  it('FAIL vid failade tester eller nollskilt exit code', () => {
    expect(evaluateContractTests({ ...base, testsFailed: 1 }).status).toBe('FAIL');
    expect(evaluateContractTests({ ...base, exitCode: 1 }).status).toBe('FAIL');
    expect(evaluateContractTests({ ...base, exitCode: null }).status).toBe('FAIL');
  });
});

describe('typecheck/build-sektionerna', () => {
  it('PASS endast vid exit 0 och faktisk körning', () => {
    expect(evaluateCommandSection('typecheck', { executed: true, exitCode: 0 }).status).toBe('PASS');
    expect(evaluateCommandSection('build', { executed: true, exitCode: 2 }).status).toBe('FAIL');
    expect(evaluateCommandSection('build', {}).status).toBe('NOT_EXECUTED');
  });
});

describe('SQL/E2E-evidens', () => {
  const green = {
    final: 'GREEN',
    safe_environment: 'PASS',
    release_run_id: 'rel-1',
    results: { release_migration_compatibility: 'PASS', a: 'PASS' },
    historical_migration_replay: { status: 'UNVERIFIABLE', blocking: false },
  };

  it('PASS för GREEN rapport från samma release-run', () => {
    expect(
      evaluateSqlE2eReport({ report: green, expectedRunId: 'rel-1', requiredSections: ['a'] }).status,
    ).toBe('PASS');
  });

  it('FAIL för rapport från en annan (stale) körning', () => {
    const res = evaluateSqlE2eReport({ report: green, expectedRunId: 'rel-2' });
    expect(res.status).toBe('FAIL');
    expect(res.reasons.join(' ')).toContain('stale');
  });

  it('NOT_EXECUTED när rapporten saknas, FAIL när den är malformed', () => {
    expect(evaluateSqlE2eReport({}).status).toBe('NOT_EXECUTED');
    expect(evaluateSqlE2eReport({ reportMalformed: true }).status).toBe('FAIL');
  });

  it('FAIL när en obligatorisk SQL-sektion inte är PASS', () => {
    expect(
      evaluateSqlE2eReport({ report: green, expectedRunId: 'rel-1', requiredSections: ['zzz'] }).status,
    ).toBe('FAIL');
  });

  it('FAIL när compat inte är PASS i SQL-rapporten', () => {
    const r = { ...green, results: { ...green.results, release_migration_compatibility: 'FAIL' } };
    expect(evaluateSqlE2eReport({ report: r, expectedRunId: 'rel-1' }).status).toBe('FAIL');
  });
});

describe('final content-binding', () => {
  it('PASS bara när inspelad binding matchar aktuell disk', () => {
    expect(evaluateFinalBinding({ recorded: 'a', actual: 'a' }).status).toBe('PASS');
    expect(evaluateFinalBinding({ recorded: 'a', actual: 'b' }).status).toBe('FAIL');
    expect(evaluateFinalBinding({ actual: 'b' }).status).toBe('NOT_EXECUTED');
    expect(evaluateFinalBinding({ recorded: 'a' }).status).toBe('UNKNOWN');
  });

  it('bindningen täcker migrationer, harness, runtime och tester utan saknade filer', () => {
    const b = computeFinalReleaseBinding(process.cwd());
    expect(b.missing).toEqual([]);
    expect(b.files).toBeGreaterThan(50);
    expect(b.final_release_content_binding).toMatch(/^[0-9a-f]{64}$/);
  });

  it('bindningen ändras när en bunden fil ändras (deterministisk men känslig)', () => {
    const a = computeFinalReleaseBinding(process.cwd()).final_release_content_binding;
    const b = computeFinalReleaseBinding(process.cwd()).final_release_content_binding;
    expect(a).toBe(b);
  });
});

describe('runner-kontrakt', () => {
  const runner = fs.readFileSync('scripts/run-booking-planning-final-release.sh', 'utf8');

  it('finns och är fail-closed med defaults NOT_EXECUTED', () => {
    expect(runner).toContain('NOT_EXECUTED');
    expect(runner).toContain('emit_and_exit');
  });

  it('kör alla obligatoriska steg i ordning', () => {
    const order = [
      'preflight-sync-e2e.sh',
      'evaluate-compatibility.mjs',
      'run-sync-e2e.sh',
      'vitest run',
      'tsc --noEmit',
      'npm run build',
      'computeFinalReleaseBinding',
    ];
    let idx = -1;
    for (const step of order) {
      const at = runner.indexOf(step);
      expect(at, `saknar steg ${step}`).toBeGreaterThan(-1);
      expect(at, `fel ordning för ${step}`).toBeGreaterThan(idx);
      idx = at;
    }
  });

  it('genererar ett unikt release_run_id per körning', () => {
    expect(runner).toContain('BOOKING_PLANNING_RELEASE_RUN_ID');
    expect(runner).toContain('RELEASE_RUN_ID=');
  });

  it('manifestet driver testurvalet (ingen hårdkodad testlista i runnern)', () => {
    expect(runner).toContain('--manifest');
    const manifest = readReleaseTestManifest(process.cwd());
    expect(manifest.files.length).toBeGreaterThan(10);
  });
});
