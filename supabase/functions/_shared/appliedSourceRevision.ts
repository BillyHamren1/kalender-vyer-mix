/**
 * Läser den senast APPLICERADE canonical source-revisionen för en bokning.
 * Används som stale-skydd: en tombstone med äldre source-revision än den
 * redan applicerade får aldrig skriva över nyare canonical data.
 *
 * Revisionen loggas i booking_changes (change_type 'cancellation_source'
 * eller valfri rad som bär new_values.source_revision / source_updated_at).
 */
import type { LocalAppliedRevision } from './singleBookingSource.ts';

export async function loadAppliedSourceRevision(
  supabase: any,
  bookingId: string,
  organizationId: string,
): Promise<LocalAppliedRevision | undefined> {
  try {
    const { data } = await supabase
      .from('booking_changes')
      .select('new_values, created_at')
      .eq('booking_id', bookingId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50);

    let bestIso: string | null = null;
    let bestNum: number | null = null;

    for (const row of data ?? []) {
      const nv: any = row?.new_values ?? {};
      const raw = nv.source_revision ?? nv.source_updated_at ?? null;
      if (raw === null || raw === undefined) continue;
      if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw))) {
        const n = Number(raw);
        if (Number.isFinite(n) && (bestNum === null || n > bestNum)) bestNum = n;
        continue;
      }
      if (typeof raw === 'string') {
        const t = Date.parse(raw);
        if (Number.isFinite(t) && (bestIso === null || t > Date.parse(bestIso))) bestIso = raw;
      }
    }

    if (bestIso === null && bestNum === null) return undefined;
    return { sourceUpdatedAt: bestIso, sourceVersion: bestNum };
  } catch (_err) {
    // Läsfel får aldrig öppna upp för destruktiv hantering: returnera undefined
    // (ingen stale-info) — övriga tombstone-krav gäller fortfarande.
    return undefined;
  }
}
