// Haversine distance in meters
export function distanceMeters(
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function minutesBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000;
}

/**
 * Format an ISO timestamp as Europe/Stockholm local time.
 * - mode='time'      → "HH:MM"
 * - mode='datetime'  → "YYYY-MM-DD HH:MM"
 * Used for ALL human-facing timestamps in the time engine: health-check
 * responses, decision trace, examples. UTC is reserved for internal
 * comparisons and never leaks into UI text.
 */
export function formatStockholm(
  iso: string | null | undefined,
  mode: 'time' | 'datetime' = 'time',
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: mode === 'datetime' ? 'numeric' : undefined,
    month: mode === 'datetime' ? '2-digit' : undefined,
    day: mode === 'datetime' ? '2-digit' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // sv-SE renders datetime as "YYYY-MM-DD HH:MM" already.
  return fmt.format(d);
}

// Convert ISO timestamp to HH:MM:SS in Europe/Stockholm
export function isoToLocalTime(iso: string): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date(iso));
}

export function isoToLocalHHMM(iso: string): string {
  const t = isoToLocalTime(iso);
  return t.slice(0, 5);
}

export function isoToLocalDate(iso: string): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso)); // YYYY-MM-DD
}
