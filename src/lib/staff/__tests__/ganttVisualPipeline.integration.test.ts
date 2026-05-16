import { describe, it, expect } from 'vitest';
import {
  mapDisplayTimelineBlocksToGantt,
  mapWorkdayAllocationSegmentsToGantt,
  sessionKeyFromTimelineBlock,
  selectGanttSourceFromMapped,
  type DisplayTimelineBlockLite,
  type GanttBlockFromTimeline,
} from '../displayTimelineToGanttBlocks';
import {
  applyGanttVisualPipeline,
  type PipelineBlock,
} from '../ganttVisualPipeline';

const iso = (h: number, m = 0) =>
  `2026-05-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`;

/** Spegla StaffGanttView.timelineBlockToGanttBlock: V2 → PipelineBlock. */
const toPipelineBlock = (b: GanttBlockFromTimeline): PipelineBlock => ({
  id: b.id,
  kind: b.kind,
  startAt: b.startAt,
  endAt: b.endAt,
  durationMinutes: b.durationMinutes,
  title: b.title,
  subtitle: b.subtitle ?? null,
  sessionKey: sessionKeyFromTimelineBlock(b),
  rawKind:
    (b.meta && (b.meta.displayType as string)) ||
    (b.meta && (b.meta.allocationType as string)) ||
    undefined,
  targetType: b.targetType,
  targetId: b.targetId,
  address: b.address,
  warnings: b.warnings,
  source: b.source,
  meta: b.meta,
});

describe('Gantt 5.3 — V2 visual pipeline integration', () => {
  // ────────────────────────────────────────────────────────────────────
  it('1) två V2 project-block med samma targetId mergeas till ETT visuellt block', () => {
    const v2: DisplayTimelineBlockLite[] = [
      {
        id: 'v2-a',
        startAt: iso(8),
        endAt: iso(10),
        displayType: 'project',
        title: 'Akustikum',
        targetType: 'project',
        targetId: 'A',
      },
      {
        id: 'v2-b',
        startAt: iso(10, 5),
        endAt: iso(12),
        displayType: 'project',
        title: 'Akustikum',
        targetType: 'project',
        targetId: 'A',
      },
    ];
    const mapped = mapDisplayTimelineBlocksToGantt(v2).map(toPipelineBlock);

    // Båda får samma sessionKey
    expect(mapped[0].sessionKey).toBe('target:project:A');
    expect(mapped[1].sessionKey).toBe(mapped[0].sessionKey);

    const { blocks, mergeDiagnostics } = applyGanttVisualPipeline(mapped, {
      staffName: 'Test',
    });

    expect(blocks).toHaveLength(1);
    expect(mergeDiagnostics.mergedBlockCount).toBe(1); // 2 raw → 1 merged
    const [m] = blocks;
    // mergat block-id slutar med "+merged" och refererar båda raw-id i mergeDiagnostics
    expect(m.id).toMatch(/\+merged$/);
    expect(mergeDiagnostics.mergedExamples[0]?.sessionKey).toBe('target:project:A');
    // mergat blockets samlade tid = sum av underblocken
    expect(m.durationMinutes).toBe(120 + 115);
    // metadata bevarad
    expect(m.targetType).toBe('project');
    expect(m.targetId).toBe('A');
    expect(m.source).toBe('displayTimelineV2');
  });

  // ────────────────────────────────────────────────────────────────────
  it('2) korta travel före/efter ett V2 project absorberas som chips', () => {
    const v2: DisplayTimelineBlockLite[] = [
      { id: 't-before', startAt: iso(7, 45), endAt: iso(8), displayType: 'travel', title: 'Resa' },
      {
        id: 'proj',
        startAt: iso(8),
        endAt: iso(12),
        displayType: 'project',
        title: 'Akustikum',
        targetType: 'project',
        targetId: 'A',
      },
      { id: 't-after', startAt: iso(12), endAt: iso(12, 15), displayType: 'travel', title: 'Resa' },
    ];
    const mapped = mapDisplayTimelineBlocksToGantt(v2).map(toPipelineBlock);
    const { blocks } = applyGanttVisualPipeline(mapped, { staffName: 'Test' });

    // ETT huvudblock kvar, inga standalone transport-block
    expect(blocks).toHaveLength(1);
    const [host] = blocks;
    expect(host.kind).toBe('work');
    expect(host.absorbedSourceIds).toEqual(
      expect.arrayContaining(['t-before', 't-after']),
    );
    expect(host.attachedChips).toBeDefined();
    expect(host.attachedChips!.join(' | ')).toMatch(/Transport före 15 min/);
    expect(host.attachedChips!.join(' | ')).toMatch(/Transport efter 15 min/);
  });

  // ────────────────────────────────────────────────────────────────────
  it('3) kort review (unlinked_address needs_user_review) absorberas till hostblocket', () => {
    const v2: DisplayTimelineBlockLite[] = [
      {
        id: 'proj',
        startAt: iso(8),
        endAt: iso(12),
        displayType: 'project',
        title: 'Akustikum',
        targetType: 'project',
        targetId: 'A',
      },
      {
        id: 'rev',
        startAt: iso(12),
        endAt: iso(12, 20),
        displayType: 'unlinked_address',
        severity: 'needs_user_review',
      },
    ];
    const mapped = mapDisplayTimelineBlocksToGantt(v2).map(toPipelineBlock);
    const { blocks, visualDiagnostics } = applyGanttVisualPipeline(mapped, {
      staffName: 'Test',
    });

    expect(blocks).toHaveLength(1);
    const [host] = blocks;
    expect(host.kind).toBe('work');
    expect(host.absorbedSourceIds).toEqual(['rev']);
    expect(host.attachedChips!.some((c) => c.startsWith('Granska efter'))).toBe(true);
    expect(visualDiagnostics.absorbedReviewCount).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  it('4) V2 endast private → fallback till allocation, Gantt blir inte tom', () => {
    const v2Private: DisplayTimelineBlockLite[] = [
      { id: 'p', startAt: iso(20), endAt: iso(22), displayType: 'private', title: 'Hemma' },
    ];
    const allocSegments = [
      { id: 'al', startAt: iso(8), endAt: iso(12), allocationType: 'project_work', title: 'Jobb' },
    ];

    const mappedV2 = mapDisplayTimelineBlocksToGantt(v2Private).map(toPipelineBlock);
    const mappedAlloc = mapWorkdayAllocationSegmentsToGantt(allocSegments).map(toPipelineBlock);

    expect(mappedV2).toHaveLength(0);
    expect(mappedAlloc).toHaveLength(1);

    const source = selectGanttSourceFromMapped({
      mappedV2Count: mappedV2.length,
      mappedAllocationCount: mappedAlloc.length,
      legacyCount: 0,
    });
    expect(source).toBe('workdayAllocation');

    const { blocks } = applyGanttVisualPipeline(mappedAlloc, { staffName: 'Test' });
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].source).toBe('workdayAllocation');
  });

  // ────────────────────────────────────────────────────────────────────
  it('5) metadata (targetType/targetId/address/warnings/source) bevaras genom hela pipelinen', () => {
    const v2: DisplayTimelineBlockLite[] = [
      {
        id: 'proj',
        startAt: iso(8),
        endAt: iso(12),
        displayType: 'large_project',
        title: 'Globen',
        targetType: 'large_project',
        targetId: 'lp-1',
        address: 'Arenavägen 1, Stockholm',
        humanWarnings: ['Planeringen säger annan plats än GPS.'],
      },
      // En kort transport som absorberas — får inte rensa hostens metadata
      { id: 'tr', startAt: iso(12), endAt: iso(12, 10), displayType: 'travel', title: 'Resa' },
    ];
    const mapped = mapDisplayTimelineBlocksToGantt(v2).map(toPipelineBlock);
    const { blocks } = applyGanttVisualPipeline(mapped, { staffName: 'Test' });

    expect(blocks).toHaveLength(1);
    const [host] = blocks;
    expect(host.targetType).toBe('large_project');
    expect(host.targetId).toBe('lp-1');
    expect(host.address).toBe('Arenavägen 1, Stockholm');
    expect(host.warnings).toEqual(['Planeringen säger annan plats än GPS.']);
    expect(host.source).toBe('displayTimelineV2');
    expect(host.meta?.displayType).toBe('large_project');
    expect(host.absorbedSourceIds).toEqual(['tr']);
  });
});
