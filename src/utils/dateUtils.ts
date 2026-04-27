/**
 * ============================================================
 * dateUtils — naiv wall-clock-tid (ingen tidszon)
 * ============================================================
 *
 * Princip: "08 = 08". Tider lagras och visas som HH:mm rakt av,
 * utan UTC- eller DST-konvertering. Databasen kan lagra dem som
 * `timestamptz` med +00, men vi behandlar timme/minut som ren text.
 *
 * Det innebär: ett jobb klockan 08:00 lagras som "...T08:00:00..."
 * och visas som 08:00 överallt — webb, app, edge functions.
 *
 * De gamla namnen (`extractUTCTime`, `extractUTCDate`, `buildUTCDateTime`)
 * behålls för bakåtkompatibilitet.
 * ============================================================
 */

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
 * Plocka HH:mm direkt från en ISO/Supabase-tidssträng.
 * Ingen tidszons-konvertering — vi läser bara siffrorna.
 *
 * "2026-04-29T08:00:00.000Z"   → "08:00"
 * "2026-04-29 08:00:00+00"     → "08:00"
 * "2026-04-29T08:00:00+02:00"  → "08:00"
 */
export const extractUTCTime = (value: string | Date): string => {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '00:00';
    // Date-objekt har ingen "naiv" tid — vi tar UTC-tid för att undvika
    // att lokal systemtidszon påverkar resultatet.
    const hh = String(value.getUTCHours()).padStart(2, '0');
    const mm = String(value.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (typeof value !== 'string' || !value) return '00:00';
  // Matcha "T08:00" eller " 08:00"
  const m = value.match(/[T\s](\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  return '00:00';
};

/**
 * Plocka YYYY-MM-DD direkt från en ISO/Supabase-tidssträng.
 * Ingen tidszons-konvertering.
 */
export const extractUTCDate = (value: string | Date): string => {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value !== 'string' || !value) return '';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
};

/**
 * Bygg en ISO-sträng från datum + HH:mm. Naiv: tiden hamnar exakt
 * som angivet i strängen, suffix +00 så Postgres accepterar det
 * som timestamptz utan att skifta värdet.
 *
 * buildUTCDateTime('2026-05-02', '08:00') → '2026-05-02T08:00:00+00:00'
 */
export const buildUTCDateTime = (datePart: string, time: string): string => {
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) {
    return `${datePart}T${time}:00+00:00`;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(y)}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+00:00`;
};

/**
 * Build a floating planner datetime string without timezone conversion.
 * Example: buildPlannerDateTime('2025-06-15', '14:30') → '2025-06-15T14:30:00'
 */
export const buildPlannerDateTime = (datePart: string, time: string): string => {
  return `${datePart}T${time}:00`;
};

/**
 * Parse YYYY-MM-DD explicitly to a stable local Date at 12:00.
 * Avoids timezone shifts and engine inconsistencies from string Date parsing.
 */
export const parsePlannerDate = (value: string): Date | null => {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if ([year, month, day].some((v) => Number.isNaN(v))) return null;
  const result = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    return null;
  }
  return result;
};

/**
 * Parse a planner datetime string without timezone conversion.
 * Reads the literal YYYY-MM-DD and HH:mm values from the string and builds
 * a local Date with those exact wall-clock digits.
 */
export const parsePlannerDateTime = (value: string): Date | null => {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || '0');

  if ([year, month, day, hour, minute, second].some((v) => Number.isNaN(v))) return null;

  const result = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day ||
    result.getHours() !== hour ||
    result.getMinutes() !== minute ||
    result.getSeconds() !== second
  ) {
    return null;
  }

  return result;
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
