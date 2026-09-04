/**
 * Contract tests for the Planning-side `work-order.v1` emitter guard
 * (`supabase/functions/_shared/time-v2/workOrderV1.ts`).
 *
 * Locks: allowed sections/keys, forbidden cost/price/internal terms,
 * explicit-offset timestamps, empty-section omission and the DST-safe
 * Europe/Stockholm conversion used for rig/event/derig phases.
 */
import { describe, expect, it } from 'vitest';
import {
  assertWorkOrderV1,
  isHttpsUrl,
  toStockholmOffsetIso,
  WORK_ORDER_FORBIDDEN_KEY_TERMS,
  WORK_ORDER_PHASE_KINDS,
  WORK_ORDER_SCHEMA,
  WORK_ORDER_V1_KEYS,
} from '../../../../supabase/functions/_shared/time-v2/workOrderV1';

const valid = () => ({
  phases: [
    { kind: 'rig', startsAt: '2026-06-04T07:00:00+02:00', endsAt: '2026-06-04T17:00:00+02:00' },
    { kind: 'derig', startsAt: '2026-06-07T08:00:00+02:00', endsAt: '2026-06-07T12:00:00+02:00' },
  ],
  lines: [
    { lineId: 'p1', kind: 'package', label: 'H Mastertent - 3x3 (#1)', quantity: 1 },
    { lineId: 'c1', kind: 'product', label: 'H Mastertent - Takduk 3x3', quantity: 1, parentLineId: 'p1', note: 'Vit' },
  ],
  instructions: [{ instructionId: 'carry_more_than_10m', label: 'Bär mer än 10 m' }],
  tasks: [{ taskId: 't1', label: 'Kolla el', phase: 'rig' as const }],
  files: [{ fileId: 'f1', kind: 'document', label: 'plan.pdf', url: 'https://files.example.com/plan.pdf', mimeType: 'application/pdf' }],
  team: [{ memberId: 's1', displayName: 'Anna Ek', roleLabel: 'Tekniker' }],
  contacts: [{ contactId: 'c1', role: 'Leveranskontakt', displayName: 'Kund Kundsson', phone: '+46700000000' }],
});

describe('work-order.v1 — Planning emitter guard', () => {
  it('pins the schema id and exact key sets', () => {
    expect(WORK_ORDER_SCHEMA).toBe('work-order.v1');
    expect(WORK_ORDER_V1_KEYS.root).toEqual(['phases', 'lines', 'instructions', 'tasks', 'files', 'team', 'contacts']);
    expect(WORK_ORDER_V1_KEYS.phase).toEqual(['kind', 'startsAt', 'endsAt']);
    expect(WORK_ORDER_V1_KEYS.line).toEqual(['lineId', 'kind', 'label', 'quantity', 'unit', 'note', 'parentLineId']);
    expect(WORK_ORDER_V1_KEYS.instruction).toEqual(['instructionId', 'label', 'body']);
    expect(WORK_ORDER_V1_KEYS.task).toEqual(['taskId', 'label', 'note', 'phase']);
    expect(WORK_ORDER_V1_KEYS.file).toEqual(['fileId', 'kind', 'label', 'url', 'thumbnailUrl', 'mimeType']);
    expect(WORK_ORDER_V1_KEYS.teamMember).toEqual(['memberId', 'displayName', 'roleLabel']);
    expect(WORK_ORDER_V1_KEYS.contact).toEqual(['contactId', 'role', 'displayName', 'phone']);
    expect(WORK_ORDER_PHASE_KINDS).toEqual(['rig', 'event', 'derig']);
  });

  it('accepts a complete, well-formed work order', () => {
    expect(() => assertWorkOrderV1(valid())).not.toThrow();
  });

  it('rejects unknown fields at every level (Time parser is strict)', () => {
    expect(() => assertWorkOrderV1({ ...valid(), extra: 1 })).toThrow(/unexpected field/);
    expect(() => assertWorkOrderV1({ lines: [{ ...valid().lines[0], sku: 'X' }] })).toThrow(/unexpected field/);
    expect(() => assertWorkOrderV1({ phases: [{ ...valid().phases[0], label: 'Rigg' }] })).toThrow(/unexpected field/);
  });

  it('rejects cost / price / margin / internal-note terms wherever they appear', () => {
    for (const term of ['unitPrice', 'total_cost', 'margin', 'internalnotes', 'economics', 'discount', 'vat_rate']) {
      expect(() => assertWorkOrderV1({ lines: [{ ...valid().lines[0], [term]: 1 }] })).toThrow(/forbidden|unexpected/);
    }
    expect(WORK_ORDER_FORBIDDEN_KEY_TERMS).toContain('price');
    expect(WORK_ORDER_FORBIDDEN_KEY_TERMS).toContain('internalnotes');
  });

  it('requires explicit offsets on phase timestamps and start < end', () => {
    expect(() => assertWorkOrderV1({ phases: [{ kind: 'rig', startsAt: '2026-06-04T07:00:00Z', endsAt: '2026-06-04T17:00:00+02:00' }] }))
      .toThrow(/explicit offset/);
    expect(() => assertWorkOrderV1({ phases: [{ kind: 'rig', startsAt: '2026-06-04T07:00:00', endsAt: '2026-06-04T17:00:00' }] }))
      .toThrow(/explicit offset/);
    expect(() => assertWorkOrderV1({ phases: [{ kind: 'rig', startsAt: '2026-06-04T17:00:00+02:00', endsAt: '2026-06-04T07:00:00+02:00' }] }))
      .toThrow(/before endsAt/);
    expect(() => assertWorkOrderV1({ phases: [{ kind: 'teardown', startsAt: '2026-06-04T07:00:00+02:00', endsAt: '2026-06-04T17:00:00+02:00' }] }))
      .toThrow(/kind: invalid/);
  });

  it('forbids empty sections and empty work orders (omit instead of fabricating)', () => {
    expect(() => assertWorkOrderV1({})).toThrow(/empty work order/);
    expect(() => assertWorkOrderV1({ lines: [] })).toThrow(/empty sections must be omitted/);
    expect(() => assertWorkOrderV1({ instructions: [{ instructionId: 'a', label: '' }] })).toThrow(/non-empty string/);
  });

  it('requires parentLineId to reference a sibling line and unique ids', () => {
    expect(() => assertWorkOrderV1({ lines: [{ lineId: 'c1', kind: 'product', label: 'X', quantity: 1, parentLineId: 'ghost' }] }))
      .toThrow(/does not reference a line/);
    expect(() => assertWorkOrderV1({ lines: [{ lineId: 'a', kind: 'product', label: 'X', quantity: 1 }, { lineId: 'a', kind: 'product', label: 'Y', quantity: 2 }] }))
      .toThrow(/duplicate/);
  });

  it('only accepts real https file URLs', () => {
    expect(isHttpsUrl('https://x.example.com/a.png')).toBe(true);
    expect(isHttpsUrl('http://x.example.com/a.png')).toBe(false);
    expect(isHttpsUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isHttpsUrl('/relative/file.pdf')).toBe(false);
    expect(() => assertWorkOrderV1({ files: [{ fileId: 'f1', kind: 'document', label: 'a.pdf', url: 'http://x.example.com/a.pdf' }] })).toThrow(/https/);
  });
});

describe('work-order.v1 — Europe/Stockholm offset conversion', () => {
  it('keeps the instant and expresses it with the CEST offset in summer', () => {
    // Planning stores timestamptz; PostgREST emits UTC ISO. 05:00Z == 07:00+02:00 on 2026-06-04.
    expect(toStockholmOffsetIso('2026-06-04T05:00:00+00:00')).toBe('2026-06-04T07:00:00+02:00');
    expect(toStockholmOffsetIso('2026-06-04T05:00:00Z')).toBe('2026-06-04T07:00:00+02:00');
  });

  it('uses the CET offset in winter (DST-safe)', () => {
    expect(toStockholmOffsetIso('2026-01-15T06:00:00Z')).toBe('2026-01-15T07:00:00+01:00');
  });

  it('is stable across the DST switch day', () => {
    // 2026-03-29 01:00Z is before the 01:00Z switch → still +01:00; 02:00Z after → +02:00.
    expect(toStockholmOffsetIso('2026-03-29T00:30:00Z')).toBe('2026-03-29T01:30:00+01:00');
    expect(toStockholmOffsetIso('2026-03-29T02:30:00Z')).toBe('2026-03-29T04:30:00+02:00');
  });

  it('never invents a time from garbage', () => {
    expect(toStockholmOffsetIso(null)).toBeNull();
    expect(toStockholmOffsetIso('')).toBeNull();
    expect(toStockholmOffsetIso('not-a-date')).toBeNull();
    expect(toStockholmOffsetIso(42)).toBeNull();
  });
});
