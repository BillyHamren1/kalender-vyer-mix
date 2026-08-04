/**
 * Läser den senast APPLICERADE canonical source-revisionen för en bokning.
 * Används som stale-skydd: en tombstone med äldre (eller motsägelsefull)
 * source-revision än den redan applicerade får aldrig skriva över nyare
 * canonical data.
 *
 * KÄLLA:
 *   `bookings` saknar i dag ett dedikerat fält för senast applicerad canonical
 *   Booking-revision, därför är `booking_changes` primär källa. VIKTIGT:
 *   loadern filtrerar server-side på REVISIONSBÄRANDE change_types — den läser
 *   alltså aldrig "de 50 senaste raderna oavsett typ", vilket tidigare kunde
 *   dölja en giltig revision bakom orelaterade ändringar (fail-open).
 *
 * FAIL-CLOSED:
 *   Databasfel, oparsbar lagrad revision, motsägelsefull status på samma
 *   revision, eller ett historik-tak som slår i → `ok:false`. Callers MÅSTE
 *   hantera `ok:false` innan evaluateDestructiveAction anropas.
 *
 * INGA SYNTETISKA REVISIONER:
 *   Loadern slår aldrig ihop högsta timestamp från en rad med högsta version
 *   från en annan. Varje returnerad post kommer från EN verklig historikrad.
 */
import type { LocalAppliedRevision } from './singleBookingSource.ts';

/** Change-types som faktiskt kan bära en canonical source-revision. */
export const REVISION_BEARING_CHANGE_TYPES = [
  'source_revision',
  'cancellation_source',
] as const;

/** Hårt tak; slås det i är historiken osäker → fail-closed, aldrig "saknas". */
const MAX_REVISION_ROWS = 1000;

export interface AppliedRevisionLoadFound {
  ok: true;
  found: true;
  /** Primär post (föredragen ordning: timestamp före version). */
  revision: LocalAppliedRevision;
  /** Senaste verkliga post per revisionstyp (aldrig sammanslagna). */
  revisions: LocalAppliedRevision[];
  error?: undefined;
  retriable?: undefined;
}
export interface AppliedRevisionLoadEmpty {
  ok: true;
  found: false;
  revision: null;
  revisions: [];
  error?: undefined;
  retriable?: undefined;
}
export interface AppliedRevisionLoadError {
  ok: false;
  found?: undefined;
  revision?: undefined;
  revisions?: undefined;
  error: string;
  retriable: true;
}
export type AppliedRevisionLoadResult =
  | AppliedRevisionLoadFound
  | AppliedRevisionLoadEmpty
  | AppliedRevisionLoadError;

/** Strikt numerisk sträng (tillåter inte NaN/Infinity/decimaler/tecken). */
function parseStrictVersion(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && Number.isInteger(raw) && raw >= 0 ? raw : null;
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

function normStatus(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().toUpperCase() : null;
}

interface RevisionEntry {
  kind: 'timestamp' | 'version';
  order: number;
  raw: string | number;
  status: string | null;
  changeType: string | null;
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
      .select('change_type, new_values, created_at')
      .eq('booking_id', bookingId)
      .eq('organization_id', organizationId)
      .in('change_type', REVISION_BEARING_CHANGE_TYPES as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(MAX_REVISION_ROWS);
    if (res?.error) {
      return { ok: false, error: `booking_changes_read:${res.error.message ?? 'unknown'}`, retriable: true };
    }
    data = Array.isArray(res?.data) ? res.data : [];
  } catch (err: any) {
    return { ok: false, error: `booking_changes_read_exception:${err?.message ?? String(err)}`, retriable: true };
  }

  if ((data?.length ?? 0) >= MAX_REVISION_ROWS) {
    // Historiken kan vara avklippt → vi vet inte om vi ser den senaste.
    return { ok: false, error: 'revision_history_truncated', retriable: true };
  }

  const entries: RevisionEntry[] = [];
  for (const row of data ?? []) {
    const nv: any = row?.new_values ?? {};
    const raw = nv.source_revision ?? nv.source_updated_at ?? null;
    if (raw === null || raw === undefined || raw === '') continue;

    const status = normStatus(nv.source_status ?? nv.status);
    const changeType = typeof row?.change_type === 'string' ? row.change_type : null;

    const asVersion = parseStrictVersion(raw);
    if (asVersion !== null) {
      entries.push({ kind: 'version', order: asVersion, raw, status, changeType });
      continue;
    }
    const asTs = parseStrictTimestamp(raw);
    if (asTs !== null) {
      entries.push({ kind: 'timestamp', order: asTs, raw: String(raw).trim(), status, changeType });
      continue;
    }
    // Lagrad revision går inte att tolka — dölj inte felet, fail-closed.
    return {
      ok: false,
      error: `stored_revision_unparseable:${String(raw).slice(0, 60)}`,
      retriable: true,
    };
  }

  if (entries.length === 0) {
    return { ok: true, found: false, revision: null, revisions: [] };
  }

  const picked: LocalAppliedRevision[] = [];
  for (const kind of ['timestamp', 'version'] as const) {
    const ofKind = entries.filter((e) => e.kind === kind);
    if (ofKind.length === 0) continue;
    const max = Math.max(...ofKind.map((e) => e.order));
    const top = ofKind.filter((e) => e.order === max);
    // Samma högsta revision men motsägelsefull status → fail-closed.
    const statuses = new Set(top.map((e) => e.status));
    if (statuses.size > 1) {
      return { ok: false, error: 'conflicting_stored_source_revision', retriable: true };
    }
    const winner = top[0];
    picked.push({
      sourceUpdatedAt: kind === 'timestamp' ? String(winner.raw) : null,
      sourceVersion: kind === 'version' ? Number(winner.raw) : null,
      sourceStatus: winner.status,
      changeType: winner.changeType,
    });
  }

  return { ok: true, found: true, revision: picked[0], revisions: picked };
}

/**
 * Loggar en applicerad canonical Booking-revision (NORMAL import, found:true).
 * Säkerhetskritiskt: utan denna logg kan stale-skyddet inte jämföra en
 * cancellation-tombstone mot senaste vanliga import.
 *
 * Idempotent: samma (change_type, revision) loggas bara en gång.
 */
export async function recordAppliedSourceRevision(
  supabase: any,
  input: {
    bookingId: string;
    organizationId: string;
    revision: string | number | null | undefined;
    /** Canonical status från Booking-envelopen (aldrig lokalt härledd). */
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
  if (!(REVISION_BEARING_CHANGE_TYPES as readonly string[]).includes(changeType)) {
    return { ok: false, error: `non_revision_bearing_change_type:${changeType}` };
  }
  const sourceStatus = normStatus(input.sourceStatus);
  try {
    const readRes = await supabase
      .from('booking_changes')
      .select('id, new_values')
      .eq('booking_id', input.bookingId)
      .eq('organization_id', input.organizationId)
      .eq('change_type', changeType)
      .limit(MAX_REVISION_ROWS);
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
        source_status: sourceStatus,
        logged_at: new Date().toISOString(),
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
