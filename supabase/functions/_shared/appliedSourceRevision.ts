/**
 * Läser den senast APPLICERADE canonical source-revisionen för en bokning.
 * Används som stale-skydd: en tombstone med äldre source-revision än den
 * redan applicerade får aldrig skriva över nyare canonical data.
 *
 * KÄLLA (STEG 2D, uppgift D):
 *   Booking-projektionen (`bookings`) har i dag INGET dedikerat fält för
 *   senast applicerad canonical Booking-revision. Tills ett sådant fält finns
 *   är `booking_changes` PRIMÄR källa. Vi läser ALLA change_types som bär
 *   `new_values.source_revision` / `new_values.source_updated_at` — alltså inte
 *   bara `cancellation_source` — så att en cancellation-tombstone kan jämföras
 *   mot den senaste VANLIGA canonical importen (se recordAppliedSourceRevision).
 *
 * FAIL-CLOSED:
 *   Ett databasfel får ALDRIG se ut som "ingen revision". Därför returneras ett
 *   explicit resultatkontrakt där callers måste hantera `ok: false` innan
 *   evaluateDestructiveAction anropas.
 */
import type { LocalAppliedRevision } from './singleBookingSource.ts';

export type AppliedRevisionLoadResult =
  | { ok: true; found: true; revision: LocalAppliedRevision }
  | { ok: true; found: false; revision: null }
  | { ok: false; error: string; retriable: true };

/** Strikt numerisk sträng (tillåter inte NaN/Infinity/decimaler/tecken). */
function parseStrictVersion(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseStrictTimestamp(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export async function loadAppliedSourceRevision(
  supabase: any,
  bookingId: string,
  organizationId: string,
): Promise<AppliedRevisionLoadResult> {
  let data: any[] | null = null;
  try {
    const res = await supabase
      .from('booking_changes')
      .select('new_values, created_at')
      .eq('booking_id', bookingId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (res?.error) {
      return { ok: false, error: `booking_changes_read:${res.error.message ?? 'unknown'}`, retriable: true };
    }
    data = Array.isArray(res?.data) ? res.data : [];
  } catch (err: any) {
    return { ok: false, error: `booking_changes_read_exception:${err?.message ?? String(err)}`, retriable: true };
  }

  let bestIso: string | null = null;
  let bestIsoMs: number | null = null;
  let bestNum: number | null = null;

  for (const row of data ?? []) {
    const nv: any = row?.new_values ?? {};
    const raw = nv.source_revision ?? nv.source_updated_at ?? null;
    if (raw === null || raw === undefined) continue;

    const asVersion = parseStrictVersion(raw);
    if (asVersion !== null) {
      if (bestNum === null || asVersion > bestNum) bestNum = asVersion;
      continue;
    }
    const asTs = parseStrictTimestamp(raw);
    if (asTs !== null) {
      if (bestIsoMs === null || asTs > bestIsoMs) {
        bestIsoMs = asTs;
        bestIso = String(raw).trim();
      }
      continue;
    }
    // Lagrad revision går inte att tolka — dölj inte felet, fail-closed.
    return {
      ok: false,
      error: `stored_revision_unparseable:${String(raw).slice(0, 60)}`,
      retriable: true,
    };
  }

  if (bestIso === null && bestNum === null) {
    return { ok: true, found: false, revision: null };
  }
  return {
    ok: true,
    found: true,
    revision: { sourceUpdatedAt: bestIso, sourceVersion: bestNum },
  };
}

/**
 * Loggar en applicerad canonical Booking-revision (NORMAL import, found:true).
 * Detta är säkerhetskritiskt: utan denna logg kan stale-skyddet inte jämföra en
 * cancellation-tombstone mot senaste vanliga import.
 *
 * Idempotent: samma revision loggas bara en gång.
 * Returnerar `ok:false` vid läs-/skrivfel så att callern kan rapportera fel.
 */
export async function recordAppliedSourceRevision(
  supabase: any,
  input: {
    bookingId: string;
    organizationId: string;
    revision: string | number | null | undefined;
    sourceStatus?: string | null;
    changeType?: string;
  },
): Promise<{ ok: true; logged: boolean } | { ok: false; error: string }> {
  const revision = input.revision ?? null;
  if (revision === null || revision === '') return { ok: true, logged: false };
  if (parseStrictVersion(revision) === null && parseStrictTimestamp(revision) === null) {
    return { ok: false, error: 'invalid_source_revision_to_log' };
  }
  const changeType = input.changeType ?? 'source_revision';
  try {
    const readRes = await supabase
      .from('booking_changes')
      .select('id, new_values')
      .eq('booking_id', input.bookingId)
      .eq('organization_id', input.organizationId)
      .eq('change_type', changeType)
      .limit(50);
    if (readRes?.error) {
      return { ok: false, error: `booking_changes_read:${readRes.error.message ?? 'unknown'}` };
    }
    const already = (readRes?.data ?? []).some(
      (row: any) => String(row?.new_values?.source_revision ?? '') === String(revision),
    );
    if (already) return { ok: true, logged: false };

    const insertRes = await supabase.from('booking_changes').insert({
      booking_id: input.bookingId,
      organization_id: input.organizationId,
      change_type: changeType,
      changed_fields: ['source_revision'],
      previous_values: {},
      new_values: {
        source_revision: revision,
        source_status: input.sourceStatus ?? null,
      },
    });
    if (insertRes?.error) {
      return { ok: false, error: `booking_changes_insert:${insertRes.error.message ?? 'unknown'}` };
    }
    return { ok: true, logged: true };
  } catch (err: any) {
    return { ok: false, error: `booking_changes_exception:${err?.message ?? String(err)}` };
  }
}
