/**
 * STEG 2G/2H — CANONICAL REVISION GUARD MED EXKLUSIVT IMPORTLÅS
 *
 * En äldre canonical source-revision får ALDRIG:
 *  - appliceras på bokningen,
 *  - loggas som ny canonical revision,
 *  - göra jobbet applied/completed,
 *  - påverka batchcursorn.
 *
 * MODELL (2H — lease-baserat ägarlås, Modell 1 i uppdraget):
 *   reserve → (renew under lång import) → import → commit
 *   `reserve` returnerar ett unikt `reservation_token`. Tokenet krävs vid
 *   renew/commit/release. Så länge en lease är aktiv får INGEN annan revision
 *   ersätta pending state — andra jobb får det retrybara beslutet
 *   `booking_import_locked`. Först vid `commit` (samma DB-transaktion) skrivs
 *   applied state i `booking_source_state`, spegling i
 *   `bookings.last_applied_source_revision` och auditrad i `booking_changes`.
 *
 * AUTHORITATIVE CURRENT STATE: `booking_source_state`.
 *   `bookings.last_applied_source_revision` är en spegling skriven av samma
 *   commit-RPC, `booking_changes` är enbart audit.
 */
import type { LocalAppliedRevision } from './singleBookingSource.ts';
import { parseSourceTimestamp, parseSourceVersion } from './singleBookingSource.ts';

export type RevisionGuardDecision =
  | 'apply'
  | 'already_current'
  | 'stale_source_revision'
  | 'conflicting_source_status_for_revision'
  | 'incomparable_source_revision'
  | 'invalid_incoming_revision'
  | 'booking_import_locked'
  | 'reservation_lost'
  | 'reservation_mismatch'
  | 'not_lock_owner';

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

/** Standardlease för en canonical import (sekunder). */
export const DEFAULT_LEASE_SECONDS = 300;
/** Hur ofta ägaren bör förnya leasen under en lång import (ms). */
export const LEASE_RENEW_INTERVAL_MS = 90_000;

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

export type AdvanceMode = 'reserve' | 'renew' | 'commit' | 'release';

export type AdvanceResult =
  | {
      ok: true;
      decision: 'reserved' | 'renewed' | 'applied' | 'already_current' | 'released';
      reservationToken?: string | null;
      lockExpiresAt?: string | null;
    }
  | {
      ok: false;
      decision: RevisionGuardDecision | 'rpc_unavailable' | 'invalid_input' | 'commit_without_reservation';
      error?: string;
      retriable?: boolean;
    };

export const ADVANCE_REVISION_RPC = 'advance_booking_source_revision';

export interface AdvanceInput {
  bookingId: string;
  organizationId: string;
  incoming: IncomingRevision;
  reservationToken?: string | null;
  ownerJobId?: string | null;
  leaseSeconds?: number;
}

async function callAdvance(
  supabase: any,
  mode: AdvanceMode,
  input: AdvanceInput,
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
      p_reservation_token: input.reservationToken ?? null,
      p_owner_job_id: input.ownerJobId ?? null,
      p_lease_seconds: input.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    });
  } catch (err: any) {
    return { ok: false, decision: 'rpc_unavailable', error: String(err?.message ?? err), retriable: true };
  }
  if (res?.error) {
    return { ok: false, decision: 'rpc_unavailable', error: res.error.message ?? 'unknown', retriable: true };
  }
  const data = res?.data ?? {};
  const decision = String(data?.decision ?? '');
  switch (decision) {
    case 'reserved':
    case 'renewed':
      return {
        ok: true,
        decision: decision as 'reserved' | 'renewed',
        reservationToken: data?.reservation_token ?? input.reservationToken ?? null,
        lockExpiresAt: data?.lock_expires_at ?? null,
      };
    case 'applied':
    case 'already_current':
    case 'released':
      return { ok: true, decision: decision as any };
    case 'booking_import_locked':
      return { ok: false, decision: 'booking_import_locked', retriable: true };
    case 'reservation_lost':
    case 'reservation_mismatch':
    case 'commit_without_reservation':
      return { ok: false, decision: decision as any, retriable: true };
    case 'not_lock_owner':
      return { ok: false, decision: 'not_lock_owner', retriable: false };
    case 'stale_source_revision':
    case 'conflicting_source_status_for_revision':
    case 'incomparable_source_revision':
      return { ok: false, decision: decision as RevisionGuardDecision, retriable: false };
    case 'invalid_input':
      return { ok: false, decision: 'invalid_input', error: data?.error, retriable: false };
    default:
      return { ok: false, decision: 'rpc_unavailable', error: `unexpected_decision:${decision}`, retriable: false };
  }
}

/**
 * Reservera revisionen (pending) och ta det exklusiva importlåset INNAN
 * någon canonical mutation sker. Returnerar `reservationToken`.
 */
export function reserveCanonicalRevision(supabase: any, input: AdvanceInput): Promise<AdvanceResult> {
  return callAdvance(supabase, 'reserve', input);
}

/** Förnya leasen under en lång import. Kräver samma token. */
export function renewCanonicalRevisionLease(supabase: any, input: AdvanceInput): Promise<AdvanceResult> {
  return callAdvance(supabase, 'renew', input);
}

/**
 * Markera reservationen som fullt applicerad EFTER lyckad import.
 * Kräver samma token; skriver applied state + spegling + audit atomiskt.
 */
export function commitCanonicalRevision(supabase: any, input: AdvanceInput): Promise<AdvanceResult> {
  return callAdvance(supabase, 'commit', input);
}

/** Släpp reservationen när importen misslyckats. Kräver samma token. */
export function releaseCanonicalRevision(supabase: any, input: AdvanceInput): Promise<AdvanceResult> {
  return callAdvance(supabase, 'release', input);
}

/**
 * Startar en lease-förnyare som håller låset vid liv under lång import.
 * Returnerar en stop-funktion.
 */
export function startLeaseRenewal(
  supabase: any,
  input: AdvanceInput,
  intervalMs: number = LEASE_RENEW_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    renewCanonicalRevisionLease(supabase, input).then((res) => {
      if (!res.ok) {
        console.warn('[canonicalRevisionGuard] lease renewal failed', JSON.stringify({
          booking_id: input.bookingId, decision: res.decision,
        }));
      }
    }).catch(() => {});
  }, intervalMs);
  return () => clearInterval(timer);
}
