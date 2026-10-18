/**
 * Bounded read helpers for the warehouse overview (useWarehouseOpsRange).
 *
 * The overview used to fetch every packing (incl. completed) and all their
 * rows before filtering by date. These helpers let the hook decide which
 * packings can appear in the selected window BEFORE loading heavy rows, and
 * read without silent row caps.
 */

/** Statuses where the job is finished; only shown if it is anchored inside the window. */
export const OPS_DONE_STATUSES = ["completed_in", "completed", "done", "returned"] as const;
/** Statuses that are still open work. */
export const OPS_OPEN_STATUSES = [
  "planning",
  "in_progress",
  "packed",
  "delivered",
  "back",
  "returning",
  "started_back",
  "in_production",
  "completed_out",
] as const;

const ACTIVE_NOW = new Set(["in_progress", "returning", "back"]);
const NOT_UPCOMING = new Set(["completed_out", "completed_in", "completed", "done"]);

export interface OpsCandidateInput {
  status: string;
  start_date: string | null;
  end_date: string | null;
  rigdaydate?: string | null;
  rigdowndate?: string | null;
}

/**
 * Superset of the final job filter in useWarehouseOpsRange, evaluated on a
 * packing + its booking dates only. If this returns false, no job row of the
 * packing can survive the final filter, so its rows never need to be read.
 */
export function isOpsWindowCandidate(
  p: OpsCandidateInput,
  startDay: string,
  endDay: string,
  todayStr: string,
): boolean {
  const out = p.rigdaydate || p.start_date || null;
  const inn = p.rigdowndate || p.end_date || null;
  const last = p.end_date || p.rigdowndate || out;
  const inRange = (d: string | null) => !!d && d >= startDay && d <= endDay;
  if (last && last < todayStr && last < startDay) return false; // already rigged down
  if (inRange(out) || inRange(inn)) return true;
  if (ACTIVE_NOW.has(p.status)) return true;
  return !NOT_UPCOMING.has(p.status) && !!last && last >= todayStr;
}

type Page<T> = { data: T[] | null; error: unknown };

/** Read every page (1000 rows each) — never truncates silently. */
export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** Split ids into URL-safe chunks and run reads with bounded parallelism. */
export async function readInChunks<T>(
  ids: string[],
  read: (chunk: string[]) => Promise<T[]>,
  chunkSize = 150,
  concurrency = 4,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const results: T[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const idx = next++;
      results[idx] = await read(chunks[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return results.flat();
}
