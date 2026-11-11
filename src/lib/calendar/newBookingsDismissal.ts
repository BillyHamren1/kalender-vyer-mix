/**
 * Lokal "kryssa bort"-lista för popupen med nya bokningar i planeringskalendern.
 * Bokningen ligger kvar i inkorgen på dashboarden — vi döljer bara popupen.
 */
export const NEW_BOOKINGS_DISMISS_KEY = 'calendar.newBookingsDismissed.v1';

export function readDismissedIds(storage?: Storage): string[] {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return [];
    const raw = s.getItem(NEW_BOOKINGS_DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeDismissedIds(ids: string[], storage?: Storage): void {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return;
    // Håll listan rimligt kort — senaste 200 räcker gott.
    s.setItem(NEW_BOOKINGS_DISMISS_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    /* ignore */
  }
}

export interface DismissableBooking {
  /** Unik nyckel per bokning (bookingId när det finns, annars projektets id). */
  dismissKey: string;
}

/** Filtrerar bort redan bortkryssade poster. */
export function filterDismissed<T extends DismissableBooking>(items: T[], dismissed: string[]): T[] {
  const set = new Set(dismissed);
  return items.filter((i) => !set.has(i.dismissKey));
}

/**
 * "Senare" gäller hela besöket (sessionStorage), så att popupen inte öppnas igen
 * vid vecko-/månadsbyte, remount eller tillfälligt tom refetch för samma lista.
 * Den öppnas igen endast när en bokning som INTE fanns i den uppskjutna listan dyker upp.
 */
export const NEW_BOOKINGS_SNOOZE_KEY = 'calendar.newBookingsSnoozed.v1';

export function readSnoozedIds(storage?: Storage): string[] {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
    const raw = s?.getItem(NEW_BOOKINGS_SNOOZE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeSnoozedIds(ids: string[], storage?: Storage): void {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
    s?.setItem(NEW_BOOKINGS_SNOOZE_KEY, JSON.stringify(Array.from(new Set(ids)).slice(-200)));
  } catch {
    /* ignore */
  }
}

/** True om någon synlig post saknas i den uppskjutna listan (= ny bokning). */
export function hasUnsnoozed<T extends DismissableBooking>(items: T[], snoozed: string[]): boolean {
  const set = new Set(snoozed);
  return items.some((i) => !set.has(i.dismissKey));
}
