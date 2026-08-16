/**
 * STEG 5A — genererar SHA-256-fingerprint för de 12 release-migrationerna.
 * Körs ENDAST manuellt när en release-migration legitimt ändrats (kräver då
 * också ny 4Y provenance-audit + ny compatibility-körning).
 * Contract-testet uppdaterar ALDRIG hashes automatiskt.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const src = fs.readFileSync('src/test/syncReleaseMigrationScope.manifest.ts', 'utf8');
const files = [...src.split('SYNC_RELEASE_MIGRATIONS')[1].matchAll(/'([0-9]{14}_[0-9a-f-]+\.sql)'/g)].map(m => m[1]);
const migrations = files.map((file) => {
  const full = path.join('supabase/migrations', file);
  const buf = fs.readFileSync(full);
  return { migration: file, sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
});
const out = {
  note: 'Godkänt fingerprint-manifest för 4Y-scopet. Ändras endast explicit; kräver ny provenance-audit och ny compatibility-körning.',
  algorithm: 'sha256',
  generated_at: new Date().toISOString(),
  count: migrations.length,
  migrations,
};
fs.writeFileSync('src/test/syncReleaseMigrationFingerprints.json', JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${migrations.length} fingerprints`);
