/**
 * Helper: konverterar en lokal kalenderdag (YYYY-MM-DD, Europe/Stockholm)
 * till motsvarande UTC-fönster för databasfrågor.
 *
 * Databasen lagrar timestamptz i UTC. När vi vill hämta "alla rader för
 * 2026-05-09 i Stockholm" måste vi översätta dagsgränsen till UTC, annars
 * tappar vi/inkluderar fel rader runt midnatt.
 *
 * Exempel sommartid (CEST = UTC+2):
 *   2026-05-09 Stockholm  →  2026-05-08T22:00:00.000Z .. 2026-05-09T21:59:59.999Z
 *
 * Exempel vintertid (CET = UTC+1):
 *   2026-01-15 Stockholm  →  2026-01-14T23:00:00.000Z .. 2026-01-15T22:59:59.999Z
 */

const TZ = 'Europe/Stockholm';

function getStockholmOffsetMinutes(utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(utcDate);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUTC - utcDate.getTime()) / 60000;
}

export interface StockholmDayWindow {
  startUtc: string; // inclusive
  endUtc: string;   // inclusive (..999Z)
  startUtcMs: number;
  endUtcMs: number;
}

export function getStockholmDayWindowUtc(date: string): StockholmDayWindow {
  // Approx-gissning: subtrahera +120 min från UTC-midnatt, kolla offset där,
  // räkna sedan om exakt. Räcker för Stockholm (offset = 60 eller 120 min).
  const naiveStart = new Date(`${date}T00:00:00Z`).getTime();
  const guess = new Date(naiveStart - 120 * 60_000);
  const offsetMin = getStockholmOffsetMinutes(guess);
  const startUtcMs = naiveStart - offsetMin * 60_000;
  // Verifiera offset vid faktisk start (kan skilja kring DST-byte)
  const realOffset = getStockholmOffsetMinutes(new Date(startUtcMs));
  const finalStartMs = naiveStart - realOffset * 60_000;
  const finalEndMs = finalStartMs + 24 * 60 * 60_000 - 1;
  return {
    startUtc: new Date(finalStartMs).toISOString(),
    endUtc: new Date(finalEndMs).toISOString(),
    startUtcMs: finalStartMs,
    endUtcMs: finalEndMs,
  };
}
