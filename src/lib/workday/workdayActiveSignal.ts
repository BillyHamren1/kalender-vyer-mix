/**
 * workdayActiveSignal — read-only localStorage spegel av "är workday öppen?".
 *
 * Authority = backend `workday/current` (via useWorkDay som speglar in hit).
 * Cachen är bara en hint så icke-React moduler (background location reporter)
 * kan välja rätt locationMode utan att hålla en React-prenumeration.
 */

const WORKDAY_ACTIVE_KEY = 'eventflow-workday-active';

export function setWorkdayActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(WORKDAY_ACTIVE_KEY, '1');
    } else {
      localStorage.removeItem(WORKDAY_ACTIVE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function isWorkdayActive(): boolean {
  try {
    return localStorage.getItem(WORKDAY_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}
