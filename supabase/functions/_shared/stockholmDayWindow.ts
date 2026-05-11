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

/**
 * Returnera YYYY-MM-DD för en ISO-timestamp tolkad i Europe/Stockholm.
 * Används för att partitionera timestamptz-rader på svensk kalenderdag
 * (ersätter osäker `iso.slice(0, 10)` som ger UTC-dag).
 */
export function stockholmDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Klipp ett intervall (started_at, ended_at) till dagsfönstret. Returnerar
 * null om intervallet inte alls överlappar fönstret. Används för att räkna
 * brutto-/lönegrundande minuter PER DAG från en workday som spänner över
 * flera dygn (t.ex. ej-stängd workday som nödstoppats senare).
 */
export function clipIntervalToDayWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  win: StockholmDayWindow,
  now: Date = new Date(),
): { startUtc: string; endUtc: string | null; isOpen: boolean } | null {
  if (!start) return null;
  const sMs = new Date(start).getTime();
  if (Number.isNaN(sMs)) return null;
  const isOpenInput = !end;
  const eMs = end ? new Date(end).getTime() : Math.min(now.getTime(), win.endUtcMs);
  const lo = Math.max(sMs, win.startUtcMs);
  const hi = Math.min(eMs, win.endUtcMs);
  if (hi <= lo) return null;
  // Behåll "öppen" status enbart om intervallet fortfarande är öppet OCH
  // klipp-slutet ligger på dagens slut (annars är dagen klar för denna staff).
  const isOpen = isOpenInput && hi >= win.endUtcMs;
  return {
    startUtc: new Date(lo).toISOString(),
    endUtc: isOpen ? null : new Date(hi).toISOString(),
    isOpen,
  };
}

/** Antal minuter ett intervall överlappar [winStart, winEnd]. */
export function overlapMinutesUtc(
  start: string | null | undefined,
  end: string | null | undefined,
  winStartMs: number,
  winEndMs: number,
): number {
  if (!start) return 0;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : winEndMs;
  const lo = Math.max(s, winStartMs);
  const hi = Math.min(e, winEndMs);
  return hi > lo ? Math.round((hi - lo) / 60_000) : 0;
}
