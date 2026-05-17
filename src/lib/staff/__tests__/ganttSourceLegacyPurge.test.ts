/**
 * Time Legacy Purge 1 — låser att V2-fält (även tom array) ALLTID vinner över
 * legacy reportCandidate som UI-källa. Legacy får bara köra när V2-fältet
 * helt saknas i presence-day-svaret.
 */
import { describe, it, expect } from 'vitest';
import { selectGanttSourceFromMapped } from '@/lib/staff/displayTimelineToGanttBlocks';

describe('Time Legacy Purge 1 — selectGanttSourceFromMapped', () => {
  it('V2-fält närvarande + 0 mapped → v2_empty (ej reportCandidate)', () => {
    const r = selectGanttSourceFromMapped({
      mappedV2Count: 0,
      mappedAllocationCount: 0,
      legacyCount: 5,
      hasV2Field: true,
    });
    expect(r).toBe('v2_empty');
  });

  it('V2-fält saknas + legacy finns → reportCandidate (fallback tillåten)', () => {
    const r = selectGanttSourceFromMapped({
      mappedV2Count: 0,
      mappedAllocationCount: 0,
      legacyCount: 3,
      hasV2Field: false,
    });
    expect(r).toBe('reportCandidate');
  });

  it('V2-fält saknas + 0 legacy → empty', () => {
    const r = selectGanttSourceFromMapped({
      mappedV2Count: 0,
      mappedAllocationCount: 0,
      legacyCount: 0,
      hasV2Field: false,
    });
    expect(r).toBe('empty');
  });

  it('V2 har mapped block → displayTimelineV2 vinner', () => {
    const r = selectGanttSourceFromMapped({
      mappedV2Count: 2,
      mappedAllocationCount: 0,
      legacyCount: 10,
      hasV2Field: true,
    });
    expect(r).toBe('displayTimelineV2');
  });

  it('V2 tom + allocation finns → workdayAllocation (ej legacy)', () => {
    const r = selectGanttSourceFromMapped({
      mappedV2Count: 0,
      mappedAllocationCount: 3,
      legacyCount: 5,
      hasV2Field: true,
    });
    expect(r).toBe('workdayAllocation');
  });

  it('Billy-scenario: V2 tom, legacy har Westmans → INTE Westmans', () => {
    const r = selectGanttSourceFromMapped({
      mappedV2Count: 0,
      mappedAllocationCount: 0,
      legacyCount: 4, // Westmans-block från legacy
      hasV2Field: true,
    });
    expect(r).toBe('v2_empty');
    expect(r).not.toBe('reportCandidate');
  });
});
