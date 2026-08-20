// Kö för bokningsändringar som lagret måste ta emot innan packlistan ändras.
// Spegling av src/lib/packing/shortNoticeChange.ts — ändra båda samtidigt.

export const PACKING_SHORT_NOTICE_DAYS = 14;

export type PackingChangeType = 'item_added' | 'item_removed' | 'quantity_changed';

export interface PackingChangeDraft {
  booking_product_id: string | null;
  packing_list_item_id?: string | null;
  change_type: PackingChangeType;
  product_name: string | null;
  sku: string | null;
  old_quantity: number | null;
  new_quantity: number | null;
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

export function requiresWarehouseAcknowledgement(input: {
  daysUntilRig: number | null;
  packingStatus: string | null;
  hasPackedQuantity?: boolean;
}): boolean {
  const packingStarted = input.packingStatus !== null && input.packingStatus !== 'planning';
  return isShortNotice(input.daysUntilRig) || packingStarted || Boolean(input.hasPackedQuantity);
}

/**
 * Skriver (idempotent) ändringar till packing_change_requests och stänger
 * pending-rader som inte längre stämmer med bokningen.
 * Returnerar antal pending short_notice-rader efter skrivningen.
 */
export async function queuePackingChangeRequests(
  supabase: any,
  params: {
    packingId: string;
    bookingId: string;
    organizationId: string;
    rigDate: string | null;
    drafts: PackingChangeDraft[];
    now?: Date;
  }
): Promise<{ pendingShortNotice: number; queued: number }> {
  const { packingId, bookingId, organizationId, rigDate, drafts } = params;
  const days = daysUntil(rigDate, params.now ?? new Date());
  const urgency = isShortNotice(days) ? 'short_notice' : 'normal';

  const { data: existing } = await supabase
    .from('packing_change_requests')
    .select('id, booking_product_id, change_type, old_quantity, new_quantity')
    .eq('packing_id', packingId)
    .eq('booking_id', bookingId)
    .eq('status', 'pending');

  const keyOf = (bp: string | null, t: string) => `${bp ?? 'null'}|${t}`;
  const draftKeys = new Set(drafts.map((d) => keyOf(d.booking_product_id, d.change_type)));

  // Stäng rader som bokningen inte längre stödjer (ändringen är tillbakatagen).
  const stale = (existing || []).filter(
    (row: any) => !draftKeys.has(keyOf(row.booking_product_id, row.change_type))
  );
  if (stale.length > 0) {
    await supabase
      .from('packing_change_requests')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .in('id', stale.map((r: any) => r.id));
  }

  const existingByKey = new Map(
    (existing || []).map((r: any) => [keyOf(r.booking_product_id, r.change_type), r])
  );

  let queued = 0;
  for (const draft of drafts) {
    const key = keyOf(draft.booking_product_id, draft.change_type);
    const found: any = existingByKey.get(key);
    const payload = {
      organization_id: organizationId,
      packing_id: packingId,
      booking_id: bookingId,
      booking_product_id: draft.booking_product_id,
      packing_list_item_id: draft.packing_list_item_id ?? null,
      change_type: draft.change_type,
      product_name: draft.product_name,
      sku: draft.sku,
      old_quantity: draft.old_quantity,
      new_quantity: draft.new_quantity,
      urgency,
      days_until_rig: days,
      status: 'pending',
    };
    if (found) {
      await supabase
        .from('packing_change_requests')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', found.id);
    } else {
      const { error } = await supabase.from('packing_change_requests').insert(payload);
      if (error) {
        console.error('[packingChangeRequests] insert failed', error);
        continue;
      }
    }
    queued++;
  }

  const { count } = await supabase
    .from('packing_change_requests')
    .select('id', { count: 'exact', head: true })
    .eq('packing_id', packingId)
    .eq('status', 'pending')
    .eq('urgency', 'short_notice');

  const pendingShortNotice = count || 0;

  await supabase
    .from('packing_projects')
    .update({
      blocked_by_short_notice_change: pendingShortNotice > 0,
      needs_packing_review: pendingShortNotice > 0 ? true : undefined,
      needs_packing_review_reason:
        pendingShortNotice > 0 ? 'booking_changed_after_packing_started' : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packingId)
    .eq('organization_id', organizationId);

  return { pendingShortNotice, queued };
}
