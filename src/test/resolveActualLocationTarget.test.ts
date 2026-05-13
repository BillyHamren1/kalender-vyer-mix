import { describe, it, expect } from 'vitest';
import {
  resolveActualLocationTargetForBlock,
  type ActualLocationResolutionInput,
} from '@/lib/staff/resolveActualLocationTarget';
import type { GanttBlockInputExtended } from '@/lib/staff/resolveGanttBlockTitle';

const baseBlock = (overrides: Partial<GanttBlockInputExtended> = {}): GanttBlockInputExtended => ({
  id: 'b1',
  kind: 'work',
  startAt: '2026-05-13T08:00:00Z',
  endAt: '2026-05-13T14:00:00Z',
  durationMinutes: 360,
  title: '',
  confidence: 'medium',
  reviewState: 'ok',
  ...overrides,
});

const run = (input: Partial<ActualLocationResolutionInput> & { block: GanttBlockInputExtended }) =>
  resolveActualLocationTargetForBlock({
    plannedLabels: [],
    hasDayEvidence: true,
    ...input,
  });

describe('resolveActualLocationTargetForBlock — geo-first label authority', () => {
  it('engine has projectName → engine wins, no planning override', () => {
    const r = run({
      block: baseBlock({ projectName: 'FA Warehouse' }),
      plannedLabels: ['Kaggeholms slott'],
    });
    expect(r.finalTitle).toBe('FA Warehouse');
    expect(r.source).toBe('engine_target');
    expect(r.plannedBadgeLabel).toBe('Kaggeholms slott');
    expect(r.diagnostics.ignoredPlanningBecauseGeoDisagreed).toBe(true);
  });

  it('engine has largeProjectName → source = large_project_promoted', () => {
    const r = run({
      block: baseBlock({ largeProjectName: 'Swedish Game Fair' }),
      plannedLabels: ['Swedish Game Fair'],
    });
    expect(r.finalTitle).toBe('Swedish Game Fair');
    expect(r.source).toBe('large_project_promoted');
    expect(r.plannedBadgeLabel).toBeNull(); // matches → no badge
  });

  it('engine target with bookingName matches planning → no badge', () => {
    const r = run({
      block: baseBlock({ bookingName: 'LOGOSOL' }),
      plannedLabels: ['LOGOSOL'],
    });
    expect(r.finalTitle).toBe('LOGOSOL');
    expect(r.plannedBadgeLabel).toBeNull();
    expect(r.diagnostics.ignoredPlanningBecauseGeoDisagreed).toBe(false);
  });

  it('engine unknown work + planning + day has GPS evidence → keep "Arbete – okänd plats", planning as badge only', () => {
    const r = run({
      block: baseBlock({ kind: 'work', title: 'Arbete' }),
      plannedLabels: ['Kaggeholms slott'],
      hasDayEvidence: true,
    });
    expect(r.finalTitle).toBe('Arbete – okänd plats');
    expect(r.source).toBe('unknown');
    expect(r.plannedBadgeLabel).toBe('Kaggeholms slott');
    expect(r.diagnostics.usedPlanningAsBadgeOnly).toBe(true);
    expect(r.diagnostics.usedPlanningAsFallback).toBe(false);
  });

  it('engine unknown + NO day evidence + planning → planning_fallback title', () => {
    const r = run({
      block: baseBlock({ kind: 'work' }),
      plannedLabels: ['Kaggeholms slott'],
      hasDayEvidence: false,
    });
    expect(r.finalTitle).toBe('Kaggeholms slott');
    expect(r.source).toBe('planning_fallback');
    expect(r.plannedBadgeLabel).toBeNull();
    expect(r.diagnostics.usedPlanningAsFallback).toBe(true);
  });

  it('engine kind=unknown + day evidence + planning → stays "Okänd plats", badge only', () => {
    const r = run({
      block: baseBlock({ kind: 'unknown' }),
      plannedLabels: ['Kaggeholms slott'],
      hasDayEvidence: true,
    });
    expect(r.finalTitle).toBe('Okänd plats');
    expect(r.plannedBadgeLabel).toBe('Kaggeholms slott');
    expect(r.diagnostics.usedPlanningAsBadgeOnly).toBe(true);
  });

  it('multiple plannedLabels → no unique tie-breaker, no badge from planning', () => {
    const r = run({
      block: baseBlock({ kind: 'work' }),
      plannedLabels: ['Kaggeholms slott', 'LOGOSOL'],
      hasDayEvidence: true,
    });
    expect(r.finalTitle).toBe('Arbete – okänd plats');
    expect(r.plannedBadgeLabel).toBeNull();
  });

  it('transport block — planning never used as title or badge', () => {
    const r = run({
      block: baseBlock({ kind: 'transport' }),
      plannedLabels: ['Kaggeholms slott'],
      hasDayEvidence: true,
    });
    expect(r.finalTitle).toBe('Resa');
    expect(r.plannedBadgeLabel).toBeNull();
  });

  it('engine resolved warehouse → planning project shown as badge (geo wins)', () => {
    const r = run({
      block: baseBlock({ warehouseName: 'FA Warehouse' }),
      plannedLabels: ['Kaggeholms slott'],
      hasDayEvidence: true,
    });
    expect(r.finalTitle).toBe('FA Warehouse');
    expect(r.plannedBadgeLabel).toBe('Kaggeholms slott');
    expect(r.diagnostics.ignoredPlanningBecauseGeoDisagreed).toBe(true);
  });

  it('targetLabel set with non-generic name counts as engine target', () => {
    const r = run({
      block: baseBlock({
        targetType: 'project',
        targetId: 'p1',
        targetLabel: 'Bergman Event AB',
      }),
      plannedLabels: ['Annat Projekt'],
    });
    expect(r.finalTitle).toBe('Bergman Event AB');
    expect(r.source).toBe('engine_target');
    expect(r.plannedBadgeLabel).toBe('Annat Projekt');
  });

  it('generic targetLabel "Signal saknas" is NOT engine target → falls through', () => {
    const r = run({
      block: baseBlock({
        targetType: 'project',
        targetId: 'p1',
        targetLabel: 'Signal saknas',
      }),
      plannedLabels: ['Bergman Event AB'],
      hasDayEvidence: true,
    });
    // Engine considered unresolved → planning shown as badge, title stays unknown
    expect(r.finalTitle).toBe('Arbete – okänd plats');
    expect(r.plannedBadgeLabel).toBe('Bergman Event AB');
  });
});
