import { supabase } from "@/integrations/supabase/client";

export type DateType = 'rig' | 'event' | 'rigDown';

/**
 * Expand a period [start, end] (inclusive) into an array of yyyy-MM-dd strings.
 * Returns [] if start/end missing. Returns [start] if start === end.
 */
export function expandPeriodToDates(start: string | null | undefined, end: string | null | undefined): string[] {
  if (!start) return [];
  const s = new Date(start + 'T00:00:00');
  const e = end ? new Date(end + 'T00:00:00') : s;
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [start];
  const out: string[] = [];
  const cur = new Date(s);
  while (cur <= e) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Compute period [min, max] from a date array.
 */
export function arrayToPeriod(dates: string[] | null | undefined): { start: string | null; end: string | null } {
  if (!dates || dates.length === 0) return { start: null, end: null };
  const sorted = [...dates].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

/**
 * @deprecated Använd `writeProjectDates` från `@/services/projectDateAuthority`.
 * Den centrala edge-funktionen `apply-project-dates` är nu enda vägen för UI att
 * skriva projekt-datum: den uppdaterar lokala bookings, pushar till externa systemet
 * (arrayer per fas) OCH rebuildar calendar_events. Gå INTE runt den.
 */
export async function propagateProjectDatesToBookings(params: {
  bookingIds: string[];
  dateType: DateType;
  dates: string[];
  startTime?: string | null;
  endTime?: string | null;
}): Promise<void> {
  throw new Error(
    'propagateProjectDatesToBookings är borttagen. Använd writeProjectDates från @/services/projectDateAuthority.',
  );
}
