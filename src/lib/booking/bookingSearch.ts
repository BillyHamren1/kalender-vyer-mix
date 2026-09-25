/**
 * Sökmatchning för bokningslistan. Bokningsnumret (även gamla nummer på
 * bokningar som ingår i ett stort projekt) ska alltid vara sökbart, liksom
 * internt id och kundnamn. Ren funktion – testbar utan UI.
 */
export function matchesBookingSearch(
  booking: { id: string; client?: string | null; bookingNumber?: string | null },
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return false;
  return [booking.id, booking.bookingNumber, booking.client]
    .some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
}
