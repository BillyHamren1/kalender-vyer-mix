/**
 * Authoritative large-project membership lookup.
 *
 * `large_project_bookings` is the MASTER. `bookings.large_project_id` is a
 * mirrored convenience column that can be NULL or stale on sub-bookings,
 * so it is only used as a fallback when no membership row exists.
 *
 * Two flavors:
 *  - `resolveLargeProjectMembershipFromRows(...)` — pure, in-memory. Use this
 *    when you have already loaded `large_project_bookings` rows and want to
 *    feed a Map into derivation logic.
 *  - `resolveLargeProjectMembership(...)` — async, queries Supabase directly.
 *    Use this in places that don't already load membership rows.
 */
import { supabase as defaultSupabase } from '@/integrations/supabase/client';

export interface LargeProjectBookingRowLite {
  large_project_id: string;
  booking_id: string;
}

export interface BookingLpFallback {
  id: string;
  large_project_id?: string | null;
}

/**
 * Pure resolver. Returns a Map<bookingId, largeProjectId>.
 * Falls back to bookings.large_project_id only when no LPB row exists.
 */
export const resolveLargeProjectMembershipFromRows = (
  bookingIds: string[],
  lpbRows: LargeProjectBookingRowLite[],
  bookingFallbacks?: Map<string, BookingLpFallback>,
): Map<string, string> => {
  const out = new Map<string, string>();
  // Authoritative
  for (const r of lpbRows) {
    if (!r.booking_id || !r.large_project_id) continue;
    if (!out.has(r.booking_id)) out.set(r.booking_id, r.large_project_id);
  }
  // Fallback to mirrored column on bookings
  if (bookingFallbacks) {
    for (const id of bookingIds) {
      if (out.has(id)) continue;
      const b = bookingFallbacks.get(id);
      if (b?.large_project_id) out.set(id, b.large_project_id);
    }
  }
  return out;
};

/**
 * Async resolver. Hits `large_project_bookings`, then optionally backfills
 * from `bookings.large_project_id` when no membership row exists.
 */
export const resolveLargeProjectMembership = async (
  bookingIds: string[],
  client: typeof defaultSupabase = defaultSupabase,
): Promise<Map<string, string>> => {
  if (bookingIds.length === 0) return new Map();
  const { data: lpbRows, error } = await client
    .from('large_project_bookings')
    .select('large_project_id, booking_id')
    .in('booking_id', bookingIds);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[resolveLargeProjectMembership] lpb fetch error', error);
  }

  const resolved = resolveLargeProjectMembershipFromRows(
    bookingIds,
    (lpbRows || []) as LargeProjectBookingRowLite[],
  );

  const missing = bookingIds.filter((id) => !resolved.has(id));
  if (missing.length > 0) {
    const { data: bRows, error: bErr } = await client
      .from('bookings')
      .select('id, large_project_id')
      .in('id', missing);
    if (bErr) {
      // eslint-disable-next-line no-console
      console.error('[resolveLargeProjectMembership] bookings fallback fetch error', bErr);
    }
    const fb = new Map<string, BookingLpFallback>();
    (bRows || []).forEach((b: any) => fb.set(b.id, b));
    return resolveLargeProjectMembershipFromRows(
      bookingIds,
      (lpbRows || []) as LargeProjectBookingRowLite[],
      fb,
    );
  }
  return resolved;
};
