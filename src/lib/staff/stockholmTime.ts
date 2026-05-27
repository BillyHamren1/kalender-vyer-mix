/**
 * Stockholm-säkra konverteringar mellan dagens (date + HH:mm[:ss]) wall-clock
 * och UTC-instans (samma instans som GPS-pings sparas i).
 *
 * Bakgrund: tidigare användes `new Date(y, m-1, d, hh, mm, ss).toISOString()`
 * som tolkas i webbläsarens TZ. När webbläsaren INTE är i Europe/Stockholm
 * (t.ex. en admin på resa, eller serverless render) blev ISO-instansen fel.
 * Då kunde en time_report som faktiskt låg innuti en GPS-vistelse hamna
 * i "resa"-bucket eftersom tiden var skiftad 1–2h.
 *
 * Utöver TZ-felet rundar `ping_backfill`-migrationen `start_time/end_time`
 * till hela sekunder (`::time(0)`), så `start_iso` kan ligga upp till några
 * hundra ms före faktisk första ping. Konsumenten (resolveAt) behöver därför
 * en liten tolerans — den hanteras separat i `pingPlaceSegments.resolveAt`.
 */

const STOCKHOLM = 'Europe/Stockholm';

/**
 * Returnerar offset (i ms) som Stockholm har mot UTC vid en given UTC-instans.
 * +60 min på vintern (CET), +120 min på sommaren (CEST).
 */
function stockholmOffsetMs(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: STOCKHOLM, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour'), get('minute'), get('second'),
  );
  return asUtc - utcMs;
}

/**
 * Tolkar `dateStr` (YYYY-MM-DD) + `timeStr` (HH:mm eller HH:mm:ss) som
 * Europe/Stockholm wall-clock och returnerar exakt UTC-ISO-instansen.
 *
 * DST-säker: hanterar både CET och CEST korrekt, oavsett browser-TZ.
 */
export function stockholmWallClockToIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss = '0'] = String(timeStr).split(':');
  // Initial gissning: tolka som om Stockholm = UTC.
  const guessUtcMs = Date.UTC(
    y, (m || 1) - 1, d || 1,
    Number(hh) || 0, Number(mm) || 0, Number(ss) || 0,
  );
  // Justera så att (guess + offset) ger önskad wall-clock.
  const off1 = stockholmOffsetMs(guessUtcMs);
  const utcMs = guessUtcMs - off1;
  // En andra justering hanterar fall där DST-övergången råkar landa
  // exakt i intervallet (sällsynt; Sverige byter 03:00 → 02:00 / 02:00 → 03:00).
  const off2 = stockholmOffsetMs(utcMs);
  const finalMs = off1 === off2 ? utcMs : guessUtcMs - off2;
  return new Date(finalMs).toISOString();
}

/**
 * Returnerar UTC-fönstret som motsvarar HELA den lokala Stockholm-dagen
 * `dateStr` (YYYY-MM-DD). Hanterar både CET och CEST oavsett browser-TZ.
 *
 * Exempel (CEST): 2026-05-27 → 2026-05-26T22:00:00.000Z .. 2026-05-27T21:59:59.999Z
 */
export function stockholmDayWindowUtc(dateStr: string): { startIso: string; endIso: string } {
  const startIso = stockholmWallClockToIso(dateStr, '00:00:00');
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1));
  const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  const endExclusiveIso = stockholmWallClockToIso(nextStr, '00:00:00');
  const endIso = new Date(new Date(endExclusiveIso).getTime() - 1).toISOString();
  return { startIso, endIso };
}

function _stockholmTimePlaceholder() {
  return new Date(finalMs).toISOString();
}
