import { describe, expect, it } from 'vitest';
import {
  calculatePersonnelAmountMinor,
  calculatePersonnelCostSnapshot,
  type FrozenTimeSnapshot,
  type PersonnelCalculationContext,
  revisePersonnelCostReview,
  verifyFrozenTimeSnapshot,
} from './project-personnel-cost.ts';

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
describe('Operations frozen Time calculation', () => {
  it('calculates 120 minutes × 300 SEK/h as 60000 minor units with source lineage', async () => {
    const snapshot = await fixture();
    const output = await calculatePersonnelCostSnapshot(snapshot, context());
    expect(output).toMatchObject({
      schema_version: 'operations-personnel-cost-v1',
      source_time_report_id: snapshot.id,
      source_revision: 1,
      time_snapshot_version: 1,
      source_snapshot_hash: snapshot.snapshotHash,
      worker_id: '44444444-4444-4444-8444-444444444444',
      lines: [{
        amount_minor: 60000,
        hourly_rate_minor: 30000,
        minutes: 120,
        status: 'preliminary',
      }],
    });
    expect(snapshot.workerId).toBe('33333333-3333-4333-8333-333333333333');
  });
  it('attests the saved cost without changing its historical rate or time hash', async () => {
    const saved = await calculatePersonnelCostSnapshot(
      await fixture(),
      context(),
    );
    const output = revisePersonnelCostReview(saved, 2, 'confirmed');
    expect(output.lines[0]).toEqual({ ...saved.lines[0], status: 'confirmed' });
    expect(output.time_snapshot_version).toBe(1);
    expect(output.source_snapshot_hash).toBe(saved.source_snapshot_hash);
    expect(saved.lines[0].status).toBe('preliminary');
    expect(() => revisePersonnelCostReview(saved, 1, 'confirmed')).toThrow(
      'stale_publication_revision',
    );
  });
  it('corrects to 90 minutes with changed immutable snapshot but same stream', async () => {
    const original = await fixture();
    const correction = await fixture({
      version: 2,
      blocks: [{
        ...original.blocks[0],
        durationMinutes: 90,
        endsAt: '2026-10-01T09:30:00Z',
      }],
    });
    const output = await calculatePersonnelCostSnapshot(correction, {
      ...context(),
      source_revision: 3,
    });
    expect(output.lines[0].amount_minor).toBe(45000);
    expect(output.source_time_stream_id).toBe(context().source_time_stream_id);
    expect(output.source_time_report_id).not.toBe(original.id);
    expect(output.time_snapshot_version).toBe(2);
    expect(output.source_revision).toBe(3);
  });
  it('publishes empty corrected stream to remove allocations, without inventing a line', async () => {
    const correction = await fixture({ version: 2, blocks: [] });
    expect(
      (await calculatePersonnelCostSnapshot(correction, {
        ...context(),
        source_revision: 3,
        allocations: [],
      })).lines,
    ).toEqual([]);
  });
  it('preserves missing rate as null while preserving minutes and source status', async () => {
    const output = await calculatePersonnelCostSnapshot(await fixture(), {
      ...context(),
      rates: [],
    });
    expect(output.lines[0]).toMatchObject({
      minutes: 120,
      rate_revision: null,
      hourly_rate_minor: null,
      amount_minor: null,
      coverage: 'missing_rate',
      status: 'preliminary',
    });
  });
  it('recognizes explicitly configured zero cost as different from missing rate', async () => {
    const ctx = context();
    const output = await calculatePersonnelCostSnapshot(await fixture(), {
      ...ctx,
      rates: [{ ...ctx.rates[0], hourly_rate_minor: 0 }],
    });
    expect(output.lines[0]).toMatchObject({
      amount_minor: 0,
      coverage: 'complete',
      rate_revision: 'rate-v1',
    });
  });
  it('uses work-date historical rate rather than a later changed rate', async () => {
    const ctx = context();
    const output = await calculatePersonnelCostSnapshot(await fixture(), {
      ...ctx,
      rates: [
        { ...ctx.rates[0], effective_to: '2026-10-02' },
        {
          ...ctx.rates[0],
          rate_revision: 'rate-v2',
          effective_from: '2026-10-02',
          hourly_rate_minor: 90000,
        },
      ],
    });
    expect(output.lines[0].amount_minor).toBe(60000);
    expect(output.lines[0].rate_revision).toBe('rate-v1');
  });
  it('fails closed on overlapping historical rates', async () => {
    const ctx = context();
    await expect(
      calculatePersonnelCostSnapshot(await fixture(), {
        ...ctx,
        rates: [ctx.rates[0], { ...ctx.rates[0], rate_revision: 'overlap' }],
      }),
    ).rejects.toThrow('ambiguous_historical_rate');
  });
  it('fails closed on corrupted source snapshot and source id', async () => {
    const snapshot = await fixture();
    await expect(verifyFrozenTimeSnapshot({ ...snapshot, version: 2 })).rejects
      .toThrow('snapshot_hash_mismatch');
    await expect(verifyFrozenTimeSnapshot({ ...snapshot, id: 'other' })).rejects
      .toThrow('snapshot_id_mismatch');
  });
  it('cannot confuse Time auth worker, Operations profile and 88888888-8888-4888-8888-888888888888 tenant', async () => {
    const snapshot = await fixture();
    await expect(
      calculatePersonnelCostSnapshot(snapshot, {
        ...context(),
        time_auth_worker_id: '44444444-4444-4444-8444-444444444444',
      }),
    )
      .rejects.toThrow('source_identity_mismatch');
    await expect(
      calculatePersonnelCostSnapshot(snapshot, {
        ...context(),
        time_organization_id: '88888888-8888-4888-8888-888888888888',
      }),
    )
      .rejects.toThrow('source_identity_mismatch');
    const ctx = context();
    await expect(
      calculatePersonnelCostSnapshot(snapshot, {
        ...ctx,
        rates: [{
          ...ctx.rates[0],
          organization_id: '88888888-8888-4888-8888-888888888888',
        }],
      }),
    )
      .rejects.toThrow('invalid_historical_rate');
    await expect(
      calculatePersonnelCostSnapshot(snapshot, {
        ...ctx,
        allocations: [{
          ...ctx.allocations[0],
          organization_id: '88888888-8888-4888-8888-888888888888',
        }],
      }),
    )
      .rejects.toThrow('invalid_allocation');
  });
  it('never guesses the project and rejects explicit target/version mismatch', async () => {
    const snapshot = await fixture();
    await expect(
      calculatePersonnelCostSnapshot(snapshot, {
        ...context(),
        allocations: [],
      }),
    ).rejects.toThrow('project_binding_missing');
    const ctx = context();
    await expect(
      calculatePersonnelCostSnapshot(snapshot, {
        ...ctx,
        allocations: [{
          ...ctx.allocations[0],
          target: { ...target, version: 'v2' },
        }],
      }),
    )
      .rejects.toThrow('project_binding_mismatch');
  });
  it('rejects duplicate block identity instead of charging twice', async () => {
    const snapshot = await fixture();
    const duplicated = await fixture({
      blocks: [snapshot.blocks[0], snapshot.blocks[0]],
    });
    await expect(calculatePersonnelCostSnapshot(duplicated, context())).rejects
      .toThrow('duplicate_time_block');
  });
  it('calculates travel only with its own rate and excludes breaks', async () => {
    const snapshot = await fixture();
    const ctx = context();
    const revised = await fixture({
      blocks: [snapshot.blocks[0], {
        ...snapshot.blocks[0],
        id: 'travel',
        kind: 'travel',
        durationMinutes: 30,
      }, {
        ...snapshot.blocks[0],
        id: 'break',
        kind: 'break',
        durationMinutes: 30,
      }],
    });
    const output = await calculatePersonnelCostSnapshot(revised, {
      ...ctx,
      allocations: [...ctx.allocations, {
        ...ctx.allocations[0],
        source_time_line_id: 'travel',
      }],
    });
    expect(output.lines).toHaveLength(2);
    expect(output.lines.find((line) => line.source_time_line_id === 'travel'))
      .toMatchObject({
        amount_minor: null,
        coverage: 'missing_rate',
        minutes: 30,
      });
  });
  it('accepts two exact bookings within one project without merging distinct allocations', async () => {
    const snapshot = await fixture();
    const ctx = context();
    const revised = await fixture({
      blocks: [snapshot.blocks[0], {
        ...snapshot.blocks[0],
        id: 'line-b',
        durationMinutes: 30,
      }],
    });
    const output = await calculatePersonnelCostSnapshot(revised, {
      ...ctx,
      allocations: [ctx.allocations[0], {
        ...ctx.allocations[0],
        source_time_line_id: 'line-b',
        source_booking_id: '77777777-7777-4777-8777-777777777777',
      }],
    });
    expect(output.lines.map((line) => line.source_booking_id)).toEqual([
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
    ]);
    expect(output.lines.reduce((sum, line) => sum + line.amount_minor!, 0))
      .toBe(75000);
  });
  it('rejects invented calendar dates and negative/fractional minutes', async () => {
    await expect(
      calculatePersonnelCostSnapshot(
        await fixture({ workDate: '2026-02-30' }),
        context(),
      ),
    ).rejects.toThrow('invalid_frozen_snapshot');
    const snapshot = await fixture();
    for (const minutes of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        calculatePersonnelCostSnapshot(
          await fixture({
            blocks: [{ ...snapshot.blocks[0], durationMinutes: minutes }],
          }),
          context(),
        ),
      )
        .rejects.toThrow('invalid_minutes');
    }
  });
  it('matches positive half-up rounding and refuses unsafe amounts', () => {
    expect(calculatePersonnelAmountMinor(1, 30)).toBe(1);
    expect(calculatePersonnelAmountMinor(1, 29)).toBe(0);
    expect(calculatePersonnelAmountMinor(120, 30000)).toBe(60000);
    expect(() => calculatePersonnelAmountMinor(Number.MAX_SAFE_INTEGER, 120))
      .toThrow('amount_overflow');
  });
});
