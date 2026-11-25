/**
 * Same-revision produktreparation + products-pending-markör.
 *
 * När en revision applicerats med begränsat produktscope (WMS ej accepterat)
 * markeras den som products_pending. En senare accepterad produktsynk på
 * EXAKT samma revision får då ta importlåset igen (annars already_current)
 * och köra produktsynken. Kalenderreconcile är idempotent och lagernotiser
 * dedupas på revision, så inget dubbleras.
 *
 * Bakåtkompatibelt: saknas RPC:erna (före migration) blir resultatet
 * `rpc_unavailable` och importen beter sig exakt som tidigare.
 */
import { normalizeIncomingRevision, type IncomingRevision } from './canonicalRevisionGuard.ts';

export interface ProductRepairInput {
  bookingId: string;
  organizationId: string;
  incoming: IncomingRevision;
  ownerJobId?: string | null;
  leaseSeconds?: number;
}

export type ProductRepairResult =
  | { ok: true; decision: 'reserved'; reservationToken: string }
  | { ok: false; decision: 'not_pending' | 'not_current' | 'booking_import_locked' | 'invalid_input' | 'rpc_unavailable'; error?: string };

export function reserveSameRevisionProductRepair(supabase: any, input: ProductRepairInput): Promise<ProductRepairResult> {
  return reserveSameRevisionRepair(supabase, 'reserve_booking_product_repair', input);
}

/**
 * Same-revision kalenderreparation: revisionen är redan applicerad men en
 * ofullbordad kalender-baseline finns kvar (booking_source_state.calendar_baseline).
 * Ger importlåset tillbaka så kalendern kan spegla R; produkter styrs
 * fortfarande enbart av produktmandatet.
 */
export function reserveSameRevisionCalendarRepair(supabase: any, input: ProductRepairInput): Promise<ProductRepairResult> {
  return reserveSameRevisionRepair(supabase, 'reserve_booking_calendar_repair', input);
}

async function reserveSameRevisionRepair(
  supabase: any,
  rpcName: 'reserve_booking_product_repair' | 'reserve_booking_calendar_repair',
  input: ProductRepairInput,
): Promise<ProductRepairResult> {
  const inc = normalizeIncomingRevision(input.incoming);
  if (!inc) return { ok: false, decision: 'invalid_input' };
  let res: any;
  try {
    res = await supabase.rpc(rpcName, {
      p_organization_id: input.organizationId,
      p_booking_id: input.bookingId,
      p_source_updated_at: inc.sourceUpdatedAt,
      p_source_version: inc.sourceVersion,
      p_source_status: inc.sourceStatus,
      p_owner_job_id: input.ownerJobId ?? null,
      p_lease_seconds: input.leaseSeconds ?? 300,
    });
  } catch (err: any) {
    return { ok: false, decision: 'rpc_unavailable', error: String(err?.message ?? err) };
  }
  if (res?.error) return { ok: false, decision: 'rpc_unavailable', error: res.error.message ?? 'unknown' };
  const d = String(res?.data?.decision ?? '');
  if (d === 'reserved' && typeof res?.data?.reservation_token === 'string') {
    return { ok: true, decision: 'reserved', reservationToken: res.data.reservation_token };
  }
  if (d === 'not_pending' || d === 'not_current' || d === 'booking_import_locked' || d === 'invalid_input') {
    return { ok: false, decision: d };
  }
  return { ok: false, decision: 'rpc_unavailable', error: `unexpected_decision:${d}` };
}

export interface ProductsPendingInput {
  bookingId: string;
  organizationId: string;
  reservationToken: string;
  pending: boolean;
  reason?: string | null;
  code?: string | null;
}

export async function setProductsPending(
  supabase: any,
  input: ProductsPendingInput,
): Promise<{ ok: boolean; decision: string; error?: string }> {
  try {
    const res = await supabase.rpc('set_booking_products_pending', {
      p_organization_id: input.organizationId,
      p_booking_id: input.bookingId,
      p_reservation_token: input.reservationToken,
      p_pending: input.pending,
      p_reason: input.reason ?? null,
      p_code: input.code ?? null,
    });
    if (res?.error) return { ok: false, decision: 'rpc_unavailable', error: res.error.message };
    const d = String(res?.data?.decision ?? '');
    return { ok: d === 'set' || d === 'cleared' || d === 'unchanged', decision: d };
  } catch (err: any) {
    return { ok: false, decision: 'rpc_unavailable', error: String(err?.message ?? err) };
  }
}
