/**
 * Convert Supabase timestamp format to ISO 8601.
 * Centralized utility — used by eventService.ts and useRealTimeCalendarEvents.tsx.
 */
export const convertToISO8601 = (timestamp: string | null | undefined): string => {
  if (!timestamp) {
    console.warn('convertToISO8601: Invalid timestamp (null/undefined)');
    return new Date().toISOString(); // Fallback to current date
  }
  
  // If already in ISO format (contains 'T' and 'Z'), return as-is
  if (timestamp.includes('T') && (timestamp.includes('Z') || timestamp.includes('+'))) {
    return timestamp;
  }
  
  // Supabase format: "YYYY-MM-DD HH:MM:SS+00"
  // ISO 8601 format: "YYYY-MM-DDTHH:MM:SSZ"
  const converted = timestamp.replace(' ', 'T').replace('+00', 'Z');
  
  // Validate the converted date
  const testDate = new Date(converted);
  if (isNaN(testDate.getTime())) {
    console.error('convertToISO8601: Invalid date after conversion:', timestamp);
    return new Date().toISOString(); // Fallback to current date
  }
  
  return converted;
};

/**
 * Extract HH:mm from an ISO/Date value in UTC (no local timezone shift).
 * Used by time-edit dialogs to ensure consistent display.
 */
export const extractUTCTime = (value: string | Date): string => {
  const iso = typeof value === 'string' ? value : value.toISOString();
  const timePart = iso.split('T')[1]; // "HH:mm:ssZ" or "HH:mm:ss.sssZ"
  return timePart ? timePart.substring(0, 5) : '00:00';
};

/**
 * Extract YYYY-MM-DD from an ISO/Date value in UTC.
 */
export const extractUTCDate = (value: string | Date): string => {
  const iso = typeof value === 'string' ? value : value.toISOString();
  return iso.split('T')[0];
};

/**
 * Build a UTC ISO string from a date-part and a HH:mm time string.
 * Example: buildUTCDateTime('2025-06-15', '14:30') → '2025-06-15T14:30:00Z'
 */
export const buildUTCDateTime = (datePart: string, time: string): string => {
  return new Date(`${datePart}T${time}:00Z`).toISOString();
};
