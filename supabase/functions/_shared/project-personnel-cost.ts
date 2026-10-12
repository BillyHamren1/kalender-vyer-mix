/**
 * Operations-only personnel calculation. Inputs must be resolved server-side
 * after tenant/role authorization. No Time/Finance multiplication, GPS fallback,
 * current-rate fallback or mutation of the immutable Time document exists here.
 *
 * source_revision is the Operations publication sequence (time AND review
 * changes). time_snapshot_version is the independent frozen Time version.
 * Every publication replaces the complete stable worker/day stream.
 */
export const PERSONNEL_COST_SCHEMA = 'operations-personnel-cost-v1' as const;
export const PERSONNEL_CALCULATION_VERSION =
  'operations-personnel-cost.v1.half-up' as const;

type Target = {
  sourceSystem: string;
  kind: string;
  externalId: string;
  version: string;
};
export interface FrozenTimeSnapshot {
  id: string;
  schemaVersion: 'day-submission.v1';
  snapshotHash: string;
  organizationId: string;
  workerId: string;
  workDate: string;
  version: number;
  status: 'submitted';
  syncState: 'synced';
  attestation: {
    confirmedByWorker: true;
    targetKeys: readonly string[];
    [key: string]: unknown;
  };
  blocks: readonly {
    id: string;
    kind: string;
    durationMinutes: number;
    startsAt: string;
    endsAt: string;
    target?: Target;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}
export interface ResolvedAllocation {
  organization_id: string;
  source_time_line_id: string;
  /** Exact immutable target exported to Time, never a display-name match. */
  target: Target;
  source_project_id: string;
  source_booking_id: string | null;
  currency: string;
}
export interface HistoricalPersonnelRate {
  organization_id: string;
  worker_id: string;
  category: 'work' | 'travel';
  currency: string;
  rate_revision: string;
  hourly_rate_minor: number;
  effective_from: string;
  /** Exclusive end date, null means no expiry. */
  effective_to: string | null;
}
export interface PersonnelCostLine {
  source_time_line_id: string;
  source_project_id: string;
  source_booking_id: string | null;
  minutes: number;
  rate_revision: string | null;
  hourly_rate_minor: number | null;
  amount_minor: number | null;
  currency: string;
  status: 'preliminary' | 'confirmed' | 'rejected';
  coverage: 'complete' | 'missing_rate';
}
export interface PersonnelCostSnapshot {
  schema_version: typeof PERSONNEL_COST_SCHEMA;
  organization_id: string;
  source_time_stream_id: string;
  source_time_report_id: string;
  source_revision: number;
  time_snapshot_version: number;
  source_snapshot_hash: string;
  worker_id: string;
  work_date: string;
  calculation_version: typeof PERSONNEL_CALCULATION_VERSION;
  lines: PersonnelCostLine[];
}
export interface PersonnelCalculationContext {
  organization_id: string;
  time_organization_id: string;
  /** Server-verified original Time Auth identity, preserved inside raw hash. */
  time_auth_worker_id: string;
  /** Server-linked Operations personnel identity, not the Time Auth identity. */
  worker_id: string;
  source_time_stream_id: string;
  source_revision: number;
  project_review_status: PersonnelCostLine['status'];
  allocations: readonly ResolvedAllocation[];
  rates: readonly HistoricalPersonnelRate[];
}
export class PersonnelCostError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PersonnelCostError';
  }
}
const fail: (code: string) => never = (code) => {
  throw new PersonnelCostError(code);
};
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 &&
  value === value.trim();
const int = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const date = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const currency = (value: string) => /^[A-Z]{3}$/.test(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const targetKey = (target: Target): string => {
  if (
    !target ||
    ![target.sourceSystem, target.kind, target.externalId, target.version]
      .every(text)
  ) fail('invalid_target');
  // JSON tuple avoids delimiter collisions in foreign/version identifiers.
  return JSON.stringify([
    target.sourceSystem,
    target.kind,
    target.externalId,
    target.version,
  ]);
};
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined).sort(([left], [right]) =>
          left.localeCompare(right)
        )
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};
/** Matches Time's source canonical.ts, excluding only generated id/hash. */
export async function verifyFrozenTimeSnapshot(
  snapshot: FrozenTimeSnapshot,
): Promise<void> {
  if (
    !snapshot || snapshot.schemaVersion !== 'day-submission.v1' ||
    snapshot.status !== 'submitted' ||
    snapshot.syncState !== 'synced' ||
    snapshot.attestation?.confirmedByWorker !== true ||
    !text(snapshot.id) || !text(snapshot.organizationId) ||
    !text(snapshot.workerId) ||
    !date(snapshot.workDate) || !int(snapshot.version, 1) ||
    !Array.isArray(snapshot.blocks) ||
    !Array.isArray(snapshot.attestation.targetKeys) ||
    !/^[0-9a-f]{64}$/.test(snapshot.snapshotHash)
  ) fail('invalid_frozen_snapshot');
  const { id: _id, snapshotHash: _hash, ...unsigned } = snapshot;
  const bytes = new TextEncoder().encode(
    JSON.stringify(canonicalize(unsigned)),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  if (actual !== snapshot.snapshotHash) fail('snapshot_hash_mismatch');
  const expectedId = `${actual.slice(0, 8)}-${actual.slice(8, 12)}-5${
    actual.slice(13, 16)
  }-8${actual.slice(17, 20)}-${actual.slice(20, 32)}`;
  if (snapshot.id !== expectedId) fail('snapshot_id_mismatch');
}
/** Exact nonnegative half-up rounding in the currency's minor unit. */
export function calculatePersonnelAmountMinor(
  minutes: number,
  rateMinor: number,
): number {
  if (!int(minutes) || !int(rateMinor)) fail('invalid_calculation_operand');
  const result = (BigInt(minutes) * BigInt(rateMinor) + 30n) / 60n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail('amount_overflow');
  return Number(result);
}
/** Shared Operations selection; no current-rate fallback and exclusive valid-to. */
export interface HistoricalRateBinding {
  organization_id: string;
  worker_id: string;
  category: 'work' | 'travel';
  currency: string;
  work_date: string;
}
export function validateHistoricalPersonnelRates(
  rates: readonly HistoricalPersonnelRate[],
  ctx: Pick<HistoricalRateBinding, 'organization_id' | 'worker_id'>,
): void {
  // A malformed or foreign rate is never silently ignored as if it were absent.
  for (const rate of rates) {
    if (
      rate.organization_id !== ctx.organization_id ||
      rate.worker_id !== ctx.worker_id ||
      !['work', 'travel'].includes(rate.category) || !currency(rate.currency) ||
      !text(rate.rate_revision) ||
      rate.rate_revision.length > 200 ||
      !int(rate.hourly_rate_minor) || !date(rate.effective_from) ||
      (rate.effective_to !== null &&
        (!date(rate.effective_to) || rate.effective_to <= rate.effective_from))
    ) fail('invalid_historical_rate');
  }
}
export function resolveHistoricalPersonnelRate(
  rates: readonly HistoricalPersonnelRate[],
  binding: HistoricalRateBinding,
): HistoricalPersonnelRate | undefined {
  if (!uuid(binding.organization_id) || !uuid(binding.worker_id) ||
      !['work', 'travel'].includes(binding.category) ||
      !currency(binding.currency) || !date(binding.work_date)) {
    fail('invalid_rate_binding');
  }
  validateHistoricalPersonnelRates(rates, binding);
  const matching = rates.filter((rate) =>
    rate.category === binding.category && rate.currency === binding.currency &&
    rate.effective_from <= binding.work_date &&
    (rate.effective_to === null || binding.work_date < rate.effective_to)
  );
  if (matching.length > 1) fail('ambiguous_historical_rate');
  return matching[0];
}
export async function calculatePersonnelCostSnapshot(
  snapshot: FrozenTimeSnapshot,
  ctx: PersonnelCalculationContext,
): Promise<PersonnelCostSnapshot> {
  await verifyFrozenTimeSnapshot(snapshot);
  if (
    ![
      ctx.organization_id,
      ctx.time_organization_id,
      ctx.time_auth_worker_id,
      ctx.worker_id,
      ctx.source_time_stream_id,
    ].every(text) ||
    ![
      ctx.organization_id,
      ctx.time_organization_id,
      ctx.time_auth_worker_id,
      ctx.worker_id,
    ].every(uuid) ||
    ctx.source_time_stream_id.length > 256 ||
    !int(ctx.source_revision, 1) ||
    !['preliminary', 'confirmed', 'rejected'].includes(
      ctx.project_review_status,
    )
  ) fail('invalid_context');
  if (
    snapshot.organizationId !== ctx.time_organization_id ||
    snapshot.workerId !== ctx.time_auth_worker_id
  ) fail('source_identity_mismatch');
  const allocations = new Map<string, ResolvedAllocation>();
  if (ctx.allocations.length > 1000) fail('too_many_allocations');
  for (const allocation of ctx.allocations) {
    if (
      !text(allocation.source_time_line_id) ||
      allocation.source_time_line_id.length > 256 ||
      allocations.has(allocation.source_time_line_id)
    ) fail('duplicate_allocation');
    if (
      allocation.organization_id !== ctx.organization_id ||
      !uuid(allocation.source_project_id) ||
      (allocation.source_booking_id !== null &&
        !uuid(allocation.source_booking_id)) ||
      !currency(allocation.currency)
    ) fail('invalid_allocation');
    targetKey(allocation.target);
    allocations.set(allocation.source_time_line_id, allocation);
  }
  validateHistoricalPersonnelRates(ctx.rates, ctx);
  const seen = new Set<string>();
  const used = new Set<string>();
  const lines: PersonnelCostLine[] = [];
  for (const block of snapshot.blocks) {
    if (!text(block.id) || seen.has(block.id)) fail('duplicate_time_block');
    seen.add(block.id);
    if (!int(block.durationMinutes)) fail('invalid_minutes');
    if (
      !['work', 'travel'].includes(block.kind) || block.durationMinutes === 0
    ) continue;
    const start = Date.parse(block.startsAt), end = Date.parse(block.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      fail('invalid_block_interval');
    }
    if (!block.target) fail('project_binding_missing');
    const allocation = allocations.get(block.id);
    if (!allocation) fail('project_binding_missing');
    if (targetKey(allocation.target) !== targetKey(block.target)) {
      fail('project_binding_mismatch');
    }
    // Time confirms exact target keys with its canonical ':' serialization.
    const confirmation = [
      block.target.sourceSystem,
      block.target.kind,
      block.target.externalId,
      block.target.version,
    ].join(':');
    if (
      block.requiresTargetConfirmation === true &&
      !snapshot.attestation.targetKeys.includes(confirmation)
    ) fail('target_confirmation_missing');
    used.add(block.id);
    const rate = resolveHistoricalPersonnelRate(ctx.rates, {
      organization_id: ctx.organization_id,
      worker_id: ctx.worker_id,
      category: block.kind as 'work' | 'travel',
      currency: allocation.currency,
      work_date: snapshot.workDate,
    });
    lines.push({
      source_time_line_id: block.id,
      source_project_id: allocation.source_project_id,
      source_booking_id: allocation.source_booking_id,
      minutes: block.durationMinutes,
      rate_revision: rate?.rate_revision ?? null,
      hourly_rate_minor: rate?.hourly_rate_minor ?? null,
      amount_minor: rate
        ? calculatePersonnelAmountMinor(
          block.durationMinutes,
          rate.hourly_rate_minor,
        )
        : null,
      currency: allocation.currency,
      status: ctx.project_review_status,
      coverage: rate ? 'complete' : 'missing_rate',
    });
  }
  if ([...allocations.keys()].some((id) => !used.has(id))) {
    fail('unexpected_allocation');
  }
  return {
    schema_version: PERSONNEL_COST_SCHEMA,
    organization_id: ctx.organization_id,
    source_time_stream_id: ctx.source_time_stream_id,
    source_time_report_id: snapshot.id,
    source_revision: ctx.source_revision,
    time_snapshot_version: snapshot.version,
    source_snapshot_hash: snapshot.snapshotHash,
    worker_id: ctx.worker_id,
    work_date: snapshot.workDate,
    calculation_version: PERSONNEL_CALCULATION_VERSION,
    lines: lines.sort((left, right) =>
      left.source_time_line_id.localeCompare(right.source_time_line_id)
    ),
  };
}
/** Attest is a new publication of SAVED calculation, never a new rate lookup. */
export function revisePersonnelCostReview(
  saved: PersonnelCostSnapshot,
  sourceRevision: number,
  status: PersonnelCostLine['status'],
): PersonnelCostSnapshot {
  if (!int(sourceRevision, 1) || sourceRevision <= saved.source_revision) {
    fail('stale_publication_revision');
  }
  if (!['preliminary', 'confirmed', 'rejected'].includes(status)) {
    fail('invalid_review_status');
  }
  return {
    ...saved,
    source_revision: sourceRevision,
    lines: saved.lines.map((line) => ({ ...line, status })),
  };
}
