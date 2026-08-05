// Shared CANCELLED booking handler.
// Used by both import-bookings (when external API returns a CANCELLED row)
// and reconcile-booking-status (active reconciler that catches cancellations
// the incremental ?since-sync misses).
//
// STEG 2J: hela cleanup:en körs numera i EN databastransaktion via RPC
// `apply_booking_cancellation_atomic`. Edge-funktionen gör INGA egna
// tabellmutationer längre — antingen genomförs allt, eller ingenting.
// Revisions- och lease-kontrollen sker under radlås i samma transaktion.

export interface ExistingBookingForCancellation {
  id: string;
  version?: number | null;
  status?: string | null;
  organization_id?: string | null;
  assigned_to_project?: boolean | null;
  assigned_project_id?: string | null;
  assigned_project_name?: string | null;
}

/** Canonical bevis som ledde fram till cancellation (loggas för audit). */
export interface CancellationSourceEvidence {
  reason: string;
  source_status: string;
  source_revision: string | number | null;
  /** Explicit revision (valfritt — annars härleds den ur source_revision). */
  source_updated_at?: string | null;
  source_version?: number | null;
  organization_id?: string | null;
  /** Lease-token när cancellation körs inuti en reserverad import. */
  reservation_token?: string | null;
}

export type CancellationOutcome =
  | 'cancelled'
  | 'already_cancelled'
  | 'stale_revision'
  | 'revision_conflict'
  | 'reservation_lost'
  | 'reservation_expired'
  | 'reservation_mismatch'
  | 'invalid_reservation_token'
  | 'not_found'
  | 'invalid_input'
  | 'failed';

export interface CancellationResult {
  status: 'cancelled' | 'partial' | 'skipped_already_cancelled' | 'error';
  booking_id: string;
  outcome?: CancellationOutcome;
  calendar_events_deleted?: boolean;
  warehouse_events_deleted?: boolean;
  projects_updated?: boolean;
  jobs_updated?: boolean;
  packing_deleted?: boolean;
  products_deleted?: boolean;
  source_logged?: boolean;
  mutations?: Record<string, number>;
  error?: string;
}

/** Delar upp canonical revision i timestamp/version för RPC:n. */
export function splitSourceRevision(source?: CancellationSourceEvidence): {
  sourceUpdatedAt: string | null;
  sourceVersion: number | null;
} {
  let sourceUpdatedAt = source?.source_updated_at ?? null;
  let sourceVersion = source?.source_version ?? null;
  const raw = source?.source_revision ?? null;

  if (sourceUpdatedAt === null && sourceVersion === null && raw !== null) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      sourceVersion = raw;
    } else {
      const str = String(raw).trim();
      if (/^\d+$/.test(str)) sourceVersion = Number(str);
      else if (str && !Number.isNaN(Date.parse(str))) sourceUpdatedAt = str;
    }
  }
  return { sourceUpdatedAt, sourceVersion };
}

export async function applyBookingCancellation(
  supabase: any,
  existingBooking: ExistingBookingForCancellation,
  source?: CancellationSourceEvidence,
): Promise<CancellationResult> {
  const bookingId = existingBooking.id;
  const result: CancellationResult = { status: 'cancelled', booking_id: bookingId };
  const orgId = existingBooking.organization_id ?? source?.organization_id ?? null;

  if (!orgId) {
    return { status: 'error', booking_id: bookingId, outcome: 'invalid_input', error: 'organization_id_required_for_cancellation' };
  }

  const { sourceUpdatedAt, sourceVersion } = splitSourceRevision(source);
  if (sourceUpdatedAt === null && sourceVersion === null) {
    return { status: 'error', booking_id: bookingId, outcome: 'invalid_input', error: 'missing_source_revision' };
  }

  let data: any = null;
  let error: any = null;
  try {
    const res = await supabase.rpc('apply_booking_cancellation_atomic', {
      p_organization_id: orgId,
      p_booking_id: bookingId,
      p_source_status: source?.source_status ?? 'CANCELLED',
      p_source_updated_at: sourceUpdatedAt,
      p_source_version: sourceVersion,
      p_reason: source?.reason ?? 'cancelled',
      p_reservation_token: source?.reservation_token ?? null,
    });
    data = res?.data ?? null;
    error = res?.error ?? null;
  } catch (err: any) {
    error = { message: err?.message || String(err) };
  }

  if (error) {
    console.error(`[cancellation] RPC failed for ${bookingId}:`, error);
    return { status: 'error', booking_id: bookingId, outcome: 'failed', error: `apply_booking_cancellation_atomic: ${error.message ?? 'unknown'}` };
  }
  if (!data || typeof data !== 'object') {
    return { status: 'error', booking_id: bookingId, outcome: 'failed', error: 'empty_rpc_result' };
  }

  const outcome = (data.outcome ?? 'failed') as CancellationOutcome;
  result.outcome = outcome;

  if (outcome === 'already_cancelled') {
    result.status = 'skipped_already_cancelled';
    result.source_logged = false;
    console.log(`[cancellation] ${bookingId} redan avbokad på denna revision — ingen mutation.`);
    return result;
  }

  if (data.success !== true || outcome !== 'cancelled') {
    result.status = 'error';
    result.error = data.error ? `${outcome}: ${data.error}` : outcome;
    console.error(`[cancellation] ${bookingId} avvisad av databasen: ${result.error}`);
    return result;
  }

  const m = (data.mutations ?? {}) as Record<string, number>;
  result.mutations = m;
  // Atomisk transaktion: allt lyckades eller inget kördes.
  result.calendar_events_deleted = true;
  result.warehouse_events_deleted = true;
  result.projects_updated = true;
  result.jobs_updated = true;
  result.packing_deleted = true;
  result.products_deleted = true;
  result.source_logged = (m.audit ?? 0) > 0;

  console.log(`[cancellation] Fully processed CANCELLED booking ${bookingId} (atomic)`, m);
  return result;
}
