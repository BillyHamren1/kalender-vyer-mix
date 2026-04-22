/**
 * Shared EventFlow sync payload validation rules.
 * Mirrors the logic in supabase/functions/receive-site-scan and sync-site-scan.
 * Kept in src/lib so it can be unit-tested via vitest.
 */

/** Valid entity types and their required/forbidden mapping fields. */
export const ENTITY_FIELD_MAP: Record<string, { required: string; forbidden: string }> = {
  booking: { required: "booking_id", forbidden: "project_id" },
  project: { required: "project_id", forbidden: "booking_id" },
};

export interface SyncPayload {
  site_scan_id?: string;
  entity_type?: string;
  title?: string;
  booking_id?: string | null;
  project_id?: string | null;
  [key: string]: unknown;
}

/**
 * Validates an EventFlow sync payload.
 * Returns null if valid, or an error message string.
 */
export function validateSyncPayload(p: SyncPayload): string | null {
  if (!p.site_scan_id || typeof p.site_scan_id !== "string" || !p.site_scan_id.trim()) {
    return "site_scan_id is required and must be a non-empty string.";
  }

  if (!p.title || typeof p.title !== "string" || !p.title.trim()) {
    return "title is required and must be a non-empty string.";
  }

  if (!p.entity_type || typeof p.entity_type !== "string" || !p.entity_type.trim()) {
    return "entity_type is required and must be a non-empty string.";
  }

  const entityType = p.entity_type.trim();
  const rule = ENTITY_FIELD_MAP[entityType];

  if (!rule) {
    const allowed = Object.keys(ENTITY_FIELD_MAP).join(", ");
    return `Invalid entity_type '${entityType}'. Must be one of: ${allowed}.`;
  }

  const requiredValue = p[rule.required];
  if (typeof requiredValue !== "string" || !(requiredValue as string).trim()) {
    return `entity_type '${entityType}' requires a non-empty ${rule.required}.`;
  }

  const forbiddenValue = p[rule.forbidden];
  if (forbiddenValue !== undefined && forbiddenValue !== null && forbiddenValue !== "") {
    return `entity_type '${entityType}' must not include ${rule.forbidden}. Only ${rule.required} is allowed.`;
  }

  return null;
}

/** Valid external_entity_types for sync targets. */
export const VALID_ENTITY_TYPES = Object.keys(ENTITY_FIELD_MAP);

/**
 * Validates a sync target's entity mapping before outbound webhook.
 * Returns null if valid, or an error message.
 */
export function validateEntityMapping(target: {
  sync_target: string;
  external_entity_type: string;
  external_entity_id: string | null;
}): string | null {
  if (!VALID_ENTITY_TYPES.includes(target.external_entity_type)) {
    return `Invalid external_entity_type '${target.external_entity_type}' for ${target.sync_target}. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}`;
  }

  if (!target.external_entity_id || target.external_entity_id.trim() === "") {
    const mappedField = ENTITY_FIELD_MAP[target.external_entity_type].required;
    return `Missing external_entity_id for ${target.sync_target} entity type '${target.external_entity_type}'. Cannot map to ${mappedField} without a value.`;
  }

  return null;
}

// =============================================
// Sync failure state machine
// Mirrors markSyncFailed / markSyncSuccess in sync-site-scan edge function.
// =============================================

export const DEFAULT_MAX_RETRIES = 5;

export interface SyncTargetState {
  sync_status: "not_linked" | "pending_sync" | "synced" | "sync_failed";
  retry_count: number;
  max_retries: number;
  last_sync_error: string | null;
  next_retry_at: string | null;
  last_synced_at: string | null;
}

/**
 * Computes the next state after a sync failure.
 * Pure function — no side effects.
 */
export function computeFailureState(
  current: Pick<SyncTargetState, "retry_count" | "max_retries">,
  errorMessage: string,
  now: Date = new Date(),
): SyncTargetState {
  const newRetryCount = current.retry_count + 1;
  const canRetry = newRetryCount < current.max_retries;
  const newStatus = canRetry ? "pending_sync" : "sync_failed";

  // Exponential backoff: 4^retryCount minutes (1, 4, 16, 64, 256…)
  const backoffMs = canRetry ? Math.pow(4, newRetryCount) * 60_000 : null;
  const nextRetryAt = backoffMs ? new Date(now.getTime() + backoffMs).toISOString() : null;

  return {
    sync_status: newStatus,
    retry_count: newRetryCount,
    max_retries: current.max_retries,
    last_sync_error: errorMessage.substring(0, 2000),
    next_retry_at: nextRetryAt,
    last_synced_at: null,
  };
}

/**
 * Computes the next state after a sync success.
 * Pure function — no side effects.
 */
export function computeSuccessState(
  current: Pick<SyncTargetState, "max_retries">,
  now: Date = new Date(),
): SyncTargetState {
  return {
    sync_status: "synced",
    retry_count: 0,
    max_retries: current.max_retries,
    last_sync_error: null,
    next_retry_at: null,
    last_synced_at: now.toISOString(),
  };
}

/**
 * Classifies a webhook HTTP response into a sync outcome.
 */
export type WebhookOutcome =
  | { ok: true }
  | { ok: false; error: string };

export function classifyWebhookResponse(
  status: number,
  body: string,
  integrationLabel: string,
): WebhookOutcome {
  if (status < 200 || status >= 300) {
    return { ok: false, error: `${integrationLabel} HTTP ${status}: ${body.substring(0, 500)}` };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: `${integrationLabel} returned non-JSON response (HTTP ${status})` };
  }

  if (!parsed || parsed.ok !== true) {
    const detail = parsed?.error ? String(parsed.error) : body.substring(0, 500);
    return { ok: false, error: `${integrationLabel} did not confirm success: ${detail}` };
  }

  return { ok: true };
}
