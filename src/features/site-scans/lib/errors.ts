/**
 * Shared error normalization utilities.
 *
 * Goals:
 * - Type-safe narrowing of unknown `catch` values
 * - User-friendly messages that don't leak raw technical detail
 * - Preserve actionable backend messages when safe
 * - Distinguish between network, auth, validation, and generic errors
 */

// =============================================
// Error categories
// =============================================

export type ErrorCategory = "network" | "auth" | "validation" | "not_found" | "server" | "unknown";

export interface AppError {
  /** Original message (may be technical — use `userMessage` for display) */
  message: string;
  /** Safe message for end-user display */
  userMessage: string;
  /** Broad category for conditional UI (retry buttons, redirect to login, etc.) */
  category: ErrorCategory;
  /** Whether a retry could plausibly succeed */
  retryable: boolean;
}

// =============================================
// Supabase-shaped errors
// =============================================

interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
}

function isSupabaseError(value: unknown): value is SupabaseError {
  return typeof value === "object" && value !== null && "message" in value && typeof (value as SupabaseError).message === "string";
}

// =============================================
// Edge function response errors
// =============================================

interface EdgeFnErrorBody {
  ok: false;
  error: string;
}

export function isEdgeFnError(value: unknown): value is EdgeFnErrorBody {
  return typeof value === "object" && value !== null && (value as EdgeFnErrorBody).ok === false && typeof (value as EdgeFnErrorBody).error === "string";
}

// =============================================
// Category detection
// =============================================

const NETWORK_PATTERNS = /fetch|network|timeout|abort|econnrefused|dns/i;
const AUTH_PATTERNS = /unauthorized|unauthenticated|jwt|invalid.*token|not.*logged|session.*expired|email.*not.*confirmed/i;
const NOT_FOUND_PATTERNS = /not found|no rows|does not exist|404/i;
const VALIDATION_PATTERNS = /invalid|required|must be|cannot be|violates|constraint|duplicate/i;

function categorize(message: string, status?: number): ErrorCategory {
  if (status === 401 || status === 403 || AUTH_PATTERNS.test(message)) return "auth";
  if (status === 404 || NOT_FOUND_PATTERNS.test(message)) return "not_found";
  if (status === 422 || VALIDATION_PATTERNS.test(message)) return "validation";
  if (NETWORK_PATTERNS.test(message)) return "network";
  if (status && status >= 500) return "server";
  return "unknown";
}

// =============================================
// User-facing message mapping
// =============================================

const USER_MESSAGES: Record<ErrorCategory, string> = {
  network: "Kunde inte nå servern. Kontrollera din anslutning och försök igen.",
  auth: "Du är inte inloggad eller din session har löpt ut. Logga in igen.",
  not_found: "Resursen kunde inte hittas.",
  validation: "Begäran innehöll ogiltiga data.",
  server: "Ett serverfel inträffade. Försök igen om en stund.",
  unknown: "Något oväntat gick fel.",
};

// =============================================
// Public API
// =============================================

/**
 * Normalize any caught value into a structured `AppError`.
 *
 * Safe to call with literally anything — `catch(e) { normalizeError(e) }`.
 *
 * @param value  The caught value (Error, Supabase error object, string, or unknown)
 * @param fallbackMessage  Optional override for the user-facing message
 */
export function normalizeError(value: unknown, fallbackMessage?: string): AppError {
  let message = "Unknown error";
  let status: number | undefined;

  if (value instanceof Error) {
    message = value.message;
  } else if (isSupabaseError(value)) {
    message = value.message;
    status = value.status;
  } else if (typeof value === "string" && value.length > 0) {
    message = value;
  }

  const category = categorize(message, status);
  const retryable = category === "network" || category === "server";
  const userMessage = fallbackMessage ?? USER_MESSAGES[category];

  return { message, userMessage, category, retryable };
}

/**
 * Shorthand: extract a single user-safe message string from any caught value.
 *
 * Prefers the backend message if it looks safe (short, no stack trace),
 * otherwise falls back to the generic user message for the error category.
 */
export function toUserMessage(value: unknown, fallbackMessage?: string): string {
  const err = normalizeError(value, fallbackMessage);

  // If the original message is short and doesn't look like a stack trace,
  // it's likely an intentional backend message — show it.
  if (
    err.message.length < 200 &&
    !err.message.includes("\n") &&
    err.category !== "unknown"
  ) {
    return err.message;
  }

  return err.userMessage;
}
