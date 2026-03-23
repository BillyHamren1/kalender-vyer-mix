/**
 * Converts decimal hours (e.g. 2.48) to "Xh Ym" format (e.g. "2h 29m").
 * Use for display only — keep decimal values for calculations.
 */
export function formatHoursMinutes(decimalHours: number): string {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (h === 0 && m === 0) return '0h';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
