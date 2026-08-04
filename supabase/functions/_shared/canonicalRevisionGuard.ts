/**
 * STEG 2G — CANONICAL REVISION GUARD
 *
 * En äldre canonical source-revision får ALDRIG:
 *  - appliceras på bokningen,
 *  - loggas som ny canonical revision,
 *  - göra jobbet applied/completed,
 *  - påverka batchcursorn.
 *
 * Modulen har två delar:
 *  1) REN JÄMFÖRELSE (`compareIncomingRevision`) — samma policy som
 *     `compareRevisions` i singleBookingSource.ts (ingen delvis jämförbarhet,
 *     fail-closed vid blandade typer), fast för normal found:true-import.
 *  2) ATOMISK ADVANCEMENT (`reserveCanonicalRevision` / `commitCanonicalRevision`
 *     / `releaseCanonicalRevision`) via PostgreSQL-RPC
 *     `advance_booking_source_revision` mot tabellen `booking_source_state`
 *     (unik nyckel organization_id + booking_id, radlås med FOR UPDATE).
 *
 * MODELL FÖR PARTIAL IMPORT (Modell 1 – pending/applied):
 *   reserve → import → commit. Misslyckas importen görs release, revisionen
 *   är då INTE applied och kan retryas. En ÄLDRE revision kan aldrig ta över
 *   en pending nyare revision (RPC:n nekar den som stale).
 */
import type { LocalAppliedRevision } from './singleBookingSource.ts';
import { parseSourceTimestamp, parseSourceVersion } from './singleBookingSource.ts';

export type RevisionGuardDecision =
  | 'apply'
  | 'already_current'
  | 'stale_source_revision'
  | 'conflicting_source_status_for_revision'
  | 'incomparable_source_revision'
  | 'invalid_incoming_revision';

export interface IncomingRevision {
  sourceUpdatedAt?: string | null;
  sourceVersion?: number | string | null;
  sourceStatus?: string | null;
}

export interface NormalizedIncomingRevision {
  sourceUpdatedAt: string | null;
  sourceUpdatedAtMs: number | null;
  sourceVersion: number | null;
  sourceStatus: string;
}

function normStatus(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().toUpperCase() : null;
}

/** Strikt normalisering av inkommande revision. Ogiltig → null. */
export function normalizeIncomingRevision(
  incoming: IncomingRevision,
): NormalizedIncomingRevision | null {
  const status = normStatus(incoming.sourceStatus);
  if (!status) return null;

  let sourceUpdatedAt: string | null = null;
  let sourceUpdatedAtMs: number | null = null;
  const rawTs = incoming.sourceUpdatedAt ?? null;
  if (rawTs !== null && rawTs !== undefined && String(rawTs).trim() !== '') {
    const ms = parseSourceTimestamp(String(rawTs));
    if (ms === null) return null;
    sourceUpdatedAt = String(rawTs).trim();
    sourceUpdatedAtMs = ms;
  }

  let sourceVersion: number | null = null;
  const rawVer = incoming.sourceVersion ?? null;
  if (rawVer !== null && rawVer !== undefined && String(rawVer).trim() !== '') {
    const v = parseSourceVersion(rawVer);
    if (v === null) return null;
    sourceVersion = v;
  }

  if (sourceUpdatedAt === null && sourceVersion === null) return null;
  return { sourceUpdatedAt, sourceUpdatedAtMs, sourceVersion, sourceStatus: status };
}

/**
 * Jämför inkommande canonical revision mot lokalt applicerad revision.
 * Ingen lokal revision → 'apply'.
 */
export function compareIncomingRevision(
  incoming: IncomingRevision,
  local: LocalAppliedRevision | null | undefined,
): RevisionGuardDecision {
  const inc = normalizeIncomingRevision(incoming);
  if (!inc) return 'invalid_incoming_revision';
  if (!local) return 'apply';

  const localTsMs = parseSourceTimestamp(local.sourceUpdatedAt ?? null);
  const localVer = parseSourceVersion(local.sourceVersion ?? null);
  if (localTsMs === null && localVer === null) return 'apply';

  // Ingen delvis jämförbarhet: inkommande måste bära ALLA lokala typer.
  if (localTsMs !== null && inc.sourceUpdatedAtMs === null) return 'incomparable_source_revision';
  if (localVer !== null && inc.sourceVersion === null) return 'incomparable_source_revision';

  let older = false;
  let newer = false;
  if (localTsMs !== null) {
    if ((inc.sourceUpdatedAtMs as number) < localTsMs) older = true;
    if ((inc.sourceUpdatedAtMs as number) > localTsMs) newer = true;
  }
  if (localVer !== null) {
    if ((inc.sourceVersion as number) < localVer) older = true;
    if ((inc.sourceVersion as number) > localVer) newer = true;
  }

  if (older) return 'stale_source_revision';
  if (newer) return 'apply';

  // Exakt samma revision.
  const localStatus = normStatus(local.sourceStatus);
  if (!localStatus) return 'conflicting_source_status_for_revision';
  return localStatus === inc.sourceStatus
    ? 'already_current'
    : 'conflicting_source_status_for_revision';
}

// ── ATOMISK ADVANCEMENT VIA RPC ───────────────────────────────────────────

export type AdvanceMode = 'reserve' | 'commit' | 'release';

export type AdvanceResult =
  | { ok: true; decision: 'reserved' | 'applied' | 'already_current' | 'released' }
  | { ok: false; decision: RevisionGuardDecision | 'rpc_unavailable' | 'invalid_input'; error?: string; retriable?: boolean };

export const ADVANCE_REVISION_RPC = 'advance_booking_source_revision';

async function callAdvance(
  supabase: any,
  mode: AdvanceMode,
  input: { bookingId: string; organizationId: string; incoming: IncomingRevision },
): Promise<AdvanceResult> {
  const inc = normalizeIncomingRevision(input.incoming);
  if (!inc) return { ok: false, decision: 'invalid_incoming_revision', retriable: false };

  if (!supabase || typeof supabase.rpc !== 'function') {
    return { ok: false, decision: 'rpc_unavailable', error: 'rpc_not_supported', retriable: false };
  }

  let res: any;
  try {
    res = await supabase.rpc(ADVANCE_REVISION_RPC, {
      p_organization_id: input.organizationId,
      p_booking_id: input.bookingId,
      p_source_updated_at: inc.sourceUpdatedAt,
      p_source_version: inc.sourceVersion,
      p_source_status: inc.sourceStatus,
      p_mode: mode,
    });
  } catch (err: any) {
    return { ok: false, decision: 'rpc_unavailable', error: String(err?.message ?? err), retriable: true };
  }
  if (res?.error) {
    return { ok: false, decision: 'rpc_unavailable', error: res.error.message ?? 'unknown', retriable: true };
  }
  const decision = String(res?.data?.decision ?? '');
  switch (decision) {
    case 'reserved':
    case 'applied':
    case 'already_current':
    case 'released':
      return { ok: true, decision: decision as any };
    case 'stale_source_revision':
    case 'conflicting_source_status_for_revision':
    case 'incomparable_source_revision':
      return { ok: false, decision: decision as RevisionGuardDecision, retriable: false };
    case 'invalid_input':
      return { ok: false, decision: 'invalid_input', error: res?.data?.error, retriable: false };
    default:
      return { ok: false, decision: 'rpc_unavailable', error: `unexpected_decision:${decision}`, retriable: false };
  }
}

/** Reservera revisionen (pending) INNAN någon canonical mutation sker. */
export function reserveCanonicalRevision(
  supabase: any,
  input: { bookingId: string; organizationId: string; incoming: IncomingRevision },
): Promise<AdvanceResult> {
  return callAdvance(supabase, 'reserve', input);
}

/** Markera reservationen som fullt applicerad EFTER lyckad import. */
export function commitCanonicalRevision(
  supabase: any,
  input: { bookingId: string; organizationId: string; incoming: IncomingRevision },
): Promise<AdvanceResult> {
  return callAdvance(supabase, 'commit', input);
}

/** Släpp reservationen när importen misslyckats (revisionen kan retryas). */
export function releaseCanonicalRevision(
  supabase: any,
  input: { bookingId: string; organizationId: string; incoming: IncomingRevision },
): Promise<AdvanceResult> {
  return callAdvance(supabase, 'release', input);
}
