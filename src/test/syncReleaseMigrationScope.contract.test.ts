import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SYNC_RELEASE_MIGRATIONS,
  SYNC_RELEASE_SCOPE_SIZE,
} from './syncReleaseMigrationScope.manifest';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');

describe('STEG 4Y — targeted release migration scope', () => {
  it('scope är exakt 12 migrationer och inte tomt', () => {
    expect(SYNC_RELEASE_MIGRATIONS.length).toBe(SYNC_RELEASE_SCOPE_SIZE);
    expect(SYNC_RELEASE_MIGRATIONS.length).toBeGreaterThan(0);
  });

  it('inga dubbletter i scope', () => {
    expect(new Set(SYNC_RELEASE_MIGRATIONS).size).toBe(SYNC_RELEASE_MIGRATIONS.length);
  });

  it('varje release-migration finns på disk och är icke-tom', () => {
    const missing: string[] = [];
    const empty: string[] = [];
    for (const file of SYNC_RELEASE_MIGRATIONS) {
      const full = path.join(MIGRATIONS_DIR, file);
      if (!fs.existsSync(full)) {
        missing.push(file);
        continue;
      }
      if (fs.readFileSync(full, 'utf8').trim().length === 0) empty.push(file);
    }
    expect(missing, `saknade release-migrationer: ${missing.join(', ')}`).toEqual([]);
    expect(empty, `tomma release-migrationer: ${empty.join(', ')}`).toEqual([]);
  });

  it('scope är sorterat kronologiskt (timestamp-prefix)', () => {
    const sorted = [...SYNC_RELEASE_MIGRATIONS].sort();
    expect(sorted).toEqual([...SYNC_RELEASE_MIGRATIONS]);
  });

  it('alla release-migrationer ligger inom releasefönstret 2026-08-13..2026-08-16', () => {
    for (const file of SYNC_RELEASE_MIGRATIONS) {
      const ts = file.slice(0, 8);
      expect(Number(ts)).toBeGreaterThanOrEqual(20260813);
      expect(Number(ts)).toBeLessThanOrEqual(20260816);
    }
  });

  it('provenance-rapporten täcker exakt samma scope', () => {
    const reportPath = path.resolve(process.cwd(), 'reports/sync-release-migration-provenance.json');
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const covered = (report.migrations ?? []).map((m: { migration: string }) => m.migration).sort();
    expect(covered).toEqual([...SYNC_RELEASE_MIGRATIONS].sort());
  });
});
