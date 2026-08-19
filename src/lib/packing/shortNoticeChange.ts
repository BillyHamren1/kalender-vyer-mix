// Frontend-spegling av supabase/functions/_shared/packingChangeRequests.ts.
// Ändra båda filerna samtidigt.

export const PACKING_SHORT_NOTICE_DAYS = 14;

export type PackingChangeType = 'item_added' | 'item_removed' | 'quantity_changed';

export interface PackingChangeRequest {
  id: string;
  packing_id: string;
  booking_id: string | null;
  booking_product_id: string | null;
  packing_list_item_id: string | null;
  change_type: PackingChangeType;
  product_name: string | null;
  sku: string | null;
  old_quantity: number | null;
  new_quantity: number | null;
  urgency: 'short_notice' | 'normal';
  days_until_rig: number | null;
  status: 'pending' | 'applied' | 'dismissed';
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export function daysUntil(dateStr: string | null | undefined, now = new Date()): number | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86400000);
}

export function isShortNotice(days: number | null): boolean {
  if (days === null) return false;
  return days < PACKING_SHORT_NOTICE_DAYS;
}

export function describeChange(change: PackingChangeRequest): string {
  const name = change.product_name || 'Okänd artikel';
  switch (change.change_type) {
    case 'item_added':
      return `Tillagd: ${name} (${change.new_quantity ?? 1} st)`;
    case 'item_removed':
      return `Borttagen: ${name} (${change.old_quantity ?? 1} st)`;
    case 'quantity_changed':
      return `Antal: ${name} ${change.old_quantity ?? '?'} st → ${change.new_quantity ?? '?'} st`;
    default:
      return name;
  }
}

export function changeLabel(type: PackingChangeType): string {
  if (type === 'item_added') return 'Tillagd';
  if (type === 'item_removed') return 'Borttagen';
  return 'Ändrat antal';
}
