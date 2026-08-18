/**
 * Converts a Stockholm-local calendar date + HH:MM into an ISO string carrying
 * the correct Europe/Stockholm UTC offset for that date (DST-safe).
 *
 * We intentionally do not rely on the device timezone: field staff may report
 * time while travelling, while the Time Engine contract is Stockholm-local.
 */
export function stockholmLocalIsoFromHhmm(date: string, hhmm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;

  const [hour, minute] = hhmm.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  // Noon UTC is safely away from Stockholm's DST transition hour. We only need
  // the offset that applies on this local calendar date.
  const probe = new Date(`${date}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    timeZoneName: 'longOffset',
    hour: '2-digit',
  }).formatToParts(probe).find((part) => part.type === 'timeZoneName')?.value;

  const match = offsetPart?.match(/^GMT([+-]\d{2}:\d{2})$/);
  if (!match) return null;
  return `${date}T${hhmm}:00${match[1]}`;
}
