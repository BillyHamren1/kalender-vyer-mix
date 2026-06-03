/**
 * Per-användare baseline för "Uppdaterade bokningar"-listan.
 *
 * Princip: första gången koden körs i denna browser sätts en baseline-tidsstämpel
 * till `now()`. Allt i `booking_changes` som skedde innan dess räknas ALDRIG som
 * en ny uppdatering. Endast ändringar med `last_change_at > baseline` visas.
 *
 * Klick på "Granska" påverkar inte baseline — den hanteras separat via
 * `mark_booking_changes_seen` (last_seen_at per booking).
 */

const KEY = 'booking-updates-baseline-v1';

export function getBookingUpdatesBaseline(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const t = new Date(raw).getTime();
      if (!isNaN(t)) return t;
    }
    const nowIso = new Date().toISOString();
    window.localStorage.setItem(KEY, nowIso);
    return new Date(nowIso).getTime();
  } catch {
    // localStorage otillgängligt → behandla allt som efter baseline (visa inget)
    return Date.now();
  }
}

/** Endast för tester. */
export function __resetBookingUpdatesBaselineForTests() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
