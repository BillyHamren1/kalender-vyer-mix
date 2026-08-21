import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toDisplayResources, isLegacyLagerResourceId } from '@/lib/warehouse/warehouseCalendarDisplay';
import {
  buildWarehouseProductivityReadModel,
  formatBaselineMinutes,
  INSUFFICIENT_DATA_LABEL,
  type ProductivityObservation,
} from '@/lib/warehouse/productivity';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('warehouse clean integration', () => {
  it('removes the passive KPI counter strip from Lager OPS', () => {
    const ops = read('src/pages/WarehouseOps.tsx');
    expect(ops).not.toContain('obemannade');
    expect(ops).not.toContain('saknar tid');
    expect(ops).not.toContain('nya att planera');
    // Viewport-layouten (ingen långscroll) är kvar.
    expect(ops).toContain('h-full min-h-0 overflow-hidden');
    expect(ops).toContain('WarehouseOpsActionQueue');
  });

  it('hides legacy team numbering but keeps the technical ids', () => {
    const display = toDisplayResources([
      { id: 'lager-1', title: 'Lager 1', eventColor: '#000' },
      { id: 'lager-7', title: 'Lager 7', eventColor: '#000' },
      { id: 'warehouse-transport', title: 'Transport', eventColor: '#000' },
    ] as any);

    expect(display.map((r) => r.id)).toEqual(['lager-1', 'lager-7', 'warehouse-transport']);
    expect(display.map((r) => r.title)).toEqual(['Lager', 'Lager', 'Transport']);
    expect(display.some((r) => /Lager \d/.test(r.title))).toBe(false);
    expect(isLegacyLagerResourceId('lager-3')).toBe(true);
    expect(isLegacyLagerResourceId('warehouse-transport')).toBe(false);
  });

  it('offers Kalender and Personal as the two planning modes', () => {
    const page = read('src/pages/WarehouseCalendarPage.tsx');
    expect(page).toContain("useState<WarehousePlanningMode>('calendar')");
    expect(page).toContain('WarehousePersonnelView');
    expect(page).toContain('toDisplayResources');
  });

  it('builds the personnel view from concrete assignments, never from lager-N teams', () => {
    const hook = read('src/hooks/useWarehousePersonnelWeek.ts');
    expect(hook).toContain("from('warehouse_assignments')");
    expect(hook).not.toContain("from('staff_assignments')");
    expect(hook).not.toContain('lager-');
  });
});

describe('warehouse productivity read model', () => {
  const obs = (over: Partial<ProductivityObservation>): ProductivityObservation => ({
    id: Math.random().toString(36).slice(2),
    staffId: 'johan',
    activityType: 'packing',
    date: '2026-08-01',
    plannedMinutes: 60,
    actualMinutes: 60,
    ...over,
  });

  it('reports insufficient data instead of inventing a value', () => {
    const model = buildWarehouseProductivityReadModel([obs({}), obs({})]);
    expect(model.byActivity[0].confidence).toBe('none');
    expect(model.byActivity[0].medianActualMinutes).toBeNull();
    expect(formatBaselineMinutes(null)).toBe(INSUFFICIENT_DATA_LABEL);
  });

  it('never compares packing against returns', () => {
    const model = buildWarehouseProductivityReadModel([
      obs({ actualMinutes: 60 }),
      obs({ actualMinutes: 70 }),
      obs({ actualMinutes: 80 }),
      obs({ activityType: 'return', actualMinutes: 600 }),
      obs({ activityType: 'return', actualMinutes: 620 }),
      obs({ activityType: 'return', actualMinutes: 640 }),
    ]);
    const packing = model.byActivity.find((b) => b.activityType === 'packing')!;
    const ret = model.byActivity.find((b) => b.activityType === 'return')!;
    expect(packing.medianActualMinutes).toBe(70);
    expect(ret.medianActualMinutes).toBe(620);
  });

  it('computes deviation per person and activity without scoring people', () => {
    const model = buildWarehouseProductivityReadModel([
      obs({ staffId: 'a', actualMinutes: 100 }),
      obs({ staffId: 'a', actualMinutes: 100 }),
      obs({ staffId: 'a', actualMinutes: 100 }),
      obs({ staffId: 'b', actualMinutes: 50 }),
      obs({ staffId: 'b', actualMinutes: 50 }),
      obs({ staffId: 'b', actualMinutes: 50 }),
    ]);
    const a = model.byPersonAndActivity.find((p) => p.staffId === 'a')!;
    expect(a.deviationPercentVsActivity).not.toBeNull();
    expect(Object.keys(a)).not.toContain('score');
    expect(Object.keys(a)).not.toContain('ranking');
  });

  it('drops observations without actual time', () => {
    const model = buildWarehouseProductivityReadModel([obs({ actualMinutes: null })]);
    expect(model.totalObservations).toBe(1);
    expect(model.usableObservations).toBe(0);
  });
});
