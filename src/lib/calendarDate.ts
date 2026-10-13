/** Normalize dates from calendar events and restored state before using Date methods. */
export function parseCalendarDate(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const date = new Date(value instanceof Date ? value.getTime() : value);
  return Number.isFinite(date.getTime()) ? date : null;
}
