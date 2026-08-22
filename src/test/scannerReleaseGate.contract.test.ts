/**
 * SCANNER HARDENING – STEG 16: final release gate.
 * Låser att inget aktiveras av misstag före extern granskning.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SCANNER_TRANSACTION_V2 } from '@/config/scannerFlags';
import {
  RECONCILIATION_MODE,
  RECONCILIATION_REPAIR_ENABLED,
} from '@/lib/scanner/reconciliation';

const report = fs.readFileSync(
  path.resolve(__dirname, '../../docs/scanner-hardening-release-gate.md'),
  'utf8',
);
const automatedGate = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/run-scanner-automated-gate.mjs'),
  'utf8',
);
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));

describe('STEG 16 – release gate', () => {
  it('SCANNER_TRANSACTION_V2 är OFF', () => {
    expect(SCANNER_TRANSACTION_V2).toBe(false);
  });

  it('reconciliation är read only', () => {
    expect(RECONCILIATION_MODE).toBe('read_only');
    expect(RECONCILIATION_REPAIR_ENABLED).toBe(false);
  });

  it('slutrapporten täcker alla 15 invariants', () => {
    for (let i = 1; i <= 15; i += 1) {
      expect(report).toMatch(new RegExp(`\\|\\s${i}\\s\\|`));
    }
  });

  it('slutrapporten listar blockers, flaggor, endpoints och legacy paths', () => {
    for (const section of ['Blockers', 'Feature flags', 'Endpoints', 'legacy paths', 'Migrationsfiler']) {
      expect(report.toLowerCase()).toContain(section.toLowerCase());
    }
  });

  it('rapporten deklarerar att ingen aktivering skett', () => {
    expect(report).toContain('DO NOT ACTIVATE');
    expect(report).toContain('Ingen produktionsdeploy');
  });

  it('npm test:scanner kör hela den namngivna scannersviten', () => {
    expect(packageJson.scripts['test:scanner']).toContain('run-scanner-automated-gate.mjs --scanner-tests-only');
    expect(automatedGate).toContain('scannerTestNames');
    expect(automatedGate).toContain('scannerService.scanning.test.ts');
    expect(automatedGate).toContain('scanner-wms-flow.static.test.ts');
  });

  it('automatiska gaten innehåller Scanner, Deno, TypeScript, Time och isolerade builds', () => {
    for (const required of [
      'scanner-readiness.test.ts',
      "args: ['--noEmit']",
      "scripts/test-time-reporting.sh', '--frontend-only'",
      "args: ['build', '--mode', 'scanner', '--outDir', 'dist-scanner']",
      "args: ['scripts/check-mobile-bundle.js', 'scanner']",
      "args: ['build', '--mode', 'time', '--outDir', 'dist-time']",
      "args: ['scripts/check-mobile-bundle.js', 'time']",
      "args: ['scripts/build-android.js', 'time', '--verify-only']",
    ]) {
      expect(automatedGate).toContain(required);
    }
  });

  it('externa releasegates redovisas som blockerade och aldrig PASS', () => {
    expect(automatedGate).toContain('External release gates (never counted as PASS here)');
    expect(automatedGate).toContain('BLOCKED  Physical Zebra DataWedge/RFID verification');
    expect(automatedGate).toContain('OVERALL SCANNER RELEASE: BLOCKED');
  });
});
