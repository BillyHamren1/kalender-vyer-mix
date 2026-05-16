// Fix B — V2-tom dag får inte falla tillbaka på legacy reportCandidate.
// Vi testar suppress-regeln rent — samma logik som körs i StaffGanttView.tsx.
import { describe, it, expect } from 'vitest';
import { selectGanttSourceFromMapped, type GanttBlockSource } from '../displayTimelineToGanttBlocks';

interface Cand {
  workdayAllocationDiagnostics?: any;
  displayTimelineDiagnosticsV2?: any;
  counts?: any;
}

/** Replikerar suppress-grenen i StaffGanttView.useMemo (Fix B). */
function decideSource(cand: Cand, mappedV2: number, mappedAlloc: number, legacy: number): GanttBlockSource {
  const wdaDiag = cand.workdayAllocationDiagnostics ?? null;
  const dtDiag = cand.displayTimelineDiagnosticsV2 ?? null;
  const wdaWarnings: string[] = Array.isArray(wdaDiag?.warnings) ? wdaDiag.warnings : [];
  const dtWarnings: string[] = Array.isArray(dtDiag?.warnings) ? dtDiag.warnings : [];
  const v2HardBlocked =
    wdaDiag?.engineBlockedBecauseLocationTruthMissing === true ||
    wdaDiag?.hasRawPingsButNoLocationTruth === true ||
    dtWarnings.includes('display_suppressed_because_missing_location_truth') ||
    dtWarnings.includes('display_suppressed_open_timer_without_evidence') ||
    wdaWarnings.includes('open_timer_without_same_day_evidence') ||
    wdaWarnings.includes('open_timer_ignored_after_inferred_day_end') ||
    wdaDiag?.canonicalTimer?.staleOpenTimerIgnored === true;
  const v2AnalyzedDay =
    wdaDiag !== null ||
    dtDiag !== null ||
    typeof wdaDiag?.locationTruthV2SegmentCount === 'number' ||
    typeof cand?.counts?.locationTruthV2SegmentCount === 'number';
  const v2NoActiveWorkday =
    wdaDiag?.hasActiveWorkday === false ||
    wdaWarnings.includes('no_active_workday') ||
    wdaWarnings.includes('workday_start_missing') ||
    wdaWarnings.includes('empty_workday_allocation') ||
    dtWarnings.includes('empty_workday_allocation');
  const v2EmptyByDecision = v2AnalyzedDay && mappedV2 === 0 && mappedAlloc === 0 && v2NoActiveWorkday;
  const v2ExplicitlyBlocked = v2HardBlocked || v2EmptyByDecision;
  const selected = selectGanttSourceFromMapped({
    mappedV2Count: mappedV2,
    mappedAllocationCount: mappedAlloc,
    legacyCount: v2ExplicitlyBlocked ? 0 : legacy,
  });
  return v2ExplicitlyBlocked && selected === 'empty' ? 'v2_empty' : selected;
}

describe('Fix B — V2-empty blockerar legacy fallback', () => {
  it('Billy-liknande: V2 har analyserat, 0 active workday → v2_empty (inte legacy)', () => {
    const cand: Cand = {
      workdayAllocationDiagnostics: {
        hasActiveWorkday: false,
        locationTruthV2SegmentCount: 5,
        rawPingCount: 120,
        warnings: ['no_active_workday'],
      },
      displayTimelineDiagnosticsV2: { warnings: [] },
    };
    expect(decideSource(cand, 0, 0, 12)).toBe('v2_empty');
  });

  it('V2 säger empty_workday_allocation → v2_empty', () => {
    const cand: Cand = {
      workdayAllocationDiagnostics: { hasActiveWorkday: false, warnings: ['empty_workday_allocation'] },
    };
    expect(decideSource(cand, 0, 0, 7)).toBe('v2_empty');
  });

  it('V2 finns inte alls (legacy-only) → reportCandidate används', () => {
    expect(decideSource({}, 0, 0, 7)).toBe('reportCandidate');
  });

  it('V2 har riktiga block → displayTimelineV2 vinner', () => {
    const cand: Cand = {
      workdayAllocationDiagnostics: { hasActiveWorkday: true, warnings: [] },
    };
    expect(decideSource(cand, 3, 0, 7)).toBe('displayTimelineV2');
  });

  it('Hard block (open timer no evidence) → v2_empty även om legacy finns', () => {
    const cand: Cand = {
      workdayAllocationDiagnostics: {
        hasActiveWorkday: false,
        openTimerIgnoredForDisplay: true,
        warnings: ['open_timer_without_same_day_evidence'],
      },
    };
    expect(decideSource(cand, 0, 0, 9)).toBe('v2_empty');
  });

  it('V2 inte ens analyserat dagen (inga diagnostics) → empty inte v2_empty', () => {
    expect(decideSource({}, 0, 0, 0)).toBe('empty');
  });
});
