import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computePackingProgress } from '@/lib/packing/progress';
import { getOperationsPackingPresentation } from '@/lib/packing/operationsPresentation';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const item = (over: Record<string, unknown>) => ({
  id: String(over.id ?? 'i1'),
  quantity_to_pack: 2,
  quantity_packed: 0,
  booking_products: null,
  ...over,
}) as any;

describe('packability contract: excluded !== true && is_packable !== false', () => {
  it('excluded row with is_packable=true is never countable', () => {
    const res = computePackingProgress([item({ excluded: true, is_packable: true })]);
    expect(res.total).toBe(0);
    expect(res.countableIds).toEqual([]);
  });

  it('current non-packable row is not countable', () => {
    const res = computePackingProgress([item({ excluded: false, is_packable: false })]);
    expect(res.total).toBe(0);
  });

  it('current packable row counts', () => {
    const res = computePackingProgress([item({ excluded: false, is_packable: true, quantity_packed: 2 })]);
    expect(res.total).toBe(2);
    expect(res.verified).toBe(2);
  });

  it('row with unset is_packable counts', () => {
    const res = computePackingProgress([item({ is_packable: null })]);
    expect(res.total).toBe(2);
  });

  it('presentation marks current non-packable as struck-through, not hidden', () => {
    const p = getOperationsPackingPresentation({ excluded: false, is_packable: false });
    expect(p.isPackable).toBe(false);
    expect(p.label).toBe('Ej packningsbar');
    expect(p.rowClassName + p.nameClassName).toMatch(/line-through/);
  });

  it('excluded row is treated as non-current by presentation too', () => {
    expect(getOperationsPackingPresentation({ excluded: true, is_packable: true }).isPackable).toBe(false);
  });
});

describe('static contracts', () => {
  it('ProjectProductsList never filters on is_packable', () => {
    expect(read('src/components/project/ProjectProductsList.tsx')).not.toContain('is_packable');
  });

  it('no source uses the forbidden `is_packable ?? excluded` expression', () => {
    const files = [
      'src/lib/packing/progress.ts',
      'src/lib/packing/operationsPresentation.ts',
      'src/hooks/useWarehouseCardMeta.ts',
      'src/services/establishmentPlanningService.ts',
      'supabase/functions/_shared/packing-progress.ts',
      'supabase/functions/scanner-api/index.ts',
    ];
    for (const f of files) {
      const src = read(f).replace(/^\s*(\/\/|\*).*$/gm, '');
      expect(src, f).not.toMatch(/is_packable\s*\?\?/);
      expect(src, f).not.toMatch(/\?\?\s*!?\w*\.?excluded/);
    }
  });

  it('warehouse checklist renders from current rows (excluded filtered out)', () => {
    const src = read('src/components/packing/DesktopChecklistView.tsx');
    expect(src).toMatch(/const currentItems = items\.filter\(\(i\) => i\.excluded !== true\)/);
    expect(src).toMatch(/const productItems = currentItems\./);
    expect(src).toMatch(/const packableItems = currentItems\.filter\(\(i\) => i\.is_packable !== false\)/);
    expect(src).toMatch(/const rows = packableItems\.map/);
  });

  it('scanner-operation-v2 blocks both excluded and non-packable rows', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src).toMatch(/item\.excluded === true/);
    expect(src).toMatch(/item\.is_packable === false/);
    expect(src).toMatch(/projected\?\.excluded === true \|\| projected\?\.is_packable === false/);
  });

  it('scanner-api selects excluded wherever it matches packing rows', () => {
    const src = read('supabase/functions/scanner-api/index.ts');
    const selects = src.match(/\.select\(\s*[`'"][^`'"]*is_packable[^`'"]*[`'"]/g) || [];
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s).toContain('excluded');
  });
});
