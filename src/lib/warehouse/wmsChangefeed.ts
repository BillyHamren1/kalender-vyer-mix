/**
 * WMS durable changefeed — client engine (pure, testable).
 *
 * Server contract: rpc `wms_changes_since(p_after, p_limit)` →
 *   { head, retainedFrom, events: WmsChangeEvent[] }  (org from auth, RLS applies).
 * Rules:
 *  - cursor advances only after every page has been merged successfully;
 *  - cursor older than the retention watermark → full snapshot reset;
 *  - realtime is only a wake-up; catch-up reads are the source of deltas.
 */
export interface WmsChangeEvent {
  seq: number;
  table_name: string;
  entity_id: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  packing_id: string | null;
  booking_id: string | null;
  old_window?: Record<string, unknown> | null;
  new_window?: Record<string, unknown> | null;
}

export interface WmsChangePage {
  head: number;
  retainedFrom: number;
  events: WmsChangeEvent[];
}

export type FetchChangePage = (after: number, limit: number) => Promise<WmsChangePage>;

export type CatchUpResult =
  | { kind: 'ok'; cursor: number; applied: number }
  | { kind: 'reset'; cursor: number };

/** Head cursor read BEFORE the first snapshot, so writes during bootstrap are replayed. */
export async function readHead(fetchPage: FetchChangePage): Promise<number> {
  const page = await fetchPage(Number.MAX_SAFE_INTEGER, 1);
  return page.head;
}

export async function catchUp(
  cursor: number,
  fetchPage: FetchChangePage,
  apply: (events: WmsChangeEvent[]) => Promise<void>,
  limit = 500,
): Promise<CatchUpResult> {
  const collected: WmsChangeEvent[] = [];
  let next = cursor;
  // Bounded loop: each page strictly advances or we stop.
  for (;;) {
    const page = await fetchPage(next, limit);
    if (page.retainedFrom > next) return { kind: 'reset', cursor: page.head };
    if (page.events.length === 0) break;
    const last = page.events[page.events.length - 1].seq;
    if (last <= next) break;
    collected.push(...page.events);
    next = last;
    if (next >= page.head) break;
  }
  if (collected.length > 0) await apply(collected); // throws → cursor not advanced
  return { kind: 'ok', cursor: next, applied: collected.length };
}

export interface AffectedSets {
  packingIds: Set<string>;
  bookingIds: Set<string>;
  staffIds: Set<string>;
  personnelChanged: boolean;
}

export function affectedFromEvents(events: WmsChangeEvent[]): AffectedSets {
  const out: AffectedSets = { packingIds: new Set(), bookingIds: new Set(), staffIds: new Set(), personnelChanged: false };
  for (const e of events) {
    const oldPacking = (e.old_window?.packing_id as string | undefined) ?? null;
    if (e.packing_id) out.packingIds.add(e.packing_id);
    if (oldPacking) out.packingIds.add(oldPacking); // reassigned away from a packing
    if (e.table_name === 'bookings' && e.booking_id) out.bookingIds.add(e.booking_id);
    if (e.table_name === 'staff_members') out.staffIds.add(e.entity_id);
    if (e.table_name === 'warehouse_assignments' || e.table_name === 'warehouse_calendar_events') out.personnelChanged = true;
  }
  return out;
}

export interface MergeableJob { packingId: string; bookingId: string | null; assignedStaff: { staffId: string }[]; workers: { staffId: string }[] }
export interface MergeableRange<J extends MergeableJob, S extends { packingId: string }> { jobs: J[]; scans: S[] }

/** Packings in a cached window that must be re-read for a set of changes. */
export function packingsToReload<J extends MergeableJob>(jobs: J[], a: AffectedSets, extraFromBookings: string[] = []): string[] {
  const ids = new Set(a.packingIds);
  for (const id of extraFromBookings) ids.add(id);
  for (const j of jobs) {
    if (j.bookingId && a.bookingIds.has(j.bookingId)) ids.add(j.packingId);
    if (a.staffIds.size && [...j.assignedStaff, ...j.workers].some((s) => a.staffIds.has(s.staffId))) ids.add(j.packingId);
  }
  return [...ids];
}

/** Replace only the reloaded packings' rows; everything else stays untouched. */
export function mergeRange<J extends MergeableJob, S extends { packingId: string }, R extends MergeableRange<J, S>>(
  cached: R,
  reloaded: string[],
  fresh: { jobs: J[]; scans: S[] },
): R {
  const set = new Set(reloaded);
  return {
    ...cached,
    jobs: [...cached.jobs.filter((j) => !set.has(j.packingId)), ...fresh.jobs.filter((j) => set.has(j.packingId))],
    scans: [...cached.scans.filter((s) => !set.has(s.packingId)), ...fresh.scans.filter((s) => set.has(s.packingId))],
  };
}

export function isChangefeedMissing(error: unknown): boolean {
  const e = error as { code?: string; status?: number } | null;
  return !!e && (e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01' || e.status === 404);
}
