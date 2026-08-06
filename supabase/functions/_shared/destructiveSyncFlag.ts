// AKUT PRODUKTIONSSKYDD — automatisk destruktiv sync (cancellation) är AV
// som standard. Endast exakt "true" i miljövariabeln aktiverar automation.
// Saknad, tom eller annat värde => blockerad.
//
// Kontrolleras server-side före VARJE destruktiv mutation. Defense in depth:
// både callers (reconcile-booking-status, import-bookings) och den centrala
// handlern (_shared/cancellation-handler.ts) gör kontrollen.

export const AUTOMATIC_DESTRUCTIVE_SYNC_FLAG = 'AUTOMATIC_DESTRUCTIVE_SYNC_ENABLED';
export const AUTOMATIC_DESTRUCTIVE_SYNC_DISABLED = 'automatic_destructive_sync_disabled';

/** Hård servergräns när automation någon gång aktiveras. Kan ALDRIG höjas via request. */
export const MAX_AUTOMATIC_CANCELLATIONS_PER_RUN = 1;

/** Ren funktion — testbar utan Deno-env. */
export function isDestructiveSyncEnabledValue(raw: string | null | undefined): boolean {
  return raw === 'true';
}

export function readDestructiveSyncFlag(): string | null {
  try {
    // deno-lint-ignore no-explicit-any
    const env = (globalThis as any)?.Deno?.env;
    return env?.get?.(AUTOMATIC_DESTRUCTIVE_SYNC_FLAG) ?? null;
  } catch (_) {
    return null;
  }
}

export function isAutomaticDestructiveSyncEnabled(): boolean {
  return isDestructiveSyncEnabledValue(readDestructiveSyncFlag());
}

export interface BlockedCancellationLogInput {
  booking_id: string | null;
  organization_id: string | null;
  source_revision: string | number | null;
  caller: string;
}

/** Strukturerad säkerhetslogg. Loggar aldrig secrets eller tokens. */
export function logBlockedCancellation(input: BlockedCancellationLogInput): void {
  console.warn(
    '[destructive-sync-guard] cancellation BLOCKED',
    JSON.stringify({
      blocked: true,
      reason: AUTOMATIC_DESTRUCTIVE_SYNC_DISABLED,
      flag: AUTOMATIC_DESTRUCTIVE_SYNC_FLAG,
      booking_id: input.booking_id ?? null,
      organization_id: input.organization_id ?? null,
      source_revision: input.source_revision ?? null,
      caller: input.caller,
    }),
  );
}
