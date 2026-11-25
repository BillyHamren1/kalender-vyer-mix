// Durable pre-save calendar baseline (Booking → Planning).
// Before a booking row's canonical phase dates/times are overwritten, the
// previous values are stored in booking_source_state.calendar_baseline and
// kept until calendar reconcile has actually succeeded. A retry after
// "booking saved, calendar not written" (also for legacy rows without
// per-row checkpoint) therefore still compares against what the calendar
// reflects, not against the already-saved booking row.
// Pure helpers + thin RPC wrappers (Deno + Vitest).

export const BASELINE_FIELDS = [
  'rigdaydate', 'eventdate', 'rigdowndate',
  'rig_start_time_external', 'rig_end_time_external',
  'rigdown_start_time_external', 'rigdown_end_time_external',
] as const;

export type CalendarBaseline = Partial<Record<typeof BASELINE_FIELDS[number], string | null>>;

const n = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export function pickBaseline(row: any): CalendarBaseline {
  const out: CalendarBaseline = {};
  for (const f of BASELINE_FIELDS) out[f] = n(row?.[f]);
  return out;
}

/** True when saving `incoming` would change any calendar-relevant source field. */
export function baselineDiffers(existing: any, incoming: any): boolean {
  if (!existing) return false;
  return BASELINE_FIELDS.some((f) => incoming?.[f] !== undefined && n(incoming[f]) !== n(existing[f]));
}

/** Previous-source view for calendar reconcile: baseline wins over the saved row. */
export function calendarPrevFrom(existing: any, baseline: CalendarBaseline | null): any {
  if (!existing || !baseline) return existing;
  return { ...existing, ...baseline };
}

export async function captureCalendarBaseline(supabase: any, i: {
  organizationId: string; bookingId: string; baseline: CalendarBaseline;
}): Promise<{ ok: true; baseline: CalendarBaseline } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('capture_calendar_baseline', {
    p_organization_id: i.organizationId, p_booking_id: i.bookingId, p_baseline: i.baseline,
  });
  if (error || !data || typeof data !== 'object') return { ok: false, error: error?.message ?? 'no_baseline_returned' };
  return { ok: true, baseline: data as CalendarBaseline };
}

export async function clearCalendarBaseline(supabase: any, i: {
  organizationId: string; bookingId: string; baseline: CalendarBaseline;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('clear_calendar_baseline', {
    p_organization_id: i.organizationId, p_booking_id: i.bookingId, p_baseline: i.baseline,
  });
  if (error) console.warn('[Calendar Baseline] clear failed (kept; safe)', i.bookingId, error.message);
  return !error && data === true;
}
