/**
 * STEG 4Z — release_migration_compatibility.
 *
 * Harnessen är INTE historisk replay. Testet låser att harnessen finns, att
 * scope kommer från 4Y-manifestet, att provenance-märkningen är explicit och
 * att rapportens klassificering matchar faktiska resultat (fail-closed).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SYNC_RELEASE_MIGRATIONS, SYNC_RELEASE_SCOPE_SIZE } from './syncReleaseMigrationScope.manifest';

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(root, rel), 'utf8');
const HARNESS = 'scripts/sync-e2e/release-migration-compat';

const runner = read(`${HARNESS}/run-compat.sh`);
const fixture = read(`${HARNESS}/fixture.sql`);
const provenance = JSON.parse(read(`${HARNESS}/fixture-provenance.json`));
const reportPath = path.resolve(root, 'reports/sync-release-migration-compatibility.json');

describe('STEG 4Z — harness-integritet', () => {
  it('alla harness-filer finns', () => {
    for (const f of [
      'run-compat.sh',
      'fixture.sql',
      'fixture-provenance.json',
      'postconditions.sql',
      'fixture_bsa_legacy_identity.sql',
      'variant_wce_legacy_constraint.sql',
      'variant_wce_legacy_index.sql',
    ]) {
      expect(fs.existsSync(path.resolve(root, HARNESS, f)), f).toBe(true);
    }
  });

  it('scope läses från 4Y-manifestet, inte en duplicerad lista', () => {
    expect(runner).toContain('src/test/syncReleaseMigrationScope.manifest.ts');
    for (const file of SYNC_RELEASE_MIGRATIONS) {
      expect(runner).not.toContain(file);
    }
  });

  it('harnessen är fail-fast och hoppar inte över migrationer', () => {
    expect(runner).toContain('ON_ERROR_STOP=1');
    expect(runner).not.toMatch(/allowlist|skip_migration/i);
  });

  it('harnessen kör båda legacy-varianterna', () => {
    expect(runner).toContain('variant_wce_legacy_constraint.sql');
    expect(runner).toContain('variant_wce_legacy_index.sql');
  });

  it('fixturen beskrivs aldrig som historisk baseline eller replay', () => {
    const forbidden = [
      'historical baseline',
      'verified historical replay',
      'reconstructed production baseline',
    ];
    for (const text of [runner, fixture, JSON.stringify(provenance)]) {
      for (const f of forbidden) {
        expect(text.toLowerCase()).not.toContain(f);
      }
    }
  });

  it('varje CURRENT_STATE_CONTRACT-objekt har ett dokumenterat antagande', () => {
    expect(provenance.CURRENT_STATE_CONTRACT.length).toBeGreaterThan(0);
    for (const o of provenance.CURRENT_STATE_CONTRACT) {
      expect(o.object).toBeTruthy();
      expect(String(o.assumption).length).toBeGreaterThan(10);
    }
    expect(provenance.VERIFIED_EXISTENCE_ONLY.length).toBeGreaterThan(0);
    expect(provenance.VERIFIED_PRESTATE.length).toBeGreaterThan(0);
    expect(provenance.UNKNOWN_HISTORICAL.length).toBeGreaterThan(0);
  });

  it('VERIFIED_PRESTATE-källor finns faktiskt på disk', () => {
    for (const o of provenance.VERIFIED_PRESTATE) {
      expect(fs.existsSync(path.resolve(root, o.source)), o.source).toBe(true);
      expect(runner).toContain(path.basename(o.source));
    }
  });
});

describe('STEG 4Z — rapportintegritet', () => {
  it('rapporten finns och har rätt harness-namn', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(r.harness).toBe('release_migration_compatibility');
    expect(['COMPATIBILITY_PASS', 'COMPATIBILITY_FAIL']).toContain(r.classification);
  });

  it('disclaimer är ordagrann', () => {
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(r.disclaimer).toBe(
      'This compatibility harness does not prove historical migration replay or reconstruct the missing historical EventFlow baseline.',
    );
  });

  it('rapportens scope matchar manifestet exakt (ordning + storlek)', () => {
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(r.scope_size).toBe(SYNC_RELEASE_SCOPE_SIZE);
    const perVariant: Record<string, string[]> = {};
    for (const m of r.migrations) (perVariant[m.variant] ??= []).push(m.migration);
    for (const v of r.variants_executed) {
      expect(perVariant[v]).toEqual([...SYNC_RELEASE_MIGRATIONS]);
    }
  });

  it('COMPATIBILITY_PASS kräver att varje migration i varje variant är PASS', () => {
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (r.classification !== 'COMPATIBILITY_PASS') return;
    expect(r.migrations_failed).toBe(0);
    expect(r.migrations_executed).toBe(SYNC_RELEASE_SCOPE_SIZE * r.variants_executed.length);
    expect(r.migrations_passed).toBe(r.migrations_executed);
    for (const m of r.migrations) {
      expect(m.started, m.migration).toBe(true);
      expect(m.completed, m.migration).toBe(true);
      expect(m.result, m.migration).toBe('PASS');
    }
    for (const v of r.variants_executed) {
      expect(r.postconditions[v].status, v).toBe('PASS');
      for (const [name, status] of Object.entries(r.postconditions[v].checks)) {
        expect(status, `${v}/${name}`).toBe('PASS');
      }
    }
  });

  it('postconditions täcker de obligatoriska releasekontrakten', () => {
    const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const first = r.postconditions[r.variants_executed[0]].checks;
    for (const key of [
      'wce_tenant_unique_present',
      'wce_legacy_unique_removed',
      'bsa_tenant_unique_present',
      'bsa_legacy_global_unique_removed',
      'v2_on_conflict_tenant_safe',
      'v2_reads_scoped_by_org',
      'legacy_bsa_rpc_not_client_executable',
      'warehouse_assignments_tenant_unique',
      'destructive_cancellation_off',
      'canonical_error_no_cursor_write',
      'jobs_claim_with_lease',
      'batch_partial_no_cursor_move',
    ]) {
      expect(Object.keys(first), key).toContain(key);
    }
  });

  it('STEG 5B: compatibility är en blockerande sektion i den fail-closed gaten', () => {
    const gate = read('scripts/sync-e2e/gate.mjs');
    expect(gate).toContain('release_migration_compatibility');
    // Historical replay får aldrig blockera, och får aldrig fejkas som PASS.
    expect(gate).not.toMatch(/REQUIRED_SECTIONS[\s\S]{0,400}"migrations"/);
  });

});
