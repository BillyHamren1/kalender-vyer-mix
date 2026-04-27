/**
 * Project Address Visits — per-address breakdown tracker for large projects.
 *
 * While a project timer is running, geofence enter/exit events for the
 * project's individual sub-booking addresses are recorded here as visit
 * intervals. When the project timer is stopped and the project-total
 * time_report is saved, these intervals are flushed into the API as
 * subdivision time_reports linked to that parent.
 *
 * This module owns ONLY local persistence. No network. The flush logic
 * lives in `useWorkSession.stopSession` (where the parent total is born).
 *
 * Storage: localStorage key `eventflow-project-address-visits`.
 * Shape: { [largeProjectId]: VisitInterval[] }
 *
 * Cleanup: visits older than 48h are pruned on read to bound storage.
 */

const STORAGE_KEY = 'eventflow-project-address-visits';
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48h

export interface VisitInterval {
  /** Sub-booking the staff was inside the geofence of. */
  bookingId: string;
  /** Optional human label for logging/debugging. */
  bookingLabel?: string | null;
  /** Address visited (for description on the resulting subdivision row). */
  address?: string | null;
  /** Geofence ENTER timestamp (ISO). */
  enteredAtIso: string;
  /** Geofence EXIT timestamp (ISO). Null while still inside. */
  exitedAtIso: string | null;
}

type Store = Record<string, VisitInterval[]>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return prune(parsed);
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('[ProjectAddressVisits] persist failed:', err);
  }
}

function prune(store: Store): Store {
  const cutoff = Date.now() - MAX_AGE_MS;
  const next: Store = {};
  for (const [pid, visits] of Object.entries(store)) {
    const fresh = (visits || []).filter(v => {
      const ts = new Date(v.enteredAtIso).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
    if (fresh.length > 0) next[pid] = fresh;
  }
  return next;
}

/**
 * Record a geofence ENTER for a sub-booking under an active project timer.
 * Idempotent — if the most recent interval for this booking is still open,
 * we keep that one (don't double-open on duplicate ENTER events).
 */
export function recordEnter(args: {
  largeProjectId: string;
  bookingId: string;
  bookingLabel?: string | null;
  address?: string | null;
  enteredAtIso?: string;
}): void {
  const store = readStore();
  const list = store[args.largeProjectId] || [];
  const last = list[list.length - 1];
  // If the most recent visit for this booking is still open, ignore.
  if (last && last.bookingId === args.bookingId && last.exitedAtIso === null) {
    return;
  }
  list.push({
    bookingId: args.bookingId,
    bookingLabel: args.bookingLabel ?? null,
    address: args.address ?? null,
    enteredAtIso: args.enteredAtIso ?? new Date().toISOString(),
    exitedAtIso: null,
  });
  store[args.largeProjectId] = list;
  writeStore(store);
}

/**
 * Record a geofence EXIT for a sub-booking. Closes the most recent open
 * interval matching that booking. No-op if there is no open interval.
 */
export function recordExit(args: {
  largeProjectId: string;
  bookingId: string;
  exitedAtIso?: string;
}): void {
  const store = readStore();
  const list = store[args.largeProjectId];
  if (!list || list.length === 0) return;
  // Find the last open interval for this booking.
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i];
    if (v.bookingId === args.bookingId && v.exitedAtIso === null) {
      v.exitedAtIso = args.exitedAtIso ?? new Date().toISOString();
      writeStore(store);
      return;
    }
  }
}

/**
 * Take all visits for a project and remove them from storage. Any still-open
 * intervals are auto-closed at `closeOpenAtIso` (typically the project
 * timer's stop time) so they can be flushed as subdivision time_reports.
 *
 * Returns intervals with non-zero duration only.
 */
export function takeVisits(args: {
  largeProjectId: string;
  closeOpenAtIso: string;
}): VisitInterval[] {
  const store = readStore();
  const list = store[args.largeProjectId] || [];
  delete store[args.largeProjectId];
  writeStore(store);

  const closed = list.map(v =>
    v.exitedAtIso ? v : { ...v, exitedAtIso: args.closeOpenAtIso }
  );

  // Drop intervals with zero or negative duration (clock skew, race conditions).
  return closed.filter(v => {
    const start = new Date(v.enteredAtIso).getTime();
    const end = new Date(v.exitedAtIso!).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  });
}

/** Inspect (without consuming) — used by UI to show "tracking N addresses". */
export function peekVisits(largeProjectId: string): VisitInterval[] {
  const store = readStore();
  return store[largeProjectId] || [];
}

/** Clear visits for a project (e.g. when the user cancels the timer). */
export function clearVisits(largeProjectId: string): void {
  const store = readStore();
  delete store[largeProjectId];
  writeStore(store);
}
