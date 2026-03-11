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
