import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('packing snapshot — fail closed', () => {
  it('usePackingList läser packrader utan insert/update/delete', () => {
    const src = read('src/hooks/usePackingList.tsx');
    const start = src.indexOf('const fetchPackingListReadModel');
    const end = src.indexOf('export const usePackingList');
    const section = src.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(section).not.toMatch(/\.insert\s*\(/);
    expect(section).not.toMatch(/\.update\s*\(/);
    expect(section).not.toMatch(/\.delete\s*\(/);
  });

  it('sync-booking-to-packing fryser hela snapshoten efter planning', () => {
    const src = read('supabase/functions/sync-booking-to-packing/index.ts');
    const fn = src.slice(src.indexOf('async function syncPackingListItems'));
    const freezeGuard = fn.indexOf("if (packingStatus !== 'planning')");
    const firstOperationalInsert = fn.indexOf(".from('packing_list_items')\n      .insert(newItems)");
    const firstOperationalDelete = fn.indexOf(".from('packing_list_items')\n      .delete()");

    expect(freezeGuard).toBeGreaterThan(-1);
    expect(fn.slice(freezeGuard, firstOperationalInsert)).toContain('return 0');
    expect(firstOperationalInsert).toBeGreaterThan(freezeGuard);
    expect(firstOperationalDelete).toBeGreaterThan(freezeGuard);
    expect(fn).toContain("needs_packing_review_reason: 'booking_changed_after_packing_started'");
  });

  it('import-bookings fryser packing_list_items innan add/remove/update', () => {
    const src = read('supabase/functions/import-bookings/index.ts');
    const start = src.indexOf('const syncPackingListAfterExpansion');
    const end = src.indexOf('\n\nserve(async', start);
    const fn = src.slice(start, end);
    const freezeGuard = fn.indexOf("if (packingStatus !== 'planning')");
    const firstInsert = fn.indexOf(".from('packing_list_items').insert(newItems)");

    expect(freezeGuard).toBeGreaterThan(-1);
    expect(fn.slice(freezeGuard, firstInsert)).toContain('return { changes: 0 }');
    expect(firstInsert).toBeGreaterThan(freezeGuard);
    expect(fn).toContain("needs_packing_review_reason: 'booking_changed_after_packing_started'");
  });

  it('WMS preflight blockerar endast på blocked (identitetsvarningar stoppar inte packning)', () => {
    const single = read('supabase/functions/packing-preflight-check/index.ts');
    const batch = read('supabase/functions/packing-preflight-batch/index.ts');
    expect(single).toContain('canStartScanning: summary.blocked === 0');
    expect(single).not.toContain('summary.blocked === 0 && summary.warning === 0');
    expect(batch).toContain('canStartScanning: blocked === 0');
    expect(batch).not.toContain('blocked === 0 && warning === 0');
  });

  it('packlisteutskrift har en enda automatisk print-trigger', () => {
    const src = read('src/lib/packing/printPackingList.ts');
    expect((src.match(/\.print\(\)/g) || []).length).toBe(1);
  });
});
