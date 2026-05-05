/**
 * lateAfterPlannedStart rule contract.
 *
 * Verifies:
 *  - When phone has been off until 13:10 but assignment was planned 08:00,
 *    nextAssistantDecision returns a `late_after_planned_start` prompt.
 *  - When a workday is already open, no late prompt fires.
 *  - When the gap is shorter than the threshold (LATE_AFTER_PLANNED_MIN),
 *    no prompt fires.
 */
import { describe, it, expect } from 'vitest';
import {
  nextAssistantDecision,
  LATE_AFTER_PLANNED_MIN,
  type WorkDayState,
} from '@/lib/workDayDecisions';

const baseState = (overrides: Partial<WorkDayState> = {}): WorkDayState => ({
  now: new Date('2026-05-05T13:10:00Z').getTime(),
  enabled: true,
  latestPosition: null,
  timers: [],
  cachedTargets: [],
  lastExit: null,
  pendingAnomalies: { count: 0, oldestStartedAtIso: null },
  isTravelling: false,
  lastShownByKind: new Map(),
  outsideSinceByTimer: new Map(),
  firstSignalToday: { iso: '2026-05-05T13:10:00Z', arrivedAtWorkplace: true },
  hasOpenWorkday: false,
  earliestPlannedStartToday: { iso: '2026-05-05T08:00:00Z', label: 'Projekt A' },
  ...overrides,
});

describe('late_after_planned_start rule', () => {
  it('fires when planned 08:00 and first signal 13:10 and no open workday', () => {
    const decision = nextAssistantDecision(baseState());
    expect(decision?.kind).toBe('late_after_planned_start');
    if (decision?.kind !== 'late_after_planned_start') return;
    expect(decision.lateMinutes).toBe(310);
    expect(decision.plannedStartIso).toBe('2026-05-05T08:00:00Z');
    expect(decision.firstSignalIso).toBe('2026-05-05T13:10:00Z');
  });

  it('does NOT fire when an open workday already exists', () => {
    const decision = nextAssistantDecision(baseState({ hasOpenWorkday: true }));
    expect(decision?.kind === 'late_after_planned_start').toBe(false);
  });

  it('does NOT fire when no planned start today', () => {
    const decision = nextAssistantDecision(baseState({ earliestPlannedStartToday: null }));
    expect(decision?.kind === 'late_after_planned_start').toBe(false);
  });

  it('does NOT fire when first signal is within threshold of planned start', () => {
    const plannedIso = '2026-05-05T08:00:00Z';
    const firstIso = new Date(
      new Date(plannedIso).getTime() + (LATE_AFTER_PLANNED_MIN - 5) * 60_000,
    ).toISOString();
    const decision = nextAssistantDecision(baseState({
      firstSignalToday: { iso: firstIso, arrivedAtWorkplace: true },
      now: new Date(firstIso).getTime(),
    }));
    expect(decision?.kind === 'late_after_planned_start').toBe(false);
  });

  it('respects cooldown (does not re-fire after recently shown)', () => {
    const now = baseState().now;
    const lastShown = new Map();
    lastShown.set('late_after_planned_start', now - 60_000);
    const decision = nextAssistantDecision(baseState({ lastShownByKind: lastShown }));
    expect(decision?.kind === 'late_after_planned_start').toBe(false);
  });
});
