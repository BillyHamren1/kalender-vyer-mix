/**
 * ============================================================
 * dateUtils — Europe/Stockholm canonical time
 * ============================================================
 *
 * All planner times (calendar_events.start_time, bookings.*_start_time, …)
 * represent the WALL-CLOCK time in Europe/Stockholm. The database stores
 * them as `timestamptz` so the same instant renders identically regardless
 * of the viewer's timezone.
 *
 * The helpers below intentionally keep the legacy `…UTC…` names so existing
 * callers don't have to change. Internally they now operate in
 * Europe/Stockholm — DST-aware — instead of raw UTC.
 * ============================================================
 */

const STOCKHOLM_TZ = 'Europe/Stockholm';

/**
 * Convert Supabase timestamp format to ISO 8601.
 * Centralized utility — used by eventService.ts and useRealTimeCalendarEvents.tsx.
 */
export const convertToISO8601 = (timestamp: string | null | undefined): string => {
  if (!timestamp) {
    console.warn('convertToISO8601: Invalid timestamp (null/undefined)');
    return new Date().toISOString();
  }

  if (timestamp.includes('T') && (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp))) {
    return timestamp;
  }

  // Supabase format: "YYYY-MM-DD HH:MM:SS+00"
  const converted = timestamp.replace(' ', 'T').replace('+00', 'Z');

  const testDate = new Date(converted);
  if (isNaN(testDate.getTime())) {
    console.error('convertToISO8601: Invalid date after conversion:', timestamp);
    return new Date().toISOString();
  }

  return converted;
};

/**
 * Format a Date as parts in Europe/Stockholm (DST-aware).
 */
const stockholmParts = (d: Date): { year: string; month: string; day: string; hour: string; minute: string } => {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: STOCKHOLM_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === '24' ? '00' : parts.hour,
    minute: parts.minute,
  };
};

const toDate = (value: string | Date): Date => (typeof value === 'string' ? new Date(value) : value);

/**
 * Extract HH:mm from an ISO/Date value, expressed in Europe/Stockholm.
 * (Legacy name kept for backwards compatibility — was previously raw UTC.)
 */
export const extractUTCTime = (value: string | Date): string => {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '00:00';
  const { hour, minute } = stockholmParts(d);
  return `${hour}:${minute}`;
};

/**
 * Extract YYYY-MM-DD from an ISO/Date value, expressed in Europe/Stockholm.
 */
export const extractUTCDate = (value: string | Date): string => {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '';
  const { year, month, day } = stockholmParts(d);
  return `${year}-${month}-${day}`;
};

/**
 * DST-aware UTC offset (in minutes) for a given Stockholm wall-clock instant.
 * Returns +60 for CET, +120 for CEST.
 */
const stockholmUtcOffsetMinutes = (year: number, month: number, day: number, hour: number, minute: number): number => {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const wall = stockholmParts(new Date(utcGuess));
  const wallUtc = Date.UTC(+wall.year, +wall.month - 1, +wall.day, +wall.hour, +wall.minute, 0);
  return Math.round((wallUtc - utcGuess) / 60000);
};

/**
 * Build a UTC ISO string from a date-part and a HH:mm time string,
 * interpreting the input as wall-clock time in Europe/Stockholm.
 *
 * Example (CEST):
 *   buildUTCDateTime('2026-05-02', '08:00') → '2026-05-02T06:00:00.000Z'
 * Example (CET):
 *   buildUTCDateTime('2026-01-15', '08:00') → '2026-01-15T07:00:00.000Z'
 */
export const buildUTCDateTime = (datePart: string, time: string): string => {
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) {
    return new Date(`${datePart}T${time}:00Z`).toISOString();
  }
  const offsetMin = stockholmUtcOffsetMinutes(y, m, d, hh, mm);
  const utcMillis = Date.UTC(y, m - 1, d, hh, mm, 0) - offsetMin * 60_000;
  return new Date(utcMillis).toISOString();
};

/**
 * Build a floating planner datetime string without timezone conversion.
 * Example: buildPlannerDateTime('2025-06-15', '14:30') → '2025-06-15T14:30:00'
 */
export const buildPlannerDateTime = (datePart: string, time: string): string => {
  return `${datePart}T${time}:00`;
};

/** Normalize planner event types to the canonical casing used in bookings/planner UI. */
export const normalizePlannerEventType = (value: string | null | undefined): 'rig' | 'event' | 'rigDown' | undefined => {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'rig') return 'rig';
  if (normalized === 'event') return 'event';
  if (normalized === 'rigdown') return 'rigDown';
  return undefined;
};
