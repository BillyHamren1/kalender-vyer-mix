/**
 * Kontrakt för single-booking-import mellan `import-bookings` och
 * `process-sync-jobs`.
 *
 * REGEL: ett sync-jobb får ENDAST markeras `completed` (och därmed tillåta
 * batchen att flytta cursorn) om svaret matchar detta kontrakt EXAKT:
 *
 *   {
 *     success: true,
 *     queued: false,
 *     completed: true,
 *     sync_mode: "single",
 *     booking_id: <förväntat booking_id>,
 *     organization_id: <förväntat organization_id>,
 *     outcome: "applied" | "already_current"
 *   }
 *
 * Allt annat (HTTP != 2xx, ogiltig JSON, saknade fält, fel id, queued=true,
 * completed=false, okänd outcome, partiella fel) är ett MISSLYCKANDE.
 *
 * Modulen är ren TypeScript utan Deno-API:er så att den kan enhetstestas
 * från vitest.
 */

export type SingleBookingOutcome =
  | 'applied'          // Bokningen skrevs/uppdaterades från extern källa
  | 'already_current'  // Extern källa läst, inget att ändra
  | 'not_found'        // Bokningen finns inte externt (och ingen lokal spegling gjordes)
  | 'local_fallback'   // Endast lokal data användes (localOnly / status-demote)
  | 'cancellation_requires_explicit_apply' // STEG 3L: kandidat, aldrig muterad av normal sync
  | 'mutating_sync_paused' // STEG 4G: kill switch — inga mutationer, ingen cursor, ingen completion
  | 'partial'          // Något delsteg misslyckades
  | 'failed';          // Hela körningen misslyckades

/** Outcomes som räknas som en fullständigt lyckad single-import. */
export const SUCCESS_OUTCOMES: readonly SingleBookingOutcome[] = ['applied', 'already_current'];

export interface SingleBookingEnvelope {
  success: boolean;
  queued: false;
  completed: boolean;
  sync_mode: 'single';
  booking_id: string | null;
  organization_id: string | null;
  outcome: SingleBookingOutcome;
  error?: string | null;
  results?: unknown;
}

export function buildSingleBookingEnvelope(input: {
  bookingId: string | null;
  organizationId: string | null;
  outcome: SingleBookingOutcome;
  results?: unknown;
  error?: string | null;
}): SingleBookingEnvelope {
  const isSuccess = (SUCCESS_OUTCOMES as string[]).includes(input.outcome);
  return {
    success: isSuccess,
    queued: false,
    completed: isSuccess,
    sync_mode: 'single',
    booking_id: input.bookingId ?? null,
    organization_id: input.organizationId ?? null,
    outcome: input.outcome,
    ...(input.error ? { error: input.error } : {}),
    ...(input.results !== undefined ? { results: input.results } : {}),
  };
}

/**
 * Härled outcome ur import-resultatet för EN bokning.
 * `applied` kräver att bokningen faktiskt rördes (ny/uppdaterad/produkt/status).
 */
export function deriveSingleBookingOutcome(results: {
  failed?: number;
  errors?: unknown[];
  new_bookings?: unknown[];
  updated_bookings?: unknown[];
  status_changed_bookings?: unknown[];
  products_updated_bookings?: unknown[];
  unchanged_bookings_skipped?: unknown[];
  duplicates_skipped?: unknown[];
  cancelled_bookings_skipped?: unknown[];
  total?: number;
}): SingleBookingOutcome {
  const len = (v: unknown[] | undefined) => (Array.isArray(v) ? v.length : 0);
  if ((results.failed ?? 0) > 0 || len(results.errors as unknown[]) > 0) return 'partial';
  const touched =
    len(results.new_bookings) +
    len(results.updated_bookings) +
    len(results.status_changed_bookings) +
    len(results.products_updated_bookings);
  if (touched > 0) return 'applied';
  const seen =
    len(results.unchanged_bookings_skipped) +
    len(results.duplicates_skipped) +
    len(results.cancelled_bookings_skipped);
  if (seen > 0 || (results.total ?? 0) > 0) return 'already_current';
  return 'not_found';
}

/**
 * Fel som ALDRIG blir bättre av en retry (STEG 2G – canonical revision guard).
 * Jobbet failas direkt istället för att köras för alltid.
 */
export const NON_RETRIABLE_IMPORT_ERRORS: readonly string[] = [
  'stale_source_revision',
  'conflicting_source_status_for_revision',
  'incomparable_source_revision',
  'mixed_incomparable_revision_history',
  'stored_revision_created_at_invalid',
  'revision_history_truncated',
  'automatic_destructive_sync_disabled',
  'cancellation_requires_explicit_apply',
];

export interface ValidationOk {
  ok: true;
  outcome: SingleBookingOutcome;
}
export interface ValidationFail {
  ok: false;
  /** true = permanent fel, jobbet ska failas direkt utan retry. */
  permanent: boolean;
  reason: string;
}
export type ValidationResult = ValidationOk | ValidationFail;

/**
 * Strikt validering av svaret från import-bookings i single-läge.
 * Anropas av process-sync-jobs INNAN ett jobb får bli `completed`.
 */
export function validateSingleBookingResult(
  parsed: unknown,
  expected: { bookingId: string; organizationId: string },
  http?: { ok: boolean; status: number },
): ValidationResult {
  if (http && !http.ok) {
    const retriable = http.status >= 500 || http.status === 429;
    return {
      ok: false,
      permanent: !retriable,
      reason: `http_${http.status}`,
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, permanent: false, reason: 'invalid_json_body' };
  }
  const r = parsed as Record<string, unknown>;

  if (r.queued === true) {
    return { ok: false, permanent: true, reason: 'contract_violation_queued_true' };
  }
  if (r.sync_mode !== 'single') {
    return { ok: false, permanent: true, reason: `contract_violation_sync_mode_${String(r.sync_mode)}` };
  }
  if (r.booking_id !== expected.bookingId) {
    return {
      ok: false,
      permanent: true,
      reason: `contract_violation_booking_id_mismatch_${String(r.booking_id)}`,
    };
  }
  if (r.organization_id !== expected.organizationId) {
    return {
      ok: false,
      permanent: true,
      reason: `contract_violation_organization_id_mismatch_${String(r.organization_id)}`,
    };
  }

  const outcome = r.outcome as SingleBookingOutcome | undefined;
  if (!outcome || typeof outcome !== 'string') {
    return { ok: false, permanent: true, reason: 'contract_violation_missing_outcome' };
  }

  if ((SUCCESS_OUTCOMES as string[]).includes(outcome)) {
    if (r.success !== true || r.completed !== true) {
      return { ok: false, permanent: true, reason: 'contract_violation_success_flags' };
    }
    // Defensivt: ett svar får aldrig hävda full framgång OCH bära på fel.
    if (typeof r.error === 'string' && r.error.trim().length > 0) {
      return { ok: false, permanent: true, reason: 'contract_violation_top_level_error' };
    }
    const res = (r.results && typeof r.results === 'object')
      ? (r.results as Record<string, unknown>)
      : null;
    if (res) {
      if (Array.isArray(res.errors) && res.errors.length > 0) {
        return { ok: false, permanent: true, reason: 'contract_violation_results_errors' };
      }
      if (typeof res.failed === 'number' && res.failed > 0) {
        return { ok: false, permanent: true, reason: 'contract_violation_results_failed' };
      }
    }
    return { ok: true, outcome };
  }


  // Icke-lyckade outcomes: retry-policy per typ.
  switch (outcome) {
    case 'partial':
      return { ok: false, permanent: false, reason: 'partial_import' };
    case 'local_fallback':
      return { ok: false, permanent: false, reason: 'local_fallback_only' };
    case 'not_found':
      return { ok: false, permanent: true, reason: 'booking_not_found_in_source' };
    // STEG 3L: normal sync får aldrig applicera cancellation. Kandidaten
    // ligger kvar för explicit hantering — aldrig completed, ingen cursor.
    case 'cancellation_requires_explicit_apply':
      return { ok: false, permanent: true, reason: 'cancellation_requires_explicit_apply' };
    // STEG 4G: normal muterande sync är pausad av server-side kill switch.
    // Jobbet får ALDRIG bli completed — det ligger kvar för retry när pausen
    // hävs av drift. Ingen cursorflytt, ingen mutation.
    case 'mutating_sync_paused':
      return { ok: false, permanent: false, reason: 'mutating_sync_paused' };
    case 'failed': {
      const errText = String(r.error ?? '');
      // STEG 2G: stale/konflikt/ojämförbar revision är PERMANENT — jobbet får
      // aldrig retryas i evighet och aldrig bli applied/completed.
      const permanent = NON_RETRIABLE_IMPORT_ERRORS.some((code) => errText.includes(code));
      return { ok: false, permanent, reason: `import_failed:${errText}`.slice(0, 400) };
    }
    default:
      return { ok: false, permanent: true, reason: `contract_violation_unknown_outcome_${outcome}` };
  }
}
