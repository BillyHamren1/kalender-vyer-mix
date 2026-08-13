/**
 * STEG 4G — Per-organization safety metrics + anomaly flags.
 *
 * REN diagnostik: inga DB-anrop, inga mutationer, inga automatiska "fixar".
 * Syftet är att ett syncproblem ska kunna UPPTÄCKAS och STOPPAS innan det
 * hinner påverka många bookings.
 */

export const SYNC_OPS_METRICS_LOG = 'sync_ops_metrics';
export const SYNC_OPS_ANOMALY_LOG = 'sync_ops_anomaly';

export interface OrgSafetyMetrics {
  organization_id: string;
  imports: number;
  applied: number;
  partial: number;
  failed: number;
  stale: number;
  conflicts: number;
  lease_losses: number;
  retries: number;
  circuit_breaker: number;
  cancellation_candidates: number;
  /** Diagnostiska raderingskandidater (aldrig utförda raderingar). */
  product_delete_candidates: number;
  calendar_delete_candidates: number;
  /** booking_id → antal försök i fönstret. */
  retries_per_booking: Record<string, number>;
  /** Booking-ID:n där revisionen gick bakåt. */
  revision_backwards: string[];
  /** Summerade källantal för att upptäcka plötsligt tapp. */
  source_count: number;
  previous_source_count: number | null;
}

export function createOrgSafetyMetrics(organizationId: string): OrgSafetyMetrics {
  return {
    organization_id: organizationId,
    imports: 0,
    applied: 0,
    partial: 0,
    failed: 0,
    stale: 0,
    conflicts: 0,
    lease_losses: 0,
    retries: 0,
    circuit_breaker: 0,
    cancellation_candidates: 0,
    product_delete_candidates: 0,
    calendar_delete_candidates: 0,
    retries_per_booking: {},
    revision_backwards: [],
    source_count: 0,
    previous_source_count: null,
  };
}

export interface SyncOutcomeEvent {
  organization_id: string;
  booking_id?: string | null;
  /** Normaliserat utfall för en enskild booking-sync. */
  outcome:
    | 'applied'
    | 'already_current'
    | 'partial'
    | 'failed'
    | 'stale'
    | 'conflict'
    | 'cancellation_candidate'
    | 'paused'
    | 'blocked';
  retries?: number;
  lease_loss?: boolean;
  circuit_breaker?: boolean;
  product_delete_candidates?: number;
  calendar_delete_candidates?: number;
  revision_went_backwards?: boolean;
  source_count?: number | null;
  previous_source_count?: number | null;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
};

/** Registrerar ETT booking-utfall i org-metriken. Muterar bara metrics-objektet. */
export function recordSyncOutcome(metrics: OrgSafetyMetrics, event: SyncOutcomeEvent): OrgSafetyMetrics {
  metrics.imports += 1;
  switch (event.outcome) {
    case 'applied':
    case 'already_current':
      metrics.applied += 1;
      break;
    case 'partial':
      metrics.partial += 1;
      break;
    case 'failed':
    case 'blocked':
      metrics.failed += 1;
      break;
    case 'stale':
      metrics.stale += 1;
      break;
    case 'conflict':
      metrics.conflicts += 1;
      break;
    case 'cancellation_candidate':
      metrics.cancellation_candidates += 1;
      break;
    case 'paused':
      // Paus är inte ett fel — räknas endast som import-försök.
      break;
  }
  metrics.retries += n(event.retries);
  if (event.lease_loss) metrics.lease_losses += 1;
  if (event.circuit_breaker) metrics.circuit_breaker += 1;
  metrics.product_delete_candidates += n(event.product_delete_candidates);
  metrics.calendar_delete_candidates += n(event.calendar_delete_candidates);

  const bid = (event.booking_id ?? '').toString();
  if (bid && n(event.retries) > 0) {
    metrics.retries_per_booking[bid] = (metrics.retries_per_booking[bid] ?? 0) + n(event.retries);
  }
  if (event.revision_went_backwards && bid && !metrics.revision_backwards.includes(bid)) {
    metrics.revision_backwards.push(bid);
  }
  if (typeof event.source_count === 'number') metrics.source_count += n(event.source_count);
  if (typeof event.previous_source_count === 'number') {
    metrics.previous_source_count = (metrics.previous_source_count ?? 0) + n(event.previous_source_count);
  }
  return metrics;
}

/** Trösklar. Serverstyrda, kan aldrig sättas via request. */
export const ANOMALY_THRESHOLDS = Object.freeze({
  /** Andel failed+partial av imports (kräver minst min_sample importer). */
  failure_rate: 0.3,
  min_sample: 5,
  product_delete_candidates: 25,
  calendar_delete_candidates: 10,
  retries_same_booking: 3,
  /** Källantal minskat med minst denna andel jämfört med föregående körning. */
  source_count_drop_ratio: 0.5,
  source_count_min_previous: 10,
});

export type OrgAnomalyFlag =
  | 'high_failure_rate'
  | 'many_product_delete_candidates'
  | 'many_calendar_delete_candidates'
  | 'repeated_retry_same_booking'
  | 'revision_went_backwards'
  | 'sudden_source_count_drop';

export interface OrgAnomalyResult {
  organization_id: string;
  flags: OrgAnomalyFlag[];
  details: Record<string, unknown>;
  /** true = drift bör pausa sync manuellt och undersöka (ingen automatik). */
  recommend_pause: boolean;
}

/** Endast detektering. Ändrar aldrig data och pausar aldrig automatiskt. */
export function detectOrgAnomalies(metrics: OrgSafetyMetrics): OrgAnomalyResult {
  const flags: OrgAnomalyFlag[] = [];
  const details: Record<string, unknown> = {};

  const bad = metrics.failed + metrics.partial;
  const rate = metrics.imports > 0 ? bad / metrics.imports : 0;
  if (metrics.imports >= ANOMALY_THRESHOLDS.min_sample && rate >= ANOMALY_THRESHOLDS.failure_rate) {
    flags.push('high_failure_rate');
    details.failure_rate = Number(rate.toFixed(3));
  }

  if (metrics.product_delete_candidates >= ANOMALY_THRESHOLDS.product_delete_candidates) {
    flags.push('many_product_delete_candidates');
    details.product_delete_candidates = metrics.product_delete_candidates;
  }

  if (metrics.calendar_delete_candidates >= ANOMALY_THRESHOLDS.calendar_delete_candidates) {
    flags.push('many_calendar_delete_candidates');
    details.calendar_delete_candidates = metrics.calendar_delete_candidates;
  }

  const repeated = Object.entries(metrics.retries_per_booking)
    .filter(([, count]) => count >= ANOMALY_THRESHOLDS.retries_same_booking)
    .map(([bookingId]) => bookingId);
  if (repeated.length > 0) {
    flags.push('repeated_retry_same_booking');
    details.repeated_retry_bookings = repeated;
  }

  if (metrics.revision_backwards.length > 0) {
    flags.push('revision_went_backwards');
    details.revision_backwards = metrics.revision_backwards;
  }

  const prev = metrics.previous_source_count;
  if (
    typeof prev === 'number' &&
    prev >= ANOMALY_THRESHOLDS.source_count_min_previous &&
    metrics.source_count <= prev * ANOMALY_THRESHOLDS.source_count_drop_ratio
  ) {
    flags.push('sudden_source_count_drop');
    details.source_count = metrics.source_count;
    details.previous_source_count = prev;
  }

  return {
    organization_id: metrics.organization_id,
    flags,
    details,
    recommend_pause: flags.length > 0,
  };
}

/** Bygger loggobjektet. Innehåller aldrig tokens/secrets — endast räknare. */
export function buildOrgMetricsLog(metrics: OrgSafetyMetrics, anomalies?: OrgAnomalyResult): Record<string, unknown> {
  const a = anomalies ?? detectOrgAnomalies(metrics);
  return {
    log: SYNC_OPS_METRICS_LOG,
    organization_id: metrics.organization_id,
    imports: metrics.imports,
    applied: metrics.applied,
    partial: metrics.partial,
    failed: metrics.failed,
    stale: metrics.stale,
    conflicts: metrics.conflicts,
    lease_losses: metrics.lease_losses,
    retries: metrics.retries,
    circuit_breaker: metrics.circuit_breaker,
    cancellation_candidates: metrics.cancellation_candidates,
    product_delete_candidates: metrics.product_delete_candidates,
    calendar_delete_candidates: metrics.calendar_delete_candidates,
    anomalies: a.flags,
    anomaly_details: a.details,
    recommend_pause: a.recommend_pause,
  };
}

export function logOrgMetrics(metrics: OrgSafetyMetrics): Record<string, unknown> {
  const anomalies = detectOrgAnomalies(metrics);
  const payload = buildOrgMetricsLog(metrics, anomalies);
  console.log(`[${SYNC_OPS_METRICS_LOG}]`, JSON.stringify(payload));
  if (anomalies.flags.length > 0) {
    console.warn(`[${SYNC_OPS_ANOMALY_LOG}]`, JSON.stringify({
      log: SYNC_OPS_ANOMALY_LOG,
      organization_id: metrics.organization_id,
      anomalies: anomalies.flags,
      details: anomalies.details,
    }));
  }
  return payload;
}

/** Per-org register. Organisationer hålls alltid isolerade från varandra. */
export class OrgMetricsRegistry {
  private readonly map = new Map<string, OrgSafetyMetrics>();

  for(organizationId: string): OrgSafetyMetrics {
    const key = (organizationId ?? '').toString();
    let m = this.map.get(key);
    if (!m) {
      m = createOrgSafetyMetrics(key);
      this.map.set(key, m);
    }
    return m;
  }

  record(event: SyncOutcomeEvent): OrgSafetyMetrics {
    return recordSyncOutcome(this.for(event.organization_id), event);
  }

  all(): OrgSafetyMetrics[] {
    return Array.from(this.map.values());
  }

  anomalies(): OrgAnomalyResult[] {
    return this.all().map(detectOrgAnomalies).filter((a) => a.flags.length > 0);
  }

  flush(): Record<string, unknown>[] {
    return this.all().map(logOrgMetrics);
  }
}
