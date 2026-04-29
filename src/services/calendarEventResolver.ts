/**
 * calendarEventResolver — resolve a "synthetic" calendar event id
 * (e.g. those produced by deriveStaffEvents like
 *   `staff-{staffId}-booking-{bookingId}-{phase}-{date}`
 *  or
 *   `staff-{staffId}-large-{lpId}-{phase}-{date}`)
 * to a real `calendar_events.id` row, when one exists.
 *
 * The personal calendar derives rows from booking_staff_assignments + project
 * date arrays — many rows have NO matching `calendar_events` row at all. So
 * blindly calling `updateCalendarEvent(syntheticId, …)` returned 0 rows and
 * the user got an opaque "Kunde inte flytta eventet" toast for *exactly those*
 * rows where no underlying calendar_events row existed yet.
 *
 * Strategy:
 *   - If the id looks like a real UUID and not a synthetic prefix → return it as-is.
 *   - Otherwise, look up calendar_events by
 *       (booking_id, event_type=phase, source_date=fromDate)
 *     and return the first match (or null if none).
 */
import { supabase } from '@/integrations/supabase/client';

const SYNTHETIC_PREFIXES = ['staff-', 'synthetic-', 'derived-'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolveInput {
  rawId: string;
  bookingId?: string | null;
  eventType?: string | null; // 'rig' | 'event' | 'rigDown'
  sourceDate?: string | null; // yyyy-MM-dd — the CURRENT date of the row before the move
}

/**
 * @deprecated Synthetic ids should no longer exist post-backfill. Kept only
 * as an internal helper for resolveCalendarEventId. Do NOT branch UI on it.
 */
const looksSynthetic = (id: string): boolean => {
  if (!id) return true;
  if (SYNTHETIC_PREFIXES.some((p) => id.startsWith(p))) return true;
  if (!UUID_RE.test(id)) return true;
  return false;
};

/**
 * Returns the real calendar_events.id to write to, or null if no row exists yet.
 */
export const resolveCalendarEventId = async ({
  rawId,
  bookingId,
  eventType,
  sourceDate,
}: ResolveInput): Promise<string | null> => {
  if (rawId && !isSyntheticCalendarEventId(rawId)) {
    return rawId;
  }

  if (!bookingId || !eventType || !sourceDate) {
    return null;
  }

  // Some legacy rows store rigDown as 'rigdown' — accept both.
  const acceptedTypes =
    eventType === 'rigDown'
      ? ['rigDown', 'rigdown']
      : [eventType];

  const { data, error } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('booking_id', bookingId)
    .in('event_type', acceptedTypes)
    .eq('source_date', sourceDate)
    .limit(1);

  if (error) {
    console.warn('[resolveCalendarEventId] lookup failed', { rawId, bookingId, eventType, sourceDate, error });
    return null;
  }

  return data?.[0]?.id ?? null;
};
