/**
 * debugTimed
 * ----------
 * Lättviktig timing-wrapper för att mäta hur länge async-anrop tar och
 * logga både duration + valfri kontext (t.ex. row counts) till konsolen
 * i DEV-mode. Används för att felsöka prestanda på t.ex. /ops-control.
 *
 * `extra` läses EFTER att `fn` har returnerat, så det går bra att
 * skicka in ett tomt objekt och mutera det inifrån `fn` för att lägga
 * till row counts som inte är kända i förväg.
 */
export async function debugTimed<T>(
  label: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>
): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - started);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[perf] ${label}`, { ms, ...extra });
    }
    return result;
  } catch (error) {
    const ms = Math.round(performance.now() - started);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[perf] ${label} failed`, { ms, error, ...extra });
    }
    throw error;
  }
}
