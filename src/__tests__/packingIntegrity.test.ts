import { describe, expect, it } from 'vitest';
import { comparePackingSnapshot } from '@/lib/packing/packingIntegrity';

const products = [
  { id: 'p1', booking_id: 'b1', name: 'Bord', quantity: 4, parent_product_id: null },
  { id: 'pkg', booking_id: 'b1', name: 'Paket', quantity: 1, parent_product_id: null },
  { id: 'child', booking_id: 'b1', name: 'Paketdel', quantity: 2, parent_product_id: 'pkg' },
];

describe('comparePackingSnapshot', () => {
  it('godkänner en exakt leaf/packbar snapshot och ignorerar paketheader', () => {
    const result = comparePackingSnapshot(products, [
      { id: 'i1', booking_product_id: 'p1', quantity_to_pack: 4 },
      { id: 'i2', booking_product_id: 'child', quantity_to_pack: 2 },
    ], true);

    expect(result.isExactMatch).toBe(true);
    expect(result.blockingCount).toBe(0);
    expect(result.expectedRows).toBe(2);
  });

  it('blockerar saknad rad och antalsskillnad', () => {
    const result = comparePackingSnapshot(products, [
      { id: 'i1', booking_product_id: 'p1', quantity_to_pack: 3 },
    ], true);

    expect(result.isExactMatch).toBe(false);
    expect(result.issues.some((issue) => issue.type === 'quantity_mismatch')).toBe(true);
    expect(result.issues.some((issue) => issue.type === 'missing_item')).toBe(true);
  });

  it('blockerar dubbla source-rader', () => {
    const result = comparePackingSnapshot([
      { id: 'p1', booking_id: 'b1', name: 'Bord', quantity: 4, parent_product_id: null },
    ], [
      { id: 'i1', booking_product_id: 'p1', quantity_to_pack: 2 },
      { id: 'i2', booking_product_id: 'p1', quantity_to_pack: 2 },
    ], true);

    expect(result.issues.some((issue) => issue.type === 'duplicate_item' && issue.severity === 'blocking')).toBe(true);
  });

  it('blockerar en bokningsrad som har exkluderats', () => {
    const result = comparePackingSnapshot([
      { id: 'p1', booking_id: 'b1', name: 'Bord', quantity: 4, parent_product_id: null },
    ], [
      { id: 'i1', booking_product_id: 'p1', quantity_to_pack: 4, excluded: true },
    ], true);

    expect(result.isExactMatch).toBe(false);
    expect(result.issues.some((issue) => issue.type === 'excluded_source_item' && issue.severity === 'blocking')).toBe(true);
  });

  it('visar manuella extrarader som tydlig varning utan att dölja bokningsmatchningen', () => {
    const result = comparePackingSnapshot([
      { id: 'p1', booking_id: 'b1', name: 'Bord', quantity: 4, parent_product_id: null },
    ], [
      { id: 'i1', booking_product_id: 'p1', quantity_to_pack: 4 },
      { id: 'manual', booking_product_id: null, quantity_to_pack: 1, manual_name: 'Extra spännband' },
    ], true);

    expect(result.blockingCount).toBe(0);
    expect(result.warningCount).toBe(1);
    expect(result.issues.some((issue) => issue.type === 'manual_item')).toBe(true);
  });

  it('kan skilja en känd tom bokningskälla från en helt manuell packlista', () => {
    const result = comparePackingSnapshot([], [], true);
    expect(result.sourceAvailable).toBe(true);
    expect(result.isExactMatch).toBe(true);
  });

  it('låter 14-dagarsflödet hantera kända borttagningar utan generisk integritetsvarning', () => {
    const result = comparePackingSnapshot([
      {
        id: 'removed',
        booking_id: 'b1',
        name: 'F10',
        quantity: 2,
        parent_product_id: null,
        source_missing_since: '2026-08-20T10:00:00Z',
      },
    ], [
      { id: 'i1', booking_product_id: 'removed', quantity_to_pack: 2 },
    ], true);

    expect(result.blockingCount).toBe(0);
    expect(result.issues).toEqual([]);
  });
});
