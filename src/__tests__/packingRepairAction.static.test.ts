/**
 * Statiska garantier för reparationsvägen av tomma packlistor.
 * - get_packing_items får aldrig skriva.
 * - Reparation sker endast för planning/in_progress och raderar aldrig rader.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('packing repair', () => {
  const shared = read('supabase/functions/_shared/packingRepair.ts');

  it('tillåter endast planning och in_progress', () => {
    expect(shared).toContain("REPAIRABLE_PACKING_STATUSES = ['planning', 'in_progress']");
    expect(shared).toContain('status_frozen');
  });

  it('raderar aldrig packrader', () => {
    expect(shared).not.toMatch(/\.delete\(/);
  });

  it('är idempotent: skapar endast saknade rader', () => {
    expect(shared).toContain('existingProductIds');
    expect(shared).toContain('!existingProductIds.has(p.id)');
  });

  it('filtrerar bort borttagna produkter och paketrubriker', () => {
    expect(shared).toContain('source_missing_since');
    expect(shared).toContain('parentIds.has(p.id)');
  });

  it('exponeras via scanner-api och egen edge function', () => {
    const scanner = read('supabase/functions/scanner-api/index.ts');
    expect(scanner).toContain("case 'repair_packing_items'");
    expect(scanner).toContain("import { repairPackingItems } from '../_shared/packingRepair.ts'");
    const fn = read('supabase/functions/repair-packing-items/index.ts');
    expect(fn).toContain('repairPackingItems(supabase, packingId, profile.organization_id)');
  });

  it('get_packing_items förblir read-only', () => {
    const scanner = read('supabase/functions/scanner-api/index.ts');
    const start = scanner.indexOf("case 'get_packing_items'");
    const end = scanner.indexOf("case 'repair_packing_items'");
    const section = scanner.slice(start, end);
    expect(section).not.toMatch(/\.insert\(|\.delete\(|\.upsert\(/);
  });
});
