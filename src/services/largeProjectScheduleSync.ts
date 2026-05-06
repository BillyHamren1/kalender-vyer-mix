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
 * Propagate one phase's full date array to every linked sub-booking.
 *
 * IMPORTANT — LP datum-policy (mem://constraints/large-project-dates-local-authority-v1):
 * Stora projekts datum (rig/event/rigdown) ägs av `large_projects` LOKALT.
 * Externa Bokning-API:t accepterar inte LP-datum på sub-booking-nivå
 * (returnerar 400 "Unknown type: bookings"). Vi skriver därför ALDRIG dessa
 * via planning-api-proxy. `import-bookings`-reconcileraren läser redan från
 * `large_projects` (REP-path) när den materialiserar `calendar_events`.
 *
 * Vi triggar bara `import-bookings` för REP-bokningen så kalendern regenereras.
 */
export async function propagateProjectDatesToBookings(params: {
  bookingIds: string[];
  dateType: DateType;
  dates: string[];
  startTime?: string | null;
  endTime?: string | null;
}): Promise<void> {
  const { bookingIds } = params;
  if (bookingIds.length === 0) return;

  // Trigger calendar_events regeneration. Reconcileraren skippar non-REP-bokningar
  // automatiskt och plockar LP-datumen från large_projects.
  const { data: { user } } = await supabase.auth.getUser();
  let orgId: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();
    orgId = profile?.organization_id ?? undefined;
  }

  await Promise.all(
    bookingIds.map(bid =>
      supabase.functions.invoke('import-bookings', {
        body: { booking_id: bid, syncMode: 'single', organization_id: orgId, localOnly: true, skip_review: true },
      })
    )
  );
}
