/**
 * Warehouse productivity — READ-ONLY analysis layer.
 *
 * Hard rules (see prompt "DEL 4 – Produktivitetsgrund"):
 *  - Pure functions only. No DB writes, no side effects, no scoring of people.
 *  - Only compares like-for-like work: an observation is compared against
 *    other observations of the SAME activity type (and, for the per-person
 *    baseline, the same person + activity type).
 *  - Never invents a value. Too little data => confidence 'none' and a
 *    null baseline the UI must render as "Otillräckligt underlag".
 *  - Nothing here may be written back to operational tables (score, ranking,
 *    staff status, schedule, payroll, discipline).
 */

export type ProductivityActivityType =
  | 'packing'
  | 'return'
  | 'inventory'
  | 'internal_task'
  | 'other';

export type ProductivityConfidence = 'none' | 'low' | 'medium' | 'high';

/** One historical, concrete warehouse job performed by one person. */
export interface ProductivityObservation {
  /** warehouse_assignments.id (or another stable concrete-job id). */
  id: string;
  staffId: string;
  staffName?: string | null;
  activityType: ProductivityActivityType;
  /** YYYY-MM-DD */
  date: string;
  /** Planned minutes from the plan, when a time window exists. */
  plannedMinutes: number | null;
  /** Actually worked minutes for this person on this job. */
  actualMinutes: number | null;
  /**
   * Optional complexity signal (e.g. number of packing list items). Used to
   * avoid comparing a trivial job with a big one. Unknown => null.
   */
  complexity?: number | null;
}

export interface ProductivityBaseline {
  activityType: ProductivityActivityType;
  /** null when there is no usable data. */
  medianActualMinutes: number | null;
  medianPlannedMinutes: number | null;
  observations: number;
  confidence: ProductivityConfidence;
}

export interface ProductivityPersonBaseline extends ProductivityBaseline {
  staffId: string;
  staffName: string | null;
  /** Deviation vs the like-for-like activity median, in percent. */
  deviationPercentVsActivity: number | null;
}

export interface ProductivityReadModel {
  byActivity: ProductivityBaseline[];
  byPersonAndActivity: ProductivityPersonBaseline[];
  totalObservations: number;
  usableObservations: number;
}

/** Below this we refuse to output a number at all. */
export const MIN_OBSERVATIONS = 3;

/** Complexity buckets keep "simple" and "complex" jobs apart. */
export const complexityBucket = (complexity: number | null | undefined): string => {
  if (complexity == null || !Number.isFinite(complexity)) return 'unknown';
  if (complexity <= 20) return 'small';
  if (complexity <= 100) return 'medium';
  return 'large';
};

export const median = (values: number[]): number | null => {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (usable.length === 0) return null;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 === 1
    ? usable[mid]
    : Math.round((usable[mid - 1] + usable[mid]) / 2);
};

export const confidenceFor = (observations: number): ProductivityConfidence => {
  if (observations < MIN_OBSERVATIONS) return 'none';
  if (observations < 6) return 'low';
  if (observations < 15) return 'medium';
  return 'high';
};

/** Human-readable label. UI must never print a fabricated number instead. */
export const INSUFFICIENT_DATA_LABEL = 'Otillräckligt underlag';

const usable = (o: ProductivityObservation): boolean =>
  typeof o.actualMinutes === 'number' && Number.isFinite(o.actualMinutes) && o.actualMinutes > 0;

const buildBaseline = (
  activityType: ProductivityActivityType,
  rows: ProductivityObservation[],
): ProductivityBaseline => {
  const confidence = confidenceFor(rows.length);
  const enough = confidence !== 'none';
  return {
    activityType,
    medianActualMinutes: enough ? median(rows.map((r) => r.actualMinutes as number)) : null,
    medianPlannedMinutes: enough
      ? median(rows.map((r) => r.plannedMinutes).filter((v): v is number => typeof v === 'number'))
      : null,
    observations: rows.length,
    confidence,
  };
};

/**
 * Builds the read model. Comparison keys are `activityType` (+ complexity
 * bucket for the deviation), so packing is never compared against returns.
 */
export function buildWarehouseProductivityReadModel(
  observations: ProductivityObservation[],
): ProductivityReadModel {
  const rows = (observations || []).filter(usable);

  const byActivityMap = new Map<ProductivityActivityType, ProductivityObservation[]>();
  for (const row of rows) {
    const list = byActivityMap.get(row.activityType) || [];
    list.push(row);
    byActivityMap.set(row.activityType, list);
  }

  const byActivity = Array.from(byActivityMap.entries()).map(([type, list]) =>
    buildBaseline(type, list),
  );

  const byPersonMap = new Map<string, ProductivityObservation[]>();
  for (const row of rows) {
    const key = `${row.staffId}::${row.activityType}`;
    const list = byPersonMap.get(key) || [];
    list.push(row);
    byPersonMap.set(key, list);
  }

  const byPersonAndActivity: ProductivityPersonBaseline[] = Array.from(byPersonMap.entries()).map(
    ([key, list]) => {
      const [staffId] = key.split('::');
      const activityType = list[0].activityType;
      const base = buildBaseline(activityType, list);

      // Like-for-like peer group: same activity type AND same complexity bucket
      // when complexity is known for this person's jobs.
      const buckets = new Set(list.map((r) => complexityBucket(r.complexity)));
      const peers = (byActivityMap.get(activityType) || []).filter(
        (r) => buckets.has(complexityBucket(r.complexity)) || buckets.has('unknown'),
      );
      const peerMedian =
        confidenceFor(peers.length) === 'none'
          ? null
          : median(peers.map((r) => r.actualMinutes as number));

      const own = base.medianActualMinutes;
      const deviation =
        peerMedian && own && peerMedian > 0
          ? Math.round(((own - peerMedian) / peerMedian) * 100)
          : null;

      return {
        ...base,
        staffId,
        staffName: list[0].staffName ?? null,
        deviationPercentVsActivity: deviation,
      };
    },
  );

  return {
    byActivity,
    byPersonAndActivity,
    totalObservations: (observations || []).length,
    usableObservations: rows.length,
  };
}

/** Formats a baseline value for the UI without ever inventing a number. */
export const formatBaselineMinutes = (value: number | null): string =>
  value == null ? INSUFFICIENT_DATA_LABEL : `${value} min`;
