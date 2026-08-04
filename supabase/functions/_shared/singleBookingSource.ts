/**
 * Typad parser för Booking-modulens single-booking-kontrakt.
 *
 * GRUNDREGEL (Planning-sidan):
 *   Ett TOMT svar bevisar INGENTING. Planning får aldrig härleda
 *   status-demotion (OFFER), cancellation eller cleanup ur:
 *     - tom array / data.length === 0 / count === 0
 *     - saknad booking-payload
 *     - timeout, nätverksfel, HTTP-fel, parsingfel
 *     - lokalt fallbackresultat
 *     - ett generellt "not_found"
 *
 *   Destruktiv cleanup kräver ett explicit canonical svar från Booking med
 *   en verifierbar tombstone (se evaluateDestructiveAction).
 *
 * Ren TypeScript utan Deno-API:er så att modulen kan enhetstestas i vitest.
 */

export const DESTRUCTIVE_REASONS = ['cancelled', 'deleted'] as const;
export type DestructiveReason = typeof DESTRUCTIVE_REASONS[number];

/** Uttryckligen definierade, ICKE-destruktiva reasons. */
export const NON_DESTRUCTIVE_REASONS = [
  'not_found',
  'not_exportable',
  'archived',
  'organization_mismatch',
] as const;
export type NonDestructiveReason = typeof NON_DESTRUCTIVE_REASONS[number];

export type AbsentReason = DestructiveReason | NonDestructiveReason | 'unknown';

export interface SourceTombstone {
  booking_id: string | null;
  organization_id: string | null;
  source_status: string | null;
  source_updated_at?: string | null;
  source_version?: string | number | null;
}

export type SingleBookingSourceResult =
  | {
      kind: 'found';
      bookingId: string;
      organizationId: string;
      sourceStatus: string | null;
      sourceUpdatedAt: string | null;
      booking: Record<string, unknown>;
    }
  | {
      kind: 'absent';
      reason: AbsentReason;
      rawReason: string | null;
      tombstone: SourceTombstone | null;
    }
  | {
      kind: 'error';
      /** true = får retryas av workern; false = permanent kontraktsfel. */
      retriable: boolean;
      code: string;
      message?: string;
    };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function normalizeReason(raw: string | null): AbsentReason {
  if (!raw) return 'unknown';
  const r = raw.toLowerCase();
  if ((DESTRUCTIVE_REASONS as readonly string[]).includes(r)) return r as DestructiveReason;
  if ((NON_DESTRUCTIVE_REASONS as readonly string[]).includes(r)) return r as NonDestructiveReason;
  return 'unknown';
}

function parseTombstone(v: unknown): SourceTombstone | null {
  if (!isRecord(v)) return null;
  return {
    booking_id: str(v.booking_id),
    organization_id: str(v.organization_id),
    source_status: str(v.source_status),
    source_updated_at: str(v.source_updated_at),
    source_version:
      typeof v.source_version === 'number' ? v.source_version : str(v.source_version),
  };
}

/**
 * Tolka Booking-modulens svar för EN bokning.
 * Okända former och okända reasons blir ALDRIG cancellation/deletion.
 */
export function parseSingleBookingSourceResponse(
  payload: unknown,
  expected: { bookingId: string; organizationId: string },
  http?: { ok: boolean; status: number },
): SingleBookingSourceResult {
  if (http && !http.ok) {
    const retriable = http.status >= 500 || http.status === 429 || http.status === 408;
    return { kind: 'error', retriable, code: `http_${http.status}` };
  }
  if (!isRecord(payload)) {
    return { kind: 'error', retriable: true, code: 'invalid_json_body' };
  }

  // ── Nytt explicit kontrakt ────────────────────────────────────────────
  if (typeof payload.found === 'boolean') {
    if (payload.success !== true) {
      return { kind: 'error', retriable: true, code: 'source_success_false' };
    }
    if (payload.mode !== 'single') {
      return { kind: 'error', retriable: false, code: `contract_mode_${String(payload.mode)}` };
    }

    if (payload.found === true) {
      const booking = isRecord(payload.booking) ? payload.booking : null;
      if (!booking) {
        return { kind: 'error', retriable: false, code: 'contract_found_without_booking' };
      }
      const bookingId = str(payload.booking_id) ?? str(booking.id);
      const organizationId = str(payload.organization_id) ?? str(booking.organization_id);
      if (!bookingId || bookingId !== expected.bookingId) {
        return { kind: 'error', retriable: false, code: 'contract_booking_id_mismatch' };
      }
      if (!organizationId || organizationId !== expected.organizationId) {
        return { kind: 'error', retriable: false, code: 'contract_organization_id_mismatch' };
      }
      return {
        kind: 'found',
        bookingId,
        organizationId,
        sourceStatus: str(payload.source_status) ?? str(booking.status),
        sourceUpdatedAt: str(payload.source_updated_at),
        booking,
      };
    }

    const rawReason = str(payload.reason);
    return {
      kind: 'absent',
      reason: normalizeReason(rawReason),
      rawReason,
      tombstone: parseTombstone(payload.tombstone),
    };
  }

  // ── Legacy-form { data: [...] } ───────────────────────────────────────
  if (Array.isArray((payload as any).data)) {
    const rows = (payload as any).data as unknown[];
    if (rows.length === 0) {
      // En tom array bevisar INTE cancellation eller offer. Kontraktsfel.
      return {
        kind: 'error',
        retriable: true,
        code: 'legacy_empty_array_in_single_mode',
        message: 'Empty legacy array is not proof of cancellation or status change',
      };
    }
    const row = rows[0];
    if (!isRecord(row)) {
      return { kind: 'error', retriable: false, code: 'legacy_row_not_object' };
    }
    return {
      kind: 'found',
      bookingId: str(row.id) ?? expected.bookingId,
      organizationId: str(row.organization_id) ?? expected.organizationId,
      sourceStatus: str(row.status) ?? str(row.booking_status),
      sourceUpdatedAt: str(row.updated_at),
      booking: row,
    };
  }

  return { kind: 'error', retriable: false, code: 'unrecognized_response_shape' };
}

export type DestructiveDecision =
  | { allowed: true; action: 'cancellation' | 'deletion'; tombstone: SourceTombstone }
  | { allowed: false; reason: string };

/**
 * ALLOWLIST för destruktiv cleanup.
 * Samtliga krav måste vara uppfyllda — annars nekas åtgärden.
 */
export function evaluateDestructiveAction(
  result: SingleBookingSourceResult,
  expected: { bookingId: string; organizationId: string },
): DestructiveDecision {
  if (result.kind === 'error') return { allowed: false, reason: `technical_error_${result.code}` };
  if (result.kind === 'found') return { allowed: false, reason: 'booking_found_no_cleanup' };

  if (!(DESTRUCTIVE_REASONS as readonly string[]).includes(result.reason)) {
    return { allowed: false, reason: `non_destructive_reason_${result.rawReason ?? 'missing'}` };
  }
  const t = result.tombstone;
  if (!t) return { allowed: false, reason: 'missing_tombstone' };
  if (!t.booking_id || t.booking_id !== expected.bookingId) {
    return { allowed: false, reason: 'tombstone_booking_id_mismatch' };
  }
  if (!t.organization_id || t.organization_id !== expected.organizationId) {
    return { allowed: false, reason: 'tombstone_organization_id_mismatch' };
  }
  if (!t.source_status) return { allowed: false, reason: 'tombstone_missing_source_status' };
  if (!t.source_updated_at && (t.source_version === null || t.source_version === undefined)) {
    return { allowed: false, reason: 'tombstone_missing_source_revision' };
  }

  const status = t.source_status.toUpperCase();
  if (result.reason === 'cancelled') {
    if (status !== 'CANCELLED') return { allowed: false, reason: 'tombstone_status_reason_mismatch' };
    return { allowed: true, action: 'cancellation', tombstone: t };
  }
  // 'deleted'
  if (status !== 'DELETED') return { allowed: false, reason: 'tombstone_status_reason_mismatch' };
  return { allowed: true, action: 'deletion', tombstone: t };
}
