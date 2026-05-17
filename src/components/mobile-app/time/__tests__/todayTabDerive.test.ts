import { describe, it, expect } from 'vitest';
import { deriveEffectiveSnapshot } from '../TodayTab';
import type { StaffDaySnapshot } from '@/hooks/useStaffDaySnapshot';

const base = (overrides: Partial<StaffDaySnapshot>): StaffDaySnapshot => ({
  date: '2026-05-17',
  workday: null,
  totals: {} as any,
  segments: [],
  actionsNeeded: [],
  ...overrides,
} as any);

describe('deriveEffectiveSnapshot', () => {
  it('Billy: pågående projektblock utan workday → workdayOpen=true, startedAt=blockets start', () => {
    const snap = base({
      workday: null,
      segments: [
        { kind: 'project', label: 'Westmans', startedAt: '2026-05-17T09:56:00Z', endedAt: null, isActive: true } as any,
      ],
    });
    const eff = deriveEffectiveSnapshot(snap);
    expect(eff.workday?.isOpen).toBe(true);
    expect(eff.workday?.startedAt).toBe('2026-05-17T09:56:00Z');
  });

  it('Tom dag: inget aktivt block, ingen workday → workday förblir null', () => {
    const snap = base({ workday: null, segments: [] });
    const eff = deriveEffectiveSnapshot(snap);
    expect(eff.workday?.isOpen).toBeFalsy();
  });

  it('Workday redan öppen: returnerar snapshot orört', () => {
    const snap = base({
      workday: { isOpen: true, startedAt: '2026-05-17T08:00:00Z', endedAt: null } as any,
      segments: [],
    });
    const eff = deriveEffectiveSnapshot(snap);
    expect(eff).toBe(snap);
  });

  it('Flera aktiva block: använder tidigaste startedAt', () => {
    const snap = base({
      workday: null,
      segments: [
        { kind: 'project', startedAt: '2026-05-17T10:30:00Z', endedAt: null, isActive: true } as any,
        { kind: 'warehouse', startedAt: '2026-05-17T09:56:00Z', endedAt: null, isActive: true } as any,
      ],
    });
    const eff = deriveEffectiveSnapshot(snap);
    expect(eff.workday?.startedAt).toBe('2026-05-17T09:56:00Z');
  });
});
