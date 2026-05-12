// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  resolveGanttPhaseKind,
  buildLargeProjectPhaseMap,
} from '@/lib/staff/ganttPhaseColor';

describe('resolveGanttPhaseKind', () => {
  it('booking + rig → rig', () => {
    expect(
      resolveGanttPhaseKind({
        targetType: 'booking',
        targetId: 'b1',
        bookingPhaseByDate: { b1: 'rig' },
      }),
    ).toBe('rig');
  });

  it('booking + event → work', () => {
    expect(
      resolveGanttPhaseKind({
        targetType: 'booking',
        targetId: 'b1',
        bookingPhaseByDate: { b1: 'event' },
      }),
    ).toBe('work');
  });

  it('large_project + rig via largeProjectPhaseByDate → rig', () => {
    expect(
      resolveGanttPhaseKind({
        targetType: 'large_project',
        targetId: 'lp1',
        largeProjectPhaseByDate: { lp1: 'rig' },
      }),
    ).toBe('rig');
  });

  it('project (kopplat till stort projekt) + rigdown → rigdown', () => {
    expect(
      resolveGanttPhaseKind({
        targetType: 'project',
        targetId: 'lp1',
        largeProjectPhaseByDate: { lp1: 'rigdown' },
      }),
    ).toBe('rigdown');
  });

  it('utan match → null', () => {
    expect(
      resolveGanttPhaseKind({
        targetType: 'booking',
        targetId: 'b1',
        bookingPhaseByDate: {},
      }),
    ).toBeNull();
  });
});

describe('buildLargeProjectPhaseMap', () => {
  it('prioriterar rig > rigdown > event vid kollision på samma large_project', () => {
    const map = buildLargeProjectPhaseMap(
      { b1: 'event', b2: 'rig', b3: 'rigdown' },
      { b1: 'lp1', b2: 'lp1', b3: 'lp1' },
    );
    expect(map).toEqual({ lp1: 'rig' });
  });

  it('hoppar över bookings utan large_project_id', () => {
    const map = buildLargeProjectPhaseMap(
      { b1: 'rig', b2: 'event' },
      { b1: null, b2: 'lp2' },
    );
    expect(map).toEqual({ lp2: 'event' });
  });
});
