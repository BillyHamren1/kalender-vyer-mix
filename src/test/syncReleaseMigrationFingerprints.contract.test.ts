/**
 * STEG 5A — innehållslås för de 12 release-migrationerna.
 *
 * 4Y-provenancen gäller exakt det SQL-innehåll som auditerades. Testet hashar
 * filerna från disk och jämför mot det godkända fingerprint-manifestet. Det
 * uppdaterar ALDRIG hashes automatiskt.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SYNC_RELEASE_MIGRATIONS, SYNC_RELEASE_SCOPE_SIZE } from './syncReleaseMigrationScope.manifest';
import fingerprints from './syncReleaseMigrationFingerprints.json';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');
const sha256 = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

describe('STEG 5A — migration fingerprints', () => {
  it('manifestet täcker exakt 4Y-scopet i samma ordning', () => {
    expect(fingerprints.algorithm).toBe('sha256');
    expect(fingerprints.count).toBe(SYNC_RELEASE_SCOPE_SIZE);
    expect(fingerprints.migrations.map((m) => m.migration)).toEqual([...SYNC_RELEASE_MIGRATIONS]);
  });

  it('varje migrationsfil på disk matchar godkänd SHA-256', () => {
    const drift: string[] = [];
    for (const entry of fingerprints.migrations) {
      const full = path.join(MIGRATIONS_DIR, entry.migration);
      if (!fs.existsSync(full)) {
        drift.push(`${entry.migration}: saknas på disk`);
        continue;
      }
      const actual = sha256(full);
      if (actual !== entry.sha256) drift.push(`${entry.migration}: ${entry.sha256} → ${actual}`);
    }
    expect(
      drift,
      `Release-migrationers innehåll har ändrats. Kräver explicit ny fingerprint (node scripts/sync-e2e/update-migration-fingerprints.mjs), ny 4Y provenance-audit och ny compatibility-körning:\n${drift.join('\n')}`,
    ).toEqual([]);
  });

  it('inga hashes är tomma eller duplicerade', () => {
    const hashes = fingerprints.migrations.map((m) => m.sha256);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('testet uppdaterar aldrig manifestet automatiskt', () => {
    const self = fs.readFileSync(__filename, 'utf8');
    const forbidden = ['write' + 'FileSync', 'write' + 'File('];
    for (const f of forbidden) expect(self.split(f).length - 1, f).toBeLessThan(2);
  });
});
