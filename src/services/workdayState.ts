const WORKDAY_ENDED_KEY_PREFIX = 'eventflow-workday-ended-';

export const WORKDAY_ENDED_STATE_CHANGED_EVENT = 'workday-ended-state-changed';

function toDayKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

export function hasWorkdayEndedOn(value: Date | string | number = new Date()): boolean {
  try {
    return localStorage.getItem(WORKDAY_ENDED_KEY_PREFIX + toDayKey(value)) === '1';
  } catch {
    return false;
  }
}

export function hasWorkdayEndedToday(): boolean {
  return hasWorkdayEndedOn(new Date());
}

export function markWorkdayEnded(value: Date | string | number = new Date()) {
  try {
    localStorage.setItem(WORKDAY_ENDED_KEY_PREFIX + toDayKey(value), '1');
    window.dispatchEvent(new CustomEvent(WORKDAY_ENDED_STATE_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearWorkdayEnded(value: Date | string | number = new Date()) {
  try {
    localStorage.removeItem(WORKDAY_ENDED_KEY_PREFIX + toDayKey(value));
    window.dispatchEvent(new CustomEvent(WORKDAY_ENDED_STATE_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}