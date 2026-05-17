import { describe, expect, it } from 'vitest';
import {
  GANTT_HEADER_PX,
  GANTT_NAME_COL_PX,
  GANTT_ROW_PX,
  getGanttEvidenceBarStyle,
  getGanttLaneMetrics,
  shouldShowCompactBlockBadge,
  shouldShowCompactBlockTime,
} from '@/lib/staff/ganttCompactLayout';

describe('gantt compact layout contract', () => {
  it('halverar radhöjden till kompakt läge', () => {
    expect(GANTT_ROW_PX).toBe(48);
    expect(GANTT_HEADER_PX).toBe(44);
    expect(GANTT_NAME_COL_PX).toBe(220);
  });

  it('behåller användbara lane-mått även med flera överlapp', () => {
    const metrics = getGanttLaneMetrics(3);
    expect(metrics.topInset).toBe(4);
    expect(metrics.laneHeight).toBeGreaterThanOrEqual(12);
    expect(metrics.blockHeight).toBeGreaterThanOrEqual(10);
  });

  it('visar tid bara när blocket är tillräckligt stort i kompakt läge', () => {
    expect(shouldShowCompactBlockTime({ width: 169, laneHeight: 30, isSecondary: false })).toBe(false);
    expect(shouldShowCompactBlockTime({ width: 170, laneHeight: 24, isSecondary: false })).toBe(true);
    expect(shouldShowCompactBlockTime({ width: 220, laneHeight: 24, isSecondary: true })).toBe(false);
  });

  it('döljer badge i för trånga block', () => {
    expect(shouldShowCompactBlockBadge({ width: 83, laneHeight: 18 })).toBe(false);
    expect(shouldShowCompactBlockBadge({ width: 84, laneHeight: 16 })).toBe(true);
  });

  it('placerar gps-indikatorn som en tunn nederkant', () => {
    expect(getGanttEvidenceBarStyle()).toEqual({ top: 40, height: 4 });
  });
});