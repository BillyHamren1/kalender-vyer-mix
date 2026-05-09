/**
 * Tidrapporter visar alltid Europe/Stockholm-lokal tid, oavsett vilken
 * tidszon klienten råkar köra i. Databasen lagrar UTC.
 *
 * Använd dessa helpers istället för:
 *   - iso.slice(11, 16)              ← visar UTC-timme = fel
 *   - format(new Date(iso), 'HH:mm') ← visar webbläsarens tidszon
 *
 * Lägg ALDRIG på +2 manuellt — DST gör det fel halva året.
 */

const TZ = 'Europe/Stockholm';

function safeDate(iso: string | Date | null | undefined): Date | null {
  if (iso == null) return null;
  if (iso instanceof Date) return Number.isFinite(iso.getTime()) ? iso : null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** "HH:mm" i Europe/Stockholm. Tom sträng om input är ogiltig. */
export function formatStockholmHm(iso: string | Date | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return '';
  return d.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
    hourCycle: 'h23',
  });
}

/** "HH:mm:ss" i Europe/Stockholm. Tom sträng om input är ogiltig. */
export function formatStockholmHms(iso: string | Date | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return '';
  return d.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: TZ,
    hourCycle: 'h23',
  });
}
