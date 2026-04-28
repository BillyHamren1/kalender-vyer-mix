/**
 * timeSync — single source of truth for booking phase times.
 *
 * Rule (applies to ALL bookings, no exceptions):
 *   bookings.<phase>_start_time / <phase>_end_time
 *   ⇄  calendar_events.start_time / end_time
 *      (where event_type = phase, source_date = phase date, booking_id = bookingId)
 *
 * Additionally, if the booking belongs to a large project, the same time is
 * propagated to all sibling bookings in that project that share the same
 * phase + date.
 *
 * Every UI / service that mutates a phase time must go through `syncPhaseTime`.
 */
import { supabase } from '@/integrations/supabase/client';

export type Phase = 'rig' | 'event' | 'rigDown';

const PHASE_FIELDS: Record<Phase, { date: string; start: string; end: string; eventType: string }> = {
  rig:     { date: 'rigdaydate',   start: 'rig_start_time',     end: 'rig_end_time',     eventType: 'rig' },
  event:   { date: 'eventdate',    start: 'event_start_time',   end: 'event_end_time',   eventType: 'event' },
  rigDown: { date: 'rigdowndate',  start: 'rigdown_start_time', end: 'rigdown_end_time', eventType: 'rigDown' },
};

export interface SyncPhaseTimeInput {
  bookingId: string;          // uuid of the booking that was edited
  phase: Phase;
  date: string;               // YYYY-MM-DD — the phase date that should match
  startISO: string | null;    // full ISO timestamp or null to clear
  endISO: string | null;
}

export interface SyncPhaseTimeResult {
  bookingsUpdated: number;     // primary booking + siblings touched
  eventsUpserted: number;
  syncedSiblings: number;      // siblings other than the primary booking
  largeProjectId: string | null;
}

/**
 * Combine a YYYY-MM-DD date with the HH:mm:ss portion of an ISO timestamp.
 * The date dimension is always the booking's own phase date — only the
 * clock part is propagated across siblings.
 */
function withDate(date: string, sourceISO: string | null): string | null {
  if (!sourceISO) return null;
  // Extract "HH:mm:ss" (and optional fractional + tz) from the source ISO.
  const match = sourceISO.match(/T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})?$/);
  const time = match ? match[1] : '00:00:00';
  const tz = match && match[2] ? match[2] : 'Z';
  return `${date}T${time}${tz}`;
}

/**
 * Apply `syncPhaseTime` to one booking + matching calendar event.
 * Returns true if at least one row was written.
 */
async function applyToBooking(
  bookingId: string,
  bookingDate: string,
  phase: Phase,
  startISO: string | null,
  endISO: string | null,
): Promise<{ booking: boolean; event: boolean }> {
  const f = PHASE_FIELDS[phase];

  // 1. bookings.<phase>_*_time
  const bookingPatch: Record<string, string | null> = {
    [f.start]: withDate(bookingDate, startISO),
    [f.end]:   withDate(bookingDate, endISO),
  };
  const { error: bErr } = await supabase
    .from('bookings')
    .update(bookingPatch)
    .eq('id', bookingId);
  if (bErr) {
    console.warn('[timeSync] booking update failed', bookingId, phase, bErr);
  }

  // 2. calendar_events for this booking + phase + date
  // Try to update existing row first; if none, insert.
  const newStart = withDate(bookingDate, startISO);
  const newEnd   = withDate(bookingDate, endISO);

  const { data: existing, error: selErr } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('event_type', f.eventType)
    .eq('source_date', bookingDate)
    .limit(1);

  let eventTouched = false;
  if (!selErr) {
    if (existing && existing.length > 0) {
      const { error: uErr } = await supabase
        .from('calendar_events')
        .update({ start_time: newStart, end_time: newEnd })
        .eq('id', existing[0].id);
      if (!uErr) eventTouched = true;
      else console.warn('[timeSync] calendar_event update failed', existing[0].id, uErr);
    }
    // We do NOT insert a new calendar_event here. The backend reconciler /
    // import-bookings owns event creation; we only mirror times into events
    // that already exist. This avoids duplicates and respects single-writer
    // architecture for event provisioning.
  }

  return { booking: !bErr, event: eventTouched };
}

/**
 * Sync a phase time across the primary booking, its calendar event, and (if
 * the booking belongs to a large project) all sibling bookings sharing the
 * same phase date.
 */
export async function syncPhaseTime(input: SyncPhaseTimeInput): Promise<SyncPhaseTimeResult> {
  const { bookingId, phase, date, startISO, endISO } = input;

  // Look up the primary booking's large_project_id.
  const f = PHASE_FIELDS[phase];
  const { data: primary, error: pErr } = await supabase
    .from('bookings')
    .select('id, large_project_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (pErr || !primary) {
    console.warn('[timeSync] primary booking lookup failed', bookingId, pErr);
    return { bookingsUpdated: 0, eventsUpserted: 0, syncedSiblings: 0, largeProjectId: null };
  }

  let bookingsUpdated = 0;
  let eventsUpserted = 0;

  // 1. Primary booking
  const primaryRes = await applyToBooking(bookingId, date, phase, startISO, endISO);
  if (primaryRes.booking) bookingsUpdated += 1;
  if (primaryRes.event) eventsUpserted += 1;

  let syncedSiblings = 0;
  const largeProjectId = (primary as any).large_project_id ?? null;

  // 2. Siblings if part of a large project
  if (largeProjectId) {
    const { data: siblings, error: sErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('large_project_id', largeProjectId)
      .eq(f.date as 'rigdaydate' | 'eventdate' | 'rigdowndate', date)
      .neq('id', bookingId);

    if (!sErr && siblings) {
      for (const sib of siblings) {
        const r = await applyToBooking(sib.id, date, phase, startISO, endISO);
        if (r.booking) {
          bookingsUpdated += 1;
          syncedSiblings += 1;
        }
        if (r.event) eventsUpserted += 1;
      }
    } else if (sErr) {
      console.warn('[timeSync] sibling lookup failed', largeProjectId, sErr);
    }
  }

  return { bookingsUpdated, eventsUpserted, syncedSiblings, largeProjectId };
}

/**
 * Convenience: derive phase + date from a calendar_event row, then sync.
 * Used by `updateCalendarEvent` after a planner UI edit.
 */
export async function syncFromCalendarEvent(event: {
  booking_id?: string | null;
  event_type?: string | null;
  source_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}): Promise<SyncPhaseTimeResult | null> {
  if (!event.booking_id || !event.event_type || !event.source_date) return null;
  const phase = event.event_type as Phase;
  if (!(phase in PHASE_FIELDS)) return null;

  return syncPhaseTime({
    bookingId: event.booking_id,
    phase,
    date: event.source_date,
    startISO: event.start_time ?? null,
    endISO: event.end_time ?? null,
  });
}

/**
 * Backfill: for a single large project, group all sub-bookings by phase+date
 * and force every sibling to the same time (using the first non-null source).
 * Returns total siblings synchronized.
 */
export async function backfillLargeProjectTimes(largeProjectId: string): Promise<{
  groupsProcessed: number;
  syncedSiblings: number;
}> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time')
    .eq('large_project_id', largeProjectId);

  if (error || !bookings) {
    console.warn('[timeSync] backfill lookup failed', largeProjectId, error);
    return { groupsProcessed: 0, syncedSiblings: 0 };
  }

  type Group = { phase: Phase; date: string; bookings: any[] };
  const groups = new Map<string, Group>();

  for (const b of bookings) {
    for (const phase of ['rig', 'event', 'rigDown'] as Phase[]) {
      const d = (b as any)[PHASE_FIELDS[phase].date];
      if (!d) continue;
      const key = `${phase}|${d}`;
      if (!groups.has(key)) groups.set(key, { phase, date: d, bookings: [] });
      groups.get(key)!.bookings.push(b);
    }
  }

  let groupsProcessed = 0;
  let syncedSiblings = 0;

  for (const g of groups.values()) {
    if (g.bookings.length < 2) continue; // nothing to propagate

    const f = PHASE_FIELDS[g.phase];
    // Pick the first booking that has a defined start time as the source of truth.
    const source = g.bookings.find((b) => (b as any)[f.start]) ?? g.bookings[0];
    const startISO = (source as any)[f.start] ?? null;
    const endISO = (source as any)[f.end] ?? null;
    if (!startISO && !endISO) continue;

    const res = await syncPhaseTime({
      bookingId: source.id,
      phase: g.phase,
      date: g.date,
      startISO,
      endISO,
    });
    groupsProcessed += 1;
    syncedSiblings += res.syncedSiblings;
  }

  return { groupsProcessed, syncedSiblings };
}
