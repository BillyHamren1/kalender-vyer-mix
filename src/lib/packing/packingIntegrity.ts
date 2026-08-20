export interface PackingIntegrityProduct {
  id: string;
  booking_id: string;
  name: string;
  quantity: number;
  parent_product_id?: string | null;
  sku?: string | null;
  source_missing_since?: string | null;
}

export interface PackingIntegrityItem {
  id: string;
  booking_product_id?: string | null;
  quantity_to_pack: number;
  excluded?: boolean | null;
  manual_name?: string | null;
}

export type PackingIntegrityIssueType =
  | 'missing_item'
  | 'orphan_item'
  | 'quantity_mismatch'
  | 'duplicate_item'
  | 'excluded_source_item'
  | 'manual_item';

export interface PackingIntegrityIssue {
  type: PackingIntegrityIssueType;
  severity: 'blocking' | 'warning';
  bookingProductId?: string | null;
  name: string;
  expectedQuantity?: number;
  actualQuantity?: number;
  itemIds?: string[];
}

export interface PackingIntegrityResult {
  sourceAvailable: boolean;
  isExactMatch: boolean;
  blockingCount: number;
  warningCount: number;
  expectedRows: number;
  packingRows: number;
  manualRows: number;
  excludedRows: number;
  checkedAt: string;
  issues: PackingIntegrityIssue[];
}

/**
 * Compares the frozen operational packing snapshot against the current booking
 * source without mutating either side. Package headers are excluded in the same
 * way as sync-booking-to-packing: only leaf/packable booking products count.
 */
export const comparePackingSnapshot = (
  products: PackingIntegrityProduct[],
  items: PackingIntegrityItem[],
  sourceKnown = products.length > 0,
): PackingIntegrityResult => {
  const checkedAt = new Date().toISOString();
  const sourceAvailable = sourceKnown;

  const activeProducts = products.filter((product) => !product.source_missing_since);
  const removedProductIds = new Set(
    products.filter((product) => Boolean(product.source_missing_since)).map((product) => product.id),
  );
  const parentIds = new Set(
    activeProducts
      .map((product) => product.parent_product_id)
      .filter((id): id is string => Boolean(id)),
  );
  const expected = activeProducts.filter((product) => !parentIds.has(product.id));
  const expectedById = new Map(expected.map((product) => [product.id, product]));

  const manualRows = items.filter((item) => !item.booking_product_id && item.manual_name).length;
  const excludedRows = items.filter((item) => item.excluded).length;
  const linkedItems = items.filter((item) => Boolean(item.booking_product_id));
  const itemsByProduct = new Map<string, PackingIntegrityItem[]>();

  linkedItems.forEach((item) => {
    const productId = item.booking_product_id!;
    const bucket = itemsByProduct.get(productId) || [];
    bucket.push(item);
    itemsByProduct.set(productId, bucket);
  });

  const issues: PackingIntegrityIssue[] = [];

  items
    .filter((item) => !item.booking_product_id && Boolean(item.manual_name) && !item.excluded)
    .forEach((item) => {
      issues.push({
        type: 'manual_item',
        severity: 'warning',
        bookingProductId: null,
        name: item.manual_name || 'Manuell rad',
        actualQuantity: Number(item.quantity_to_pack || 0),
        itemIds: [item.id],
      });
    });

  expected.forEach((product) => {
    const matching = itemsByProduct.get(product.id) || [];
    if (matching.length === 0) {
      issues.push({
        type: 'missing_item',
        severity: 'blocking',
        bookingProductId: product.id,
        name: product.name,
        expectedQuantity: Number(product.quantity || 0),
      });
      return;
    }

    if (matching.length > 1) {
      issues.push({
        type: 'duplicate_item',
        severity: 'blocking',
        bookingProductId: product.id,
        name: product.name,
        expectedQuantity: Number(product.quantity || 0),
        actualQuantity: matching.reduce((sum, item) => sum + Number(item.quantity_to_pack || 0), 0),
        itemIds: matching.map((item) => item.id),
      });
      return;
    }

    const [item] = matching;
    if (item.excluded) {
      issues.push({
        type: 'excluded_source_item',
        severity: 'blocking',
        bookingProductId: product.id,
        name: product.name,
        expectedQuantity: Number(product.quantity || 0),
        actualQuantity: Number(item.quantity_to_pack || 0),
        itemIds: [item.id],
      });
    }

    if (Number(item.quantity_to_pack || 0) !== Number(product.quantity || 0)) {
      issues.push({
        type: 'quantity_mismatch',
        severity: 'blocking',
        bookingProductId: product.id,
        name: product.name,
        expectedQuantity: Number(product.quantity || 0),
        actualQuantity: Number(item.quantity_to_pack || 0),
        itemIds: [item.id],
      });
    }
  });

  itemsByProduct.forEach((matching, productId) => {
    if (expectedById.has(productId)) return;
    // Kända borttagningar hanteras av 14-dagarsflödet och dess attestpanel.
    // De ska inte samtidigt ge den generiska integritetsvarningen.
    if (removedProductIds.has(productId)) return;
    matching.forEach((item) => {
      issues.push({
        type: 'orphan_item',
        severity: item.excluded ? 'warning' : 'blocking',
        bookingProductId: productId,
        name: item.manual_name || 'Artikel som inte längre finns i bokningen',
        actualQuantity: Number(item.quantity_to_pack || 0),
        itemIds: [item.id],
      });
    });
  });

  const blockingCount = issues.filter((issue) => issue.severity === 'blocking').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    sourceAvailable,
    isExactMatch: blockingCount === 0,
    blockingCount,
    warningCount,
    expectedRows: expected.length,
    packingRows: linkedItems.length,
    manualRows,
    excludedRows,
    checkedAt,
    issues,
  };
};
