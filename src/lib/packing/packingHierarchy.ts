export type PackingRelationshipKind = 'package_member' | 'accessory' | 'standalone';

export interface PackingHierarchyItem {
  id: string;
  notes?: string | null;
  wms_line_id?: string | null;
  booking_products?: {
    id?: string | null;
    name?: string | null;
    parent_product_id?: string | null;
    is_package_component?: boolean | null;
  } | null;
}

export interface PackingHierarchyGroup<T extends PackingHierarchyItem> {
  key: string;
  packageName: string;
  members: T[];
  accessories: T[];
}

export type PackingHierarchyEntry<T extends PackingHierarchyItem> =
  | { kind: 'standalone'; item: T }
  | { kind: 'package'; group: PackingHierarchyGroup<T> };

const MEMBER_NOTE = /^(?:Paketmedlem i|Ingår i paket):\s*(.+)$/i;
const ACCESSORY_NOTE = /^Tillbehör till(?: paket)?:\s*(.+)$/i;

export const readPackingRelationship = (
  item: PackingHierarchyItem,
  parentNames: Map<string, string> = new Map(),
): { kind: PackingRelationshipKind; packageName: string | null; parentKey: string | null } => {
  const note = item.notes?.trim() || '';
  const accessoryMatch = note.match(ACCESSORY_NOTE);
  const memberMatch = note.match(MEMBER_NOTE);
  const parentId = item.booking_products?.parent_product_id || null;
  const parentName = parentId ? parentNames.get(parentId) || null : null;
  const wmsParentKey = item.wms_line_id?.includes('::')
    ? item.wms_line_id.split('::')[0]
    : null;

  if (accessoryMatch) {
    return {
      kind: 'accessory',
      packageName: accessoryMatch[1].trim(),
      parentKey: parentId || accessoryMatch[1].trim(),
    };
  }
  if (memberMatch) {
    return {
      kind: 'package_member',
      packageName: memberMatch[1].trim(),
      parentKey: parentId || wmsParentKey || memberMatch[1].trim(),
    };
  }
  if (parentId) {
    return {
      kind: item.booking_products?.is_package_component === true ? 'package_member' : 'accessory',
      packageName: parentName,
      parentKey: parentId,
    };
  }
  return { kind: 'standalone', packageName: null, parentKey: null };
};

export function buildPackingHierarchy<T extends PackingHierarchyItem>(
  items: T[],
): PackingHierarchyEntry<T>[] {
  const parentNames = new Map<string, string>();
  for (const item of items) {
    const product = item.booking_products;
    if (product?.id && product.name) parentNames.set(product.id, product.name);
  }

  const entries: PackingHierarchyEntry<T>[] = [];
  const groups = new Map<string, PackingHierarchyGroup<T>>();

  for (const item of items) {
    const relationship = readPackingRelationship(item, parentNames);
    if (relationship.kind === 'standalone' || !relationship.packageName || !relationship.parentKey) {
      entries.push({ kind: 'standalone', item });
      continue;
    }

    const key = `${relationship.parentKey}:${relationship.packageName}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        packageName: relationship.packageName,
        members: [],
        accessories: [],
      };
      groups.set(key, group);
      entries.push({ kind: 'package', group });
    }
    if (relationship.kind === 'package_member') group.members.push(item);
    else group.accessories.push(item);
  }

  return entries;
}