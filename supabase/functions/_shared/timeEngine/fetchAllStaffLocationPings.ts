// @ts-nocheck
/**
 * fetchAllStaffLocationPings
 * ──────────────────────────
 * Single canonical paginated reader for `staff_location_history` used by
 * Time Engine, cache builders, debug tools and AI review flows.
 *
 * Why this helper exists
 * ----------------------
 * PostgREST silently caps every `.from(...).select(...)` at 1000 rows. A naive
 * `.limit(5000)` therefore SILENTLY truncates to 1000 and different parts of
 * the system (debug, admin report, AI review, health checks) end up analysing
 * different subsets of the same day's GPS data. This helper paginates with
 * `.range(from, to)` until the day is exhausted (or `cap` is reached) and
 * returns explicit diagnostics so we can SEE if the cap is ever hit.
 *
 * Contract
 * --------
 * - READ ONLY. Never writes.
 * - Sorts ascending on `recorded_at`.
 * - Filters by `organization_id` + `staff_id` (multi-tenant safe).
 * - Optional org-only mode (omit `staffId`) for peer-ping fetches; in that
 *   case use `excludeStaffId` to skip the focal staff.
 * - Returns `{ rows, diagnostics }` — diagnostics expose `pageCount`,
 *   `totalFetched`, `capHit`, `firstRecordedAt`, `lastRecordedAt`,
 *   `warning` and the page size used.
 *
 * NEVER use `.limit(2000)` / `.limit(5000)` for day-wide GPS reads. Use this.
 */

export interface FetchAllStaffLocationPingsArgs {
  supabaseAdmin: any;
  organizationId: string;
  /** Omit (or pass null) for an org-wide read (e.g. peer pings). */
  staffId?: string | null;
  /** ISO start (inclusive). */
  startUtc: string;
  /** ISO end (inclusive). */
  endUtc: string;
  /** PostgREST hard caps each request at 1000 rows. Keep at 1000. */
  pageSize?: number;
  /** Safety cap on total rows to avoid runaway loops. Surface via `capHit`. */
  cap?: number;
  /** Comma-separated columns. Defaults to the lean Time Engine projection. */
  select?: string;
  /** When set together with org-only mode, excludes this staff_id (`.neq`). */
  excludeStaffId?: string | null;
}

export interface FetchAllStaffLocationPingsDiagnostics {
  pageCount: number;
  pageSize: number;
  totalFetched: number;
  capHit: boolean;
  /** Set to "PING_DAY_CAP_REACHED" iff capHit. Surfaced for ops/debug. */
  warning: string | null;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  /** Last error message if any page failed; older pages still returned. */
  errorMessage: string | null;
  windowStartUtc: string;
  windowEndUtc: string;
  organizationId: string;
  staffId: string | null;
  excludeStaffId: string | null;
}

export interface FetchAllStaffLocationPingsResult<T = any> {
  rows: T[];
  diagnostics: FetchAllStaffLocationPingsDiagnostics;
}

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_CAP = 20_000;
const DEFAULT_SELECT = 'lat, lng, accuracy, speed, recorded_at';

export async function fetchAllStaffLocationPings<T = any>(
  args: FetchAllStaffLocationPingsArgs,
): Promise<FetchAllStaffLocationPingsResult<T>> {
  const {
    supabaseAdmin,
    organizationId,
    staffId = null,
    startUtc,
    endUtc,
    pageSize = DEFAULT_PAGE_SIZE,
    cap = DEFAULT_CAP,
    select = DEFAULT_SELECT,
    excludeStaffId = null,
  } = args;

  const rows: T[] = [];
  let pageCount = 0;
  let errorMessage: string | null = null;
  let from = 0;

  while (rows.length < cap) {
    const to = from + pageSize - 1;
    let q = supabaseAdmin
      .from('staff_location_history')
      .select(select)
      .eq('organization_id', organizationId)
      .gte('recorded_at', startUtc)
      .lte('recorded_at', endUtc);

    if (staffId) q = q.eq('staff_id', staffId);
    if (excludeStaffId) q = q.neq('staff_id', excludeStaffId);

    const { data, error } = await q
      .order('recorded_at', { ascending: true })
      .range(from, to);
    pageCount += 1;

    if (error) {
      errorMessage = error.message ?? String(error);
      break;
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const capHit = rows.length >= cap;
  const trimmed = capHit ? rows.slice(0, cap) : rows;

  const firstRecordedAt =
    trimmed.length > 0 ? (trimmed[0] as any).recorded_at ?? null : null;
  const lastRecordedAt =
    trimmed.length > 0
      ? (trimmed[trimmed.length - 1] as any).recorded_at ?? null
      : null;

  return {
    rows: trimmed,
    diagnostics: {
      pageCount,
      pageSize,
      totalFetched: trimmed.length,
      capHit,
      warning: capHit ? 'PING_DAY_CAP_REACHED' : null,
      firstRecordedAt,
      lastRecordedAt,
      errorMessage,
      windowStartUtc: startUtc,
      windowEndUtc: endUtc,
      organizationId,
      staffId: staffId ?? null,
      excludeStaffId: excludeStaffId ?? null,
    },
  };
}
