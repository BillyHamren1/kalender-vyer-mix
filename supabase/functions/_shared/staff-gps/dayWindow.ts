// Stockholm day window helper.
// Tolkar en kalenderdag (yyyy-mm-dd) i Europe/Stockholm och returnerar
// UTC-fönstret för den lokala dagen. Hanterar CET/CEST automatiskt.

function stockholmOffsetMinutes(at: Date): number {
  // Antal minuter som Europe/Stockholm ligger före UTC vid given tidpunkt.
  // CET = +60, CEST = +120.
  const utcStr = at.toLocaleString("en-US", { timeZone: "UTC" });
  const stkStr = at.toLocaleString("en-US", { timeZone: "Europe/Stockholm" });
  const utc = new Date(utcStr);
  const stk = new Date(stkStr);
  return Math.round((stk.getTime() - utc.getTime()) / 60_000);
}

/**
 * För en lokal kalenderdag (yyyy-mm-dd i Europe/Stockholm) returnera UTC-window
 * [startIso, endIso] motsvarande lokal 00:00:00.000 till 23:59:59.999.
 *
 * Exempel:
 *   2026-05-26 (CEST) → 2026-05-25T22:00:00.000Z / 2026-05-26T21:59:59.999Z
 *   2026-01-15 (CET)  → 2026-01-14T23:00:00.000Z / 2026-01-15T22:59:59.999Z
 */
export function stockholmDayWindowUtc(date: string): { startIso: string; endIso: string } {
  // Använd 12:00 UTC den givna dagen för att robust läsa av offset
  // (undviker DST-edge runt midnatt).
  const noonUtc = new Date(`${date}T12:00:00.000Z`);
  const offMin = stockholmOffsetMinutes(noonUtc);
  const startMs = Date.parse(`${date}T00:00:00.000Z`) - offMin * 60_000;
  const endMs = startMs + 24 * 60 * 60_000 - 1;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}
