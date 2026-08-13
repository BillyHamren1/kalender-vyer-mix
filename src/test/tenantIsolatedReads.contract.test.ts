/**
 * STEG 3N — Tenant-isolering av beslutsgrundade reads i normal Booking → Planning-sync.
 *
 * Reads som påverkar mutationer (assignment preservation, planning status,
 * calendar reconcile, large project-koppling) MÅSTE vara scopade på
 * organization_id, och DB-fel får aldrig tolkas som "ingen lokal relation".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/import-bookings/index.ts'),
  'utf-8',
);

/** Plockar ut ett query-block som börjar på .from('<table>') */
const readBlocks = (table: string): string[] => {
  const lines = SRC.split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!line.includes(`.from('${table}')`)) return;
    const block = lines.slice(i, i + 10).join('\n');
    const head = block.split('\n\n')[0];
    if (!head.includes('.select(')) return;
    if (/\.(insert|update|upsert|delete)\(/.test(head)) return;
    out.push(head);
  });
  return out;
};

describe('STEG 3N — tenant-isolerade reads i import-bookings', () => {
  for (const table of [
    'projects',
    'jobs',
    'bookings',
    'large_projects',
    'large_project_bookings',
    'packing_projects',
    'booking_products',
    'calendar_events',
  ]) {
    it(`alla beslutsgrundade reads mot ${table} har organization_id-filter`, () => {
      const blocks = readBlocks(table);
      const unscoped = blocks.filter((b) => !b.includes('organization_id'));
      expect(unscoped, `Ofiltrerade reads mot ${table}:\n${unscoped.join('\n---\n')}`).toEqual([]);
    });
  }

  it('planning-status-guarden är fail-closed vid DB-fel', () => {
    expect(SRC).toContain('[Calendar Reconcile] FAIL-CLOSED');
    expect(SRC).not.toContain('planning_status guard failed (continuing)');
  });

  it('large project-resolution är fail-closed vid DB-fel', () => {
    expect(SRC).toContain('FAIL-CLOSED large project resolution failed');
  });

  it('assignment preservation är fail-closed vid DB-fel', () => {
    expect(SRC).toContain('[Preserve Flags] FAIL-CLOSED');
    expect(SRC).toContain('preserveReadError');
  });

  it('paketexpandering är fail-closed vid DB-fel', () => {
    expect(SRC).toContain('[expandPackageComponents] FAIL-CLOSED');
  });

  it('parent booking tenant-verifieras innan large_project_id används', () => {
    const idx = SRC.indexOf('largeProjectIdForGuard = lpId');
    const before = SRC.slice(Math.max(0, idx - 2500), idx);
    expect(before).toContain(".from('bookings')");
    expect(before).toContain(".eq('organization_id', calendarOrgId)");
  });

  it('ingen global fallback-read utan org-kontext för project/job-koppling', () => {
    // Alla projekt/jobb-reads i preserve-blocket använder preserveOrgId
    const count = (SRC.match(/\.eq\('organization_id', preserveOrgId\)/g) || []).length;
    expect(count).toBe(4);
  });
});
