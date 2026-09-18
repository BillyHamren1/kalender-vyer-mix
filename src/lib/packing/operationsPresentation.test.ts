import { describe, expect, it } from 'vitest';
import { getOperationsPackingPresentation } from './operationsPresentation';
import { computePackingProgress, deriveStatusFromProgress, isAllPacked } from './progress';

describe('Operations packability projection', () => {
  it('renders an effective non-packable WMS row muted and struck through', () => {
    const view = getOperationsPackingPresentation({ excluded: true });

    expect(view.isPackable).toBe(false);
    expect(view.label).toBe('Ej packningsbar');
    expect(view.rowClassName).toContain('opacity-60');
    expect(view.nameClassName).toContain('line-through');
  });

  it('keeps a packable, current WMS row active', () => {
    expect(getOperationsPackingPresentation({ is_packable: true, excluded: false })).toEqual({
      isPackable: true,
      label: 'Packningsbar',
      rowClassName: '',
      nameClassName: '',
    });
  });

  it('never revives a historically excluded row via a stale is_packable=true', () => {
    expect(getOperationsPackingPresentation({ is_packable: true, excluded: true }).isPackable).toBe(false);
  });


  it('uses excluded only as fallback when WMS is_packable is absent', () => {
    expect(getOperationsPackingPresentation({ excluded: true }).isPackable).toBe(false);
    expect(getOperationsPackingPresentation({ excluded: false }).isPackable).toBe(true);
  });

  it('does not count non-packable rows in progress or block completion', () => {
    const rows = [
      { id: 'tent', excluded: false, quantity_to_pack: 2, quantity_packed: 2 },
      { id: 'transport', is_packable: false, excluded: false, quantity_to_pack: 1, quantity_packed: 0 },
      { id: 'ob', is_packable: false, excluded: false, quantity_to_pack: 4, quantity_packed: 0 },
    ];

    expect(computePackingProgress(rows)).toMatchObject({
      total: 2,
      verified: 2,
      percentage: 100,
      countableIds: ['tent'],
    });
    expect(isAllPacked(rows)).toBe(true);
    expect(deriveStatusFromProgress(rows)).toBe('packed');
  });

  it('leaves completion untouched when the WMS projection has only non-packable rows', () => {
    const rows = [
      { id: 'transport', is_packable: false, excluded: false, quantity_to_pack: 1, quantity_packed: 0 },
    ];

    expect(computePackingProgress(rows)).toMatchObject({ total: 0, verified: 0, percentage: 0 });
    expect(isAllPacked(rows)).toBe(false);
    expect(deriveStatusFromProgress(rows)).toBeNull();
  });
});
