/**
 * STEG 5B — Evidence-pointer contract.
 *
 * run-sync-e2e.sh måste fortfarande redovisa BÅDE migrationsloggen och den
 * exportbara evidence-texten för historical replay (diagnostiskt), och den
 * blockerande release_migration_compatibility-sektionen måste finnas kvar
 * bland required sections.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_SECTIONS } from '../../scripts/sync-e2e/gate.mjs';

const runner = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/run-sync-e2e.sh'),
  'utf8',
);

describe('STEG 5B — evidence pointers i sync-E2E-runnern', () => {
  it('skriver evidence_txt för historical replay', () => {
    expect(runner).toContain('evidence_txt');
    expect(runner).toMatch(/reports\/sync-e2e-migrations\.txt/);
  });

  it('skriver fortfarande migrationsloggen', () => {
    expect(runner).toMatch(/reports\/sync-e2e-migrations\.log/);
  });

  it('historical replay redovisas som icke-blockerande men aldrig som PASS', () => {
    expect(runner).toContain('HISTORICAL_STATUS="UNVERIFIABLE"');
    expect(runner).toContain('NON_RELEASE_BLOCKING');
    expect(runner).toMatch(/"blocking":\s*false/);
  });

  it('release_migration_compatibility är en blockerande required section', () => {
    expect(REQUIRED_SECTIONS).toContain('release_migration_compatibility');
    expect(REQUIRED_SECTIONS).not.toContain('migrations');
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
