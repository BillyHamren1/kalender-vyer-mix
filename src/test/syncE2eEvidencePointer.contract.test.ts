/**
 * STEG 4Z:A — Evidence-pointer contract.
 *
 * run-sync-e2e.sh måste redovisa BÅDE migrationsloggen och den exportbara
 * evidence-texten, och migrations får aldrig försvinna ur required sections.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_SECTIONS } from '../../scripts/sync-e2e/gate.mjs';

const runner = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/run-sync-e2e.sh'),
  'utf8',
);

describe('STEG 4Z:A — evidence pointers i sync-E2E-runnern', () => {
  it('skriver migration_evidence_txt', () => {
    expect(runner).toContain('migration_evidence_txt');
  });

  it('evidence-pekaren pekar exakt på reports/sync-e2e-migrations.txt', () => {
    expect(runner).toMatch(/migration_evidence_txt["']?\s*:\s*["']?reports\/sync-e2e-migrations\.txt/);
  });

  it('skriver fortfarande migration_log', () => {
    expect(runner).toContain('migration_log');
    expect(runner).toMatch(/reports\/sync-e2e-migrations\.log/);
  });

  it('migrations finns kvar i required sections', () => {
    expect(REQUIRED_SECTIONS).toContain('migrations');
  });

  it('migrations-skriptet producerar båda evidensfilerna', () => {
    const sh = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/sync-e2e/run-migrations-compile.sh'),
      'utf8',
    );
    expect(sh).toContain('reports/sync-e2e-migrations.txt');
    expect(sh).toContain('reports/sync-e2e-migrations.log');
  });
});
