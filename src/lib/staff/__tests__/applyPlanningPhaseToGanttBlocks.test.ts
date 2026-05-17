// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  applyPlanningPhaseToGanttBlocks,
  normalizeCalendarPhase,
} from '@/lib/staff/ganttPhaseColor';

const baseBlock = {
  startAt: '2026-05-17T08:00:00Z',
  endAt: '2026-05-17T10:00:00Z',
  title: 'Projektarbete — Westmans',
  subtitle: null,
};

describe('normalizeCalendarPhase', () => {
  it('rig/event/rigdown passerar', () => {
    expect(normalizeCalendarPhase('rig')).toBe('rig');
    expect(normalizeCalendarPhase('event')).toBe('event');
    expect(normalizeCalendarPhase('rigdown')).toBe('rigdown');
  });
  it('camelCase + snake_case + nedrigg mappar till rigdown', () => {
    expect(normalizeCalendarPhase('rigDown')).toBe('rigdown');
    expect(normalizeCalendarPhase('rig_down')).toBe('rigdown');
    expect(normalizeCalendarPhase('nedrigg')).toBe('rigdown');
    expect(normalizeCalendarPhase('Rig Ner')).toBe('rigdown');
  });
  it('okänd → null', () => {
    expect(normalizeCalendarPhase('meeting')).toBeNull();
    expect(normalizeCalendarPhase(null)).toBeNull();
  });
});

describe('applyPlanningPhaseToGanttBlocks', () => {
  it('A. booking + rig → kind=rig', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'b1', kind: 'work', targetType: 'booking', targetId: 'B1', ...baseBlock }],
      { B1: 'rig' },
      {},
    );
    expect(out[0].kind).toBe('rig');
  });

  it('B. booking + rigdown (via normalize från rigDown) → kind=rigdown', () => {
    const phase = normalizeCalendarPhase('rigDown')!;
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'b1', kind: 'work', targetType: 'booking', targetId: 'B1', ...baseBlock }],
      { B1: phase },
      {},
    );
    expect(out[0].kind).toBe('rigdown');
  });

  it('C. large_project + rig → kind=rig', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'b1', kind: 'work', targetType: 'large_project', targetId: 'LP1', ...baseBlock }],
      {},
      { LP1: 'rig' },
    );
    expect(out[0].kind).toBe('rig');
  });

  it('C2. project-targetType med large_project_id → kind=rig', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'b1', kind: 'work', targetType: 'project', targetId: 'LP1', ...baseBlock }],
      {},
      { LP1: 'rig' },
    );
    expect(out[0].kind).toBe('rig');
  });

  it('D. title-fallback med bokningsnummer', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'b1', kind: 'work', targetType: null, targetId: null,
         title: 'Bokning — #2603-35R1 Westmans', subtitle: null,
         startAt: baseBlock.startAt, endAt: baseBlock.endAt }],
      { '2603-35R1': 'rigdown' },
      {},
    );
    expect(out[0].kind).toBe('rigdown');
  });

  it('E. warehouse rörs aldrig', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'w1', kind: 'warehouse', targetType: 'booking', targetId: 'B1', ...baseBlock }],
      { B1: 'rig' },
      {},
    );
    expect(out[0].kind).toBe('warehouse');
  });

  it('F. transport rörs aldrig', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 't1', kind: 'transport', targetType: 'booking', targetId: 'B1', ...baseBlock }],
      { B1: 'rig' },
      {},
    );
    expect(out[0].kind).toBe('transport');
  });

  it('G. review rörs aldrig', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'r1', kind: 'review', targetType: 'booking', targetId: 'B1', ...baseBlock }],
      { B1: 'rig' },
      {},
    );
    expect(out[0].kind).toBe('review');
  });

  it('H. metadata.businessContextResolution fallback', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{
        id: 'b1', kind: 'work', targetType: null, targetId: null,
        title: 'Arbete', subtitle: null,
        startAt: baseBlock.startAt, endAt: baseBlock.endAt,
        meta: { businessContextResolution: { selectedTargetType: 'booking', selectedTargetId: 'B1' } },
      }],
      { B1: 'rig' },
      {},
    );
    expect(out[0].kind).toBe('rig');
  });

  it('I. session inheritance — rig smittar work-syskon på samma booking', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [
        { id: 'a', kind: 'work', targetType: 'booking', targetId: 'B1',
          title: 'A', subtitle: null,
          startAt: '2026-05-17T08:00:00Z', endAt: '2026-05-17T09:00:00Z' },
        { id: 'b', kind: 'work', targetType: 'booking', targetId: 'B1',
          title: 'B', subtitle: null,
          startAt: '2026-05-17T10:00:00Z', endAt: '2026-05-17T11:00:00Z' },
      ],
      { B1: 'rig' },
      {},
    );
    expect(out[0].kind).toBe('rig');
    expect(out[1].kind).toBe('rig');
  });

  it('J. event → work (lämnar normal arbetsfärg)', () => {
    const out = applyPlanningPhaseToGanttBlocks(
      [{ id: 'b1', kind: 'work', targetType: 'booking', targetId: 'B1', ...baseBlock }],
      { B1: 'event' },
      {},
    );
    expect(out[0].kind).toBe('work');
  });
});
