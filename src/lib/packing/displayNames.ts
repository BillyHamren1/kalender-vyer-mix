/**
 * Shared product-name display helpers used by all packing views
 * (VerificationView, ManualChecklistView, DesktopChecklistView).
 *
 * Keep ALL formatting/classification rules here — never copy these
 * regexes into a component.
 */

/** Strip leading hierarchy markers like "↳", "└", "L,", "⦿", commas/spaces. */
export const cleanProductName = (name: string): string => {
  return name.replace(/^[↳└⦿\s,L\-–—]+/, '').trim();
};

/** Convert SCREAMING text to Title Case while preserving abbreviations + measurements. */
export const formatToTitleCase = (text: string): string => {
  const upperCount = (text.match(/[A-ZÅÄÖ]/g) || []).length;
  const lowerCount = (text.match(/[a-zåäö]/g) || []).length;
  if (lowerCount >= upperCount) return text;

  return text.split(' ').map(word => {
    if (word.length <= 3 && /^[A-ZÅÄÖ0-9]+$/.test(word)) return word;
    if (/\d/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

export interface BookingProductLite {
  id?: string | null;
  name?: string | null;
  parent_product_id?: string | null;
  parent_package_id?: string | null;
  is_package_component?: boolean | null;
}

export interface ItemLite {
  id: string;
  booking_products?: BookingProductLite | null;
}

/** Build a parentProductId -> child rows lookup from a packing list. */
export const buildChildrenByParent = <T extends ItemLite>(items: T[]): Record<string, T[]> => {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    const parentId = item.booking_products?.parent_product_id;
    if (parentId) {
      (map[parentId] ||= []).push(item);
    }
  }
  return map;
};

export interface RowClassification {
  isChild: boolean;
  isParent: boolean;
  isPackageComponent: boolean;
  prefixIndicator: string;
  displayName: string;
}

/**
 * Classify a packing row + produce its display name.
 * Returns the same shape regardless of view, so all packing components
 * render with identical rules.
 */
export const classifyAndFormatRow = <T extends ItemLite>(
  item: T,
  childrenByParent: Record<string, T[]>,
): RowClassification => {
  const rawName = item.booking_products?.name || 'Unknown product';
  const trimmedName = rawName.trimStart();
  const productId = item.booking_products?.id;

  const isChildByRelation = !!(
    item.booking_products?.parent_product_id ||
    item.booking_products?.parent_package_id ||
    item.booking_products?.is_package_component
  );
  const isChildByPrefix = (
    trimmedName.startsWith('↳') ||
    trimmedName.startsWith('└') ||
    trimmedName.startsWith('L,') ||
    trimmedName.startsWith('⦿')
  );
  const isChild = isChildByRelation || isChildByPrefix;

  const hasChildren = productId ? (childrenByParent[productId]?.length || 0) > 0 : false;
  const isParent = !isChild && hasChildren;

  const isPackageComponent = !!(item.booking_products?.is_package_component) || trimmedName.startsWith('⦿');
  const prefixIndicator = isChild ? (isPackageComponent ? '⦿ ' : '↳ ') : '';

  const cleaned = cleanProductName(rawName);
  const displayName = isChild ? formatToTitleCase(cleaned) : cleaned.toUpperCase();

  return { isChild, isParent, isPackageComponent, prefixIndicator, displayName };
};
