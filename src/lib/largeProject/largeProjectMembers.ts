/**
 * Kanonisk medlemslista för grupprojekt (large_projects).
 *
 * `large_project_bookings` är MASTER. `bookings.large_project_id` är ett
 * kompatibilitetsfält som läses som fallback (legacy-only medlemmar) tills
 * en verifierad backfill gjorts. Alla projektlistor, kalendrar, detaljsidor
 * och sök ska gå via denna modul så att join-only och legacy-only medlemmar
 * syns likadant och aldrig dubbleras.
 */
import { supabase as defaultSupabase } from '@/integrations/supabase/client';

export interface LargeProjectMemberRow {
  id: string;
  large_project_id: string;
  booking_id: string;
  display_name: string | null;
  sort_order: number | null;
  created_at: string;
  /** 'join' = rad i large_project_bookings, 'legacy' = endast bookings.large_project_id */
  source: 'join' | 'legacy';
}

export class LargeProjectMembershipConflictError extends Error {
  readonly code = 'BOOKING_IN_OTHER_PROJECT';
  constructor(public readonly otherProjectId: string, public readonly otherProjectName?: string | null) {
    super(
      `Bokningen ingår redan i ett annat projekt${otherProjectName ? ` ("${otherProjectName}")` : ''}. Ta bort den därifrån först.`,
    );
    this.name = 'LargeProjectMembershipConflictError';
  }
}

/** Ren sammanslagning: join-rader först (sort_order), legacy läggs till utan dubbletter. */
export function mergeLargeProjectMembers(
  largeProjectId: string,
  joinRows: Array<Partial<LargeProjectMemberRow> & { booking_id: string }>,
  legacyBookingIds: string[],
): LargeProjectMemberRow[] {
  const out: LargeProjectMemberRow[] = [];
  const seen = new Set<string>();
  const sorted = [...joinRows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const r of sorted) {
    if (!r.booking_id || seen.has(r.booking_id)) continue;
    seen.add(r.booking_id);
    out.push({
      id: r.id ?? `lpb-${r.booking_id}`,
      large_project_id: r.large_project_id || largeProjectId,
      booking_id: r.booking_id,
      display_name: r.display_name ?? null,
      sort_order: r.sort_order ?? out.length,
      created_at: r.created_at ?? new Date(0).toISOString(),
      source: 'join',
    });
  }
  for (const id of legacyBookingIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id: `fk-${id}`,
      large_project_id: largeProjectId,
      booking_id: id,
      display_name: null,
      sort_order: out.length,
      created_at: new Date(0).toISOString(),
      source: 'legacy',
    });
  }
  return out;
}

/**
 * Grundbokning: explicit `primary_booking_id` om kolumnen finns och pekar på
 * en medlem, annars första medlemmen i ordning (vid skapande från en bokning
 * är det alltid den bokningen).
 */
export function resolvePrimaryBookingId(
  members: Array<{ booking_id: string }>,
  explicitPrimary?: string | null,
): string | null {
  if (explicitPrimary && members.some((m) => m.booking_id === explicitPrimary)) return explicitPrimary;
  return members[0]?.booking_id ?? null;
}

export async function loadLargeProjectMembers(
  largeProjectId: string,
  client: typeof defaultSupabase = defaultSupabase,
): Promise<LargeProjectMemberRow[]> {
  const [joinRes, legacyRes] = await Promise.all([
    client
      .from('large_project_bookings')
      .select('id, large_project_id, booking_id, display_name, sort_order, created_at')
      .eq('large_project_id', largeProjectId),
    client.from('bookings').select('id').eq('large_project_id', largeProjectId),
  ]);
  if (joinRes.error) throw joinRes.error;
  if (legacyRes.error) throw legacyRes.error;
  return mergeLargeProjectMembers(
    largeProjectId,
    (joinRes.data || []) as any[],
    ((legacyRes.data || []) as Array<{ id: string }>).map((r) => r.id),
  );
}

export async function loadLargeProjectMemberIds(
  largeProjectId: string,
  client: typeof defaultSupabase = defaultSupabase,
): Promise<string[]> {
  return (await loadLargeProjectMembers(largeProjectId, client)).map((m) => m.booking_id);
}

/** Returnerar aktivt (ej raderat) grupprojekt som bokningen redan tillhör, via båda källorna. */
export async function findActiveLargeProjectForBooking(
  bookingId: string,
  client: typeof defaultSupabase = defaultSupabase,
): Promise<{ id: string; name: string | null } | null> {
  const [joinRes, legacyRes] = await Promise.all([
    client.from('large_project_bookings').select('large_project_id').eq('booking_id', bookingId),
    client.from('bookings').select('large_project_id').eq('id', bookingId).maybeSingle(),
  ]);
  if (joinRes.error) throw joinRes.error;
  if (legacyRes.error) throw legacyRes.error;
  const ids = new Set<string>();
  for (const r of (joinRes.data || []) as any[]) if (r.large_project_id) ids.add(r.large_project_id);
  const legacy = (legacyRes.data as any)?.large_project_id;
  if (legacy) ids.add(legacy);
  if (ids.size === 0) return null;
  const { data, error } = await client
    .from('large_projects')
    .select('id, name')
    .in('id', Array.from(ids))
    .is('deleted_at', null);
  if (error) throw error;
  return ((data || [])[0] as any) ?? null;
}

/**
 * Normaliserar medlemsrader för flera projekt: join-rader vinner, legacy
 * `bookings.large_project_id` läggs till som fallback endast när bokningen
 * saknar join-rad. En bokning mappas till högst ett projekt, inga dubbletter.
 * Begränsas till `lpIds` (t.ex. inlästa, ej raderade projekt).
 */
export function normalizeLargeProjectBookingRows(
  joinRows: Array<{ large_project_id: string; booking_id: string }>,
  bookings: Iterable<{ id: string; large_project_id?: string | null }>,
  lpIds?: Set<string>,
): Array<{ large_project_id: string; booking_id: string }> {
  const out: Array<{ large_project_id: string; booking_id: string }> = [];
  const seen = new Set<string>();
  const allowed = (lp: string) => !lpIds || lpIds.has(lp);
  for (const r of joinRows) {
    if (!r.booking_id || !r.large_project_id || seen.has(r.booking_id) || !allowed(r.large_project_id)) continue;
    seen.add(r.booking_id);
    out.push({ large_project_id: r.large_project_id, booking_id: r.booking_id });
  }
  for (const b of bookings) {
    if (!b.id || !b.large_project_id || seen.has(b.id) || !allowed(b.large_project_id)) continue;
    seen.add(b.id);
    out.push({ large_project_id: b.large_project_id, booking_id: b.id });
  }
  return out;
}
