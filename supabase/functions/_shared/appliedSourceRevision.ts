/**
 * Läser den senast APPLICERADE canonical source-revisionen för en bokning.
 * Används som stale-skydd: en tombstone med äldre, motsägelsefull eller
 * ojämförbar source-revision får aldrig skriva över nyare canonical data.
 *
 * KÄLLA:
 *   `bookings` saknar i dag ett dedikerat fält för senast applicerad canonical
 *   Booking-revision, därför är `booking_changes` primär källa. Loadern
 *   filtrerar server-side på REVISIONSBÄRANDE change_types — den läser aldrig
 *   "de N senaste raderna oavsett typ" (tidigare fail-open-lucka).
 *
 * STEG 2F – EN AUTHORITATIVE REVISIONSTYP PER BOKNING:
 *   Den senast applicerade revisionsbärande raden (högst `created_at`) är
 *   authoritative. Dess revisionstyp ('timestamp', 'version' eller 'both' när
 *   EN och samma rad bär båda värdena) styr all jämförelse. Om någon annan
 *   revisionsbärande rad bär en revisionstyp som den authoritative raden inte
 *   har → historiken är blandad och ojämförbar:
 *     ok:false, error:'mixed_incomparable_revision_history' (permanent).
 *   Ett typbyte gör alltså ALDRIG äldre historik automatiskt jämförbar.
 *
 * FAIL-CLOSED:
 *   Databasfel, oparsbar lagrad revision, motsägelsefull status på samma
 *   revision, blandad historik eller ett historik-tak som slår i → `ok:false`.
 *   Callers MÅSTE hantera `ok:false` innan evaluateDestructiveAction anropas.
 *
 * INGA SYNTETISKA REVISIONER:
 *   Värden från olika historikrader slås aldrig ihop. Den returnerade
 *   revisionen kommer alltid från EN verklig rad.
 */
import type { LocalAppliedRevision } from './singleBookingSource.ts';

/** Change-types som faktiskt kan bära en canonical source-revision. */
export const REVISION_BEARING_CHANGE_TYPES = [
  'source_revision',
  'cancellation_source',
] as const;

/**
 * Säkerhetstak. Queryn är redan server-side-filtrerad på revisionsbärande
 * change_types, så taket nås i praktiken bara vid onormal historik. Slås det i
 * är resultatet fail-closed och PERMANENT (retriable:false) — en retry minskar
 * inte historiken; det kräver operativ åtgärd (arkivering/dedikerat fält).
 */
const MAX_REVISION_ROWS = 200;

export type RevisionKind = 'timestamp' | 'version' | 'both';

export interface AppliedRevisionLoadFound {
  ok: true;
  found: true;
  /** Authoritative revisionstyp för bokningen. */
  revisionKind: RevisionKind;
  /** Den verkliga historikrad som är senaste canonical revision. */
  revision: LocalAppliedRevision;
  /** Bakåtkompatibel vy: alltid exakt den authoritative posten. */
  revisions: LocalAppliedRevision[];
  error?: undefined;
  retriable?: undefined;
}
export interface AppliedRevisionLoadEmpty {
  ok: true;
  found: false;
  revisionKind?: undefined;
  revision: null;
  revisions: [];
  error?: undefined;
  retriable?: undefined;
}
export interface AppliedRevisionLoadError {
  ok: false;
  found?: undefined;
  revisionKind?: undefined;
  revision?: undefined;
  revisions?: undefined;
  error: string;
  retriable: boolean;
}
export type AppliedRevisionLoadResult =
  | AppliedRevisionLoadFound
  | AppliedRevisionLoadEmpty
  | AppliedRevisionLoadError;

/** Strikt numerisk version (inga NaN/Infinity/decimaler/negativa tal). */
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
  timestamp: string | null;
  timestampMs: number | null;
  version: number | null;
  status: string | null;
  changeType: string | null;
  createdAtMs: number;
}

function entryKinds(e: RevisionEntry): Array<'timestamp' | 'version'> {
  const kinds: Array<'timestamp' | 'version'> = [];
  if (e.timestampMs !== null) kinds.push('timestamp');
  if (e.version !== null) kinds.push('version');
  return kinds;
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
    // Permanent: en retry ger samma resultat, det krävs operativ åtgärd.
    console.error('[appliedSourceRevision] revision history truncated — operational action required', JSON.stringify({
      booking_id: bookingId,
      organization_id: organizationId,
      max_rows: MAX_REVISION_ROWS,
      action: 'archive booking_changes revision rows or introduce dedicated last_applied_source_revision field',
    }));
    return { ok: false, error: 'revision_history_truncated', retriable: false };
  }

  const entries: RevisionEntry[] = [];
  for (const row of data ?? []) {
    const nv: any = row?.new_values ?? {};
    const changeType = typeof row?.change_type === 'string' ? row.change_type : null;
    const status = normStatus(nv.source_status ?? nv.status);
    const createdAtMs = parseStrictTimestamp(row?.created_at) ?? 0;

    let timestamp: string | null = null;
    let timestampMs: number | null = null;
    let version: number | null = null;

    // Explicita fält vinner; `source_revision` tolkas efter sin faktiska form.
    const explicitTs = nv.source_updated_at ?? null;
    if (explicitTs !== null && explicitTs !== undefined && explicitTs !== '') {
      const ms = parseStrictTimestamp(explicitTs);
      if (ms === null) {
        return { ok: false, error: `stored_revision_unparseable:${String(explicitTs).slice(0, 60)}`, retriable: false };
      }
      timestamp = String(explicitTs).trim();
      timestampMs = ms;
    }
    const explicitVer = nv.source_version ?? null;
    if (explicitVer !== null && explicitVer !== undefined && explicitVer !== '') {
      const v = parseStrictVersion(explicitVer);
      if (v === null) {
        return { ok: false, error: `stored_revision_unparseable:${String(explicitVer).slice(0, 60)}`, retriable: false };
      }
      version = v;
    }

    const raw = nv.source_revision ?? null;
    if (raw !== null && raw !== undefined && raw !== '') {
      const asVersion = parseStrictVersion(raw);
      const asTs = asVersion === null ? parseStrictTimestamp(raw) : null;
      if (asVersion !== null) {
        if (version === null) version = asVersion;
      } else if (asTs !== null) {
        if (timestampMs === null) {
          timestamp = String(raw).trim();
          timestampMs = asTs;
        }
      } else {
        return { ok: false, error: `stored_revision_unparseable:${String(raw).slice(0, 60)}`, retriable: false };
      }
    }

    if (timestampMs === null && version === null) continue;
    entries.push({ timestamp, timestampMs, version, status, changeType, createdAtMs });
  }

  if (entries.length === 0) {
    return { ok: true, found: false, revision: null, revisions: [] };
  }

  // Motsägelsefull status på EXAKT samma revisionsvärde → fail-closed.
  const statusByValue = new Map<string, string | null>();
  for (const e of entries) {
    const keys: string[] = [];
    if (e.timestampMs !== null) keys.push(`t:${e.timestampMs}`);
    if (e.version !== null) keys.push(`v:${e.version}`);
    for (const k of keys) {
      if (statusByValue.has(k)) {
        if (statusByValue.get(k) !== e.status) {
          return { ok: false, error: 'conflicting_stored_source_revision', retriable: false };
        }
      } else {
        statusByValue.set(k, e.status);
      }
    }
  }

  // Authoritative rad = senast APPLICERADE revisionsbärande rad (created_at).
  // Aldrig "första i arrayen" och aldrig timestamp bara för att den finns.
  const authoritative = entries.reduce((best, e) => (e.createdAtMs > best.createdAtMs ? e : best), entries[0]);
  const authKinds = entryKinds(authoritative);

  // Blandad historik: någon annan rad bär en revisionstyp som den
  // authoritative raden inte har → ordningen kan inte fastställas säkert.
  for (const e of entries) {
    for (const kind of entryKinds(e)) {
      if (!authKinds.includes(kind)) {
        return { ok: false, error: 'mixed_incomparable_revision_history', retriable: false };
      }
    }
  }

  const revisionKind: RevisionKind =
    authKinds.length === 2 ? 'both' : authKinds[0];

  const revision: LocalAppliedRevision = {
    sourceUpdatedAt: authoritative.timestamp,
    sourceVersion: authoritative.version,
    sourceStatus: authoritative.status,
    changeType: authoritative.changeType,
  };

  return { ok: true, found: true, revisionKind, revision, revisions: [revision] };
}

/**
 * Loggar en applicerad canonical Booking-revision (NORMAL import, found:true).
 * Säkerhetskritiskt: utan denna logg kan stale-skyddet inte jämföra en
 * cancellation-tombstone mot senaste vanliga import.
 *
 * STEG 2F:
 *  - canonical status är OBLIGATORISK (en revision utan status kan inte
 *    användas för säker jämförelse och får därför inte loggas),
 *  - samma revision + samma status → idempotent (`already_current`),
 *  - samma revision + annan status → `conflicting_source_status_for_revision`,
 *  - samma revision där lagrad rad saknar status → fail-closed.
 */
export type RecordRevisionResult =
  | { ok: true; logged: boolean; already_current?: boolean }
  | { ok: false; error: string };

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
): Promise<RecordRevisionResult> {
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
  if (!sourceStatus) {
    return { ok: false, error: 'missing_canonical_source_status_for_revision' };
  }
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
    const existing = (readRes?.data ?? []).filter(
      (row: any) => String(row?.new_values?.source_revision ?? '') === String(revision),
    );
    if (existing.length > 0) {
      for (const row of existing) {
        const storedStatus = normStatus(row?.new_values?.source_status);
        if (!storedStatus) {
          return { ok: false, error: 'stored_revision_missing_source_status' };
        }
        if (storedStatus !== sourceStatus) {
          return { ok: false, error: 'conflicting_source_status_for_revision' };
        }
      }
      return { ok: true, logged: false, already_current: true };
    }

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
