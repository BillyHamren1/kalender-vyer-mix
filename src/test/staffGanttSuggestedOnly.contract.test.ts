/**
 * Kontrakt: Admin Gantt-vyn på /staff-management/time-reports är en
 * "Suggested-Only"-vy. Allt som visas är förslag (reportCandidate) — inget
 * kräver committed time_reports/LTE/travel.
 *
 * Regler som detta test låser:
 *   1. När `reportCandidateBlocks` finns för en dag ska Gantt-källan väljas
 *      till 'reportCandidate' — även om V2-fältet är närvarande och även
 *      om V2 hard-blockerat dagen.
 *   2. Endast när reportCandidate är tom får V2/allocation/legacy användas
 *      som visuell källa (genom selectGanttSourceFromMapped).
 *
 * Inga UI-imports — vi speglar selektorlogiken som finns i StaffGanttView.
 */
import { describe, it, expect } from 'vitest';
import {
  selectGanttSourceFromMapped,
  type GanttBlockSource,
} from '@/lib/staff/displayTimelineToGanttBlocks';
import { buildReportDisplayBlocks } from '@/lib/staff/buildReportDisplayBlocks';
import { buildSuggestedDisplayBlocksForAdminGantt } from '@/lib/staff/reportCandidateGanttParity';
import type { ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

function pickSource(args: {
  legacyCount: number;
  mappedV2Count: number;
  mappedAllocationCount: number;
  hasV2Field: boolean;
}): GanttBlockSource {
  // Spegel av StaffGanttView.tsx (Suggested-Only Policy 2026-05-17)
  if (args.legacyCount > 0) return 'reportCandidate';
  return selectGanttSourceFromMapped({
    mappedV2Count: args.mappedV2Count,
    mappedAllocationCount: args.mappedAllocationCount,
    legacyCount: 0,
    hasV2Field: args.hasV2Field,
  });
}

describe('Admin Gantt Suggested-Only Source Selection', () => {
  it('reportCandidate vinner över V2 när blocks finns', () => {
    expect(
      pickSource({ legacyCount: 5, mappedV2Count: 3, mappedAllocationCount: 0, hasV2Field: true }),
    ).toBe('reportCandidate');
  });

  it('reportCandidate vinner även när V2 hard-blockerat dagen', () => {
    // hasV2Field=true simulerar att motorn har V2 men supprimerat allt.
    expect(
      pickSource({ legacyCount: 2, mappedV2Count: 0, mappedAllocationCount: 0, hasV2Field: true }),
    ).toBe('reportCandidate');
  });

  it('faller tillbaka till V2 endast när reportCandidate är tom', () => {
    expect(
      pickSource({ legacyCount: 0, mappedV2Count: 4, mappedAllocationCount: 0, hasV2Field: true }),
    ).toBe('displayTimelineV2');
  });

  it('faller tillbaka till workdayAllocation när varken legacy eller V2 finns', () => {
    expect(
      pickSource({ legacyCount: 0, mappedV2Count: 0, mappedAllocationCount: 3, hasV2Field: false }),
    ).toBe('workdayAllocation');
  });

  it('returnerar säker default när allt är tomt', () => {
    const r = pickSource({ legacyCount: 0, mappedV2Count: 0, mappedAllocationCount: 0, hasV2Field: false });
    // Vilken källa som väljs är inte poängen här — bara att det inte kastar.
    expect(['reportCandidate', 'displayTimelineV2', 'workdayAllocation', 'empty']).toContain(r);
  });
});

describe('Admin Gantt row totals come from suggested (reportCandidateSummary)', () => {
  // Spegel av render-logiken i namnkolumnen.
  function rowTotals(
    summary: { workMinutes?: number; transportMinutes?: number } | null | undefined,
    metrics: { activityMinutes: number; travelMinutes: number },
  ): { workMin: number; travelMin: number } {
    return {
      workMin: summary?.workMinutes ?? metrics.activityMinutes,
      travelMin: summary?.transportMinutes ?? metrics.travelMinutes,
    };
  }

  it('visar suggested-tider när reportCandidateSummary finns', () => {
    const r = rowTotals(
      { workMinutes: 544, transportMinutes: 181 },
      { activityMinutes: 0, travelMinutes: 0 },
    );
    expect(r).toEqual({ workMin: 544, travelMin: 181 });
  });

  it('faller tillbaka till metrics endast när summary saknas helt', () => {
    const r = rowTotals(null, { activityMinutes: 120, travelMinutes: 30 });
    expect(r).toEqual({ workMin: 120, travelMin: 30 });
  });

  it('matchar modalens 9h 4m arbete + 3h 1m transport för Markuss-fallet', () => {
    const r = rowTotals(
      { workMinutes: 9 * 60 + 4, transportMinutes: 3 * 60 + 1 },
      { activityMinutes: 0, travelMinutes: 0 },
    );
    expect(r.workMin).toBe(544);
    expect(r.travelMin).toBe(181);
  });
});

describe('Admin Gantt block sequence matches modal display sequence', () => {
  const candidateBlocks: ReportCandidateBlockUI[] = [
    {
      id: 'travel-1',
      kind: 'transport',
      startAt: '2026-05-17T06:14:00.000Z',
      endAt: '2026-05-17T07:36:00.000Z',
      durationMinutes: 82,
      title: 'Resa mot Westmans',
      subtitle: 'till Westmans',
      targetType: null,
      targetId: null,
      targetLabel: null,
      fromLabel: 'Signal saknas',
      toLabel: 'Westmans Uthyrning - 23 maj 2026',
      confidence: 'medium',
      reviewState: 'ok',
    },
    {
      id: 'work-1',
      kind: 'work',
      startAt: '2026-05-17T07:36:00.000Z',
      endAt: '2026-05-17T08:40:00.000Z',
      durationMinutes: 64,
      title: 'Westmans Uthyrning - 23 maj 2026',
      subtitle: '07:36–08:40',
      targetType: 'booking',
      targetId: 'booking-1',
      targetLabel: 'Westmans Uthyrning - 23 maj 2026',
      confidence: 'high',
      reviewState: 'ok',
    },
    {
      id: 'travel-2',
      kind: 'transport',
      startAt: '2026-05-17T08:40:00.000Z',
      endAt: '2026-05-17T09:22:00.000Z',
      durationMinutes: 42,
      title: 'Resa',
      subtitle: 'Westmans → FA Warehouse',
      targetType: null,
      targetId: null,
      targetLabel: null,
      fromLabel: 'Westmans Uthyrning - 23 maj 2026',
      toLabel: 'FA Warehouse',
      confidence: 'high',
      reviewState: 'ok',
    },
    {
      id: 'work-2',
      kind: 'work',
      startAt: '2026-05-17T09:25:00.000Z',
      endAt: '2026-05-17T10:04:00.000Z',
      durationMinutes: 39,
      title: 'FA Warehouse',
      subtitle: '09:25–10:04',
      targetType: 'project',
      targetId: 'warehouse-1',
      targetLabel: 'FA Warehouse',
      confidence: 'high',
      reviewState: 'ok',
    },
  ];

  it('använder exakt samma blockordning som modalen', () => {
    const modal = buildReportDisplayBlocks({
      blocks: candidateBlocks,
      presenceBlocks: [],
      targets: [],
      staffName: 'Markuss Minalto',
      date: '2026-05-17',
    }).filter((b) => ['work', 'transport', 'unknown', 'needs_review'].includes(b.kind));

    const gantt = buildSuggestedDisplayBlocksForAdminGantt({
      blocks: candidateBlocks,
      presenceBlocks: [],
      targets: [],
      staffName: 'Markuss Minalto',
      date: '2026-05-17',
    });

    expect(gantt.map((b) => b.id)).toEqual(modal.map((b) => b.id));
    expect(gantt.map((b) => b.displayTitle)).toEqual(modal.map((b) => b.displayTitle));
    expect(gantt.map((b) => b.displaySubtitle ?? null)).toEqual(modal.map((b) => b.displaySubtitle ?? null));
  });

  it('absorberar inte kort transport som chips eller slår ihop block', () => {
    const gantt = buildSuggestedDisplayBlocksForAdminGantt({
      blocks: candidateBlocks,
      presenceBlocks: [],
      targets: [],
      staffName: 'Markuss Minalto',
      date: '2026-05-17',
    });

    expect(gantt).toHaveLength(4);
    expect(gantt[0].ganttKind).toBe('transport');
    expect(gantt[1].ganttKind).toBe('work');
    expect(gantt[2].ganttKind).toBe('transport');
    expect(gantt[3].ganttKind).toBe('work');
  });
});
