/**
 * viewAsStorage — admin "Visa som"-läge för mobilappen.
 *
 * Read-only impersonering: påverkar BARA tre snapshot-hooks
 * (useMobileStaffDayReport, useStaffTimeReportPeriod, useStaffMonthStatus).
 * Skrivvägar (timer-start, time_reports CRUD, EOD, scanner) använder ALDRIG
 * detta värde — de fortsätter köra mot inloggad staff.
 */
const KEY = 'mobile.viewAsStaffId.v1';

export interface ViewAsRecord {
  id: string;
  name: string;
  setAt: number;
}

export function getViewAs(): ViewAsRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewAsRecord;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setViewAs(rec: { id: string; name: string } | null) {
  if (typeof window === 'undefined') return;
  if (!rec) {
    window.localStorage.removeItem(KEY);
  } else {
    const payload: ViewAsRecord = { id: rec.id, name: rec.name, setAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  }
  window.dispatchEvent(new CustomEvent('view-as-changed'));
}

export function getViewAsStaffId(): string | null {
  return getViewAs()?.id ?? null;
}
