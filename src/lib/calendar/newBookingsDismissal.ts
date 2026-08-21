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
