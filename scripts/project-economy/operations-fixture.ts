import {
  calculatePersonnelCostSnapshot,
  type FrozenTimeSnapshot,
  type PersonnelCalculationContext,
  revisePersonnelCostReview,
} from '../../supabase/functions/_shared/project-personnel-cost.ts';
const target = {
  sourceSystem: 'planning',
  kind: 'project',
  externalId: '55555555-5555-4555-8555-555555555555',
  version: 'binding-v1',
};
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined).sort(([a], [b]) =>
          a.localeCompare(b)
        )
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};
export async function fixture(
  changes: Record<string, unknown> = {},
): Promise<FrozenTimeSnapshot> {
  const unsigned = {
    schemaVersion: 'day-submission.v1',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workerId: '33333333-3333-4333-8333-333333333333',
    workDate: '2026-10-01',
    timezone: 'Europe/Stockholm',
    version: 1,
    status: 'submitted',
    syncState: 'synced',
    attestation: {
      confirmedByWorker: true,
      targetKeys: [
        'planning:project:55555555-5555-4555-8555-555555555555:binding-v1',
      ],
    },
    blocks: [{
      id: 'line-a',
      kind: 'work',
      durationMinutes: 120,
      startsAt: '2026-10-01T08:00:00Z',
      endsAt: '2026-10-01T10:00:00Z',
      target,
      requiresTargetConfirmation: true,
    }],
    ...changes,
  };
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(canonicalize(unsigned))),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    ...unsigned,
    snapshotHash: hash,
    id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${
      hash.slice(17, 20)
    }-${hash.slice(20, 32)}`,
  } as FrozenTimeSnapshot;
}
export function context(): PersonnelCalculationContext {
  return {
    organization_id: '11111111-1111-4111-8111-111111111111',
    time_organization_id: '22222222-2222-4222-8222-222222222222',
    time_auth_worker_id: '33333333-3333-4333-8333-333333333333',
    worker_id: '44444444-4444-4444-8444-444444444444',
    source_time_stream_id: '44444444-4444-4444-8444-444444444444:2026-10-01',
    source_revision: 1,
    project_review_status: 'preliminary',
    allocations: [{
      organization_id: '11111111-1111-4111-8111-111111111111',
      source_time_line_id: 'line-a',
      target,
      source_project_id: '55555555-5555-4555-8555-555555555555',
      source_booking_id: '66666666-6666-4666-8666-666666666666',
      currency: 'SEK',
    }],
    rates: [{
      organization_id: '11111111-1111-4111-8111-111111111111',
      worker_id: '44444444-4444-4444-8444-444444444444',
      category: 'work',
      currency: 'SEK',
      rate_revision: 'rate-v1',
      hourly_rate_minor: 30000,
      effective_from: '2026-01-01',
      effective_to: null,
    }],
  };
}

const raw = await fixture();
const initial = await calculatePersonnelCostSnapshot(raw, context());
const confirmed = revisePersonnelCostReview(initial, 2, 'confirmed');
const rawCorrection = await fixture({
  version: 2,
  blocks: [{
    ...raw.blocks[0],
    durationMinutes: 90,
    endsAt: '2026-10-01T09:30:00Z',
  }],
});
const corrected = await calculatePersonnelCostSnapshot(rawCorrection, {
  ...context(),
  source_revision: 3,
});
const rawEmpty = await fixture({ version: 3, blocks: [] });
const empty = await calculatePersonnelCostSnapshot(rawEmpty, {
  ...context(),
  source_revision: 4,
  allocations: [],
});
console.log(
  JSON.stringify({
    raw,
    initial,
    confirmed,
    rawCorrection,
    corrected,
    rawEmpty,
    empty,
  }),
);
