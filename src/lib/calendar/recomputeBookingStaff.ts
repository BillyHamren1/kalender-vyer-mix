/**
 * STEG 4N — Tenant-säker wrapper för BSA-recompute.
 *
 * Legacy-RPC `recompute_booking_staff_for_day(p_booking_id, p_date)` saknar
 * organization_id och kan därför träffa en bokning med samma booking_id i en
 * annan organisation. All aktiv runtime-kod ska istället gå via
 * `recompute_booking_staff_for_day_v2(p_organization_id, p_booking_id, p_date)`.
 *
 * Fail-closed: saknas organization_id körs INGEN RPC alls. Det finns medvetet
 * ingen fallback till legacy-funktionen.
 *
 * Beteende i UI ändras inte: felet är fortsatt icke-fatalt (loggas), precis
 * som tidigare call-sites gjorde.
 */
import { supabase } from '@/integrations/supabase/client';
import { getOrganizationId } from '@/hooks/useOrganizationId';

export type RecomputeBsaResult =
  | { ok: true }
  | { ok: false; reason: 'missing_args' | 'missing_organization' | 'rpc_error'; error?: unknown };

export async function recomputeBookingStaffForDay(
  bookingId: string | null | undefined,
  date: string | null | undefined,
  options?: { organizationId?: string | null; context?: string },
): Promise<RecomputeBsaResult> {
  const ctx = options?.context ?? 'recomputeBookingStaffForDay';

  if (!bookingId || !date) {
    console.warn(`[${ctx}] BSA recompute skipped — saknar bookingId/date`, { bookingId, date });
    return { ok: false, reason: 'missing_args' };
  }

  let organizationId = options?.organizationId ?? null;
  if (!organizationId) {
    try {
      organizationId = await getOrganizationId();
    } catch (e) {
      console.warn(`[${ctx}] kunde inte slå upp organization_id`, e);
      organizationId = null;
    }
  }

  if (!organizationId) {
    // Fail-closed — aldrig legacy-RPC som fallback (tenant-osäker).
    console.warn(`[${ctx}] BSA recompute skipped — organization_id saknas (fail-closed)`, {
      bookingId,
      date,
    });
    return { ok: false, reason: 'missing_organization' };
  }

  try {
    const { error } = await supabase.rpc('recompute_booking_staff_for_day_v2' as any, {
      p_organization_id: organizationId,
      p_booking_id: bookingId,
      p_date: date,
    });
    if (error) {
      console.warn(`[${ctx}] BSA recompute failed (non-fatal)`, error);
      return { ok: false, reason: 'rpc_error', error };
    }
    return { ok: true };
  } catch (e) {
    console.warn(`[${ctx}] BSA recompute failed (non-fatal)`, e);
    return { ok: false, reason: 'rpc_error', error: e };
  }
}
