import { describe, it, expect } from 'vitest';
import {
  mapDisplayTimelineBlocksToGantt,
  mapWorkdayAllocationSegmentsToGantt,
  selectGanttBlockSource,
  selectGanttSourceFromMapped,
  sessionKeyFromTimelineBlock,
  type DisplayTimelineBlockLite,
} from '../displayTimelineToGanttBlocks';

const iso = (h: number, m = 0) =>
  `2026-05-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`;

describe('mapDisplayTimelineBlocksToGantt', () => {
  it('mappar warehouse, travel, review, supplier korrekt', () => {
    const blocks: DisplayTimelineBlockLite[] = [
      { id: 'a', startAt: iso(8), endAt: iso(10), displayType: 'warehouse', title: 'FA Warehouse' },
      { id: 'b', startAt: iso(10), endAt: iso(11), displayType: 'travel', title: 'Resa' },
      { id: 'c', startAt: iso(11), endAt: iso(12), displayType: 'commute', title: 'Pendling' },
      { id: 'd', startAt: iso(13), endAt: iso(14), displayType: 'review', title: 'Granska' },
      { id: 'e', startAt: iso(14), endAt: iso(15), displayType: 'supplier', title: 'Hyrmaskiner AB' },
    ];
    const out = mapDisplayTimelineBlocksToGantt(blocks);
    expect(out.map((b) => b.kind)).toEqual([
      'warehouse', 'transport', 'transport', 'review', 'work',
    ]);
  });

  it('döljer private-block från huvud-Gantt', () => {
    const out = mapDisplayTimelineBlocksToGantt([
      { id: 'p', startAt: iso(20), endAt: iso(22), displayType: 'private', title: 'Hemma' },
      { id: 'q', startAt: iso(8), endAt: iso(16), displayType: 'project', title: 'Akustikum' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('q');
  });

  it('detekterar rig/rigdown från titeln för project/large_project/booking', () => {
    const out = mapDisplayTimelineBlocksToGantt([
      { id: 'r', startAt: iso(8), endAt: iso(12), displayType: 'project', title: 'Rigg Globen' },
      { id: 'd', startAt: iso(13), endAt: iso(17), displayType: 'large_project', title: 'Rigga ner Globen' },
      { id: 'w', startAt: iso(18), endAt: iso(19), displayType: 'booking', title: 'Vanligt jobb' },
    ]);
    expect(out.map((b) => b.kind)).toEqual(['rig', 'rigdown', 'work']);
  });

  it('unlinked_address eskaleras till review vid hög severity', () => {
    const out = mapDisplayTimelineBlocksToGantt([
      { id: 'u1', startAt: iso(9), endAt: iso(10), displayType: 'unlinked_address', severity: 'needs_user_review' },
      { id: 'u2', startAt: iso(10), endAt: iso(11), displayType: 'unlinked_address', severity: 'info' },
    ]);
    expect(out[0].kind).toBe('review');
    expect(out[1].kind).toBe('unknown');
  });

  it('saknad title → meningsfull fallback per displayType', () => {
    const out = mapDisplayTimelineBlocksToGantt([
      { id: 'w', startAt: iso(8), endAt: iso(9), displayType: 'warehouse' },
      { id: 't', startAt: iso(9), endAt: iso(10), displayType: 'travel' },
    ]);
    expect(out[0].title).toBe('Lager');
    expect(out[1].title).toBe('Resa');
  });

  it('för över warnings (humanWarnings prioriteras)', () => {
    const out = mapDisplayTimelineBlocksToGantt([
      {
        id: 'x',
        startAt: iso(8),
        endAt: iso(9),
        displayType: 'project',
        title: 'Jobb',
        warnings: ['planning_geo_mismatch'],
        humanWarnings: ['Planeringen säger annan plats än GPS.'],
      },
    ]);
    expect(out[0].warnings).toEqual(['Planeringen säger annan plats än GPS.']);
    expect(out[0].source).toBe('displayTimelineV2');
  });
});

describe('mapWorkdayAllocationSegmentsToGantt', () => {
  it('mappar allocationType till GanttKind', () => {
    const out = mapWorkdayAllocationSegmentsToGantt([
      { id: 's1', startAt: iso(8), endAt: iso(10), allocationType: 'project_work', title: 'Jobb' },
      { id: 's2', startAt: iso(10), endAt: iso(11), allocationType: 'work_travel', title: 'Resa' },
      { id: 's3', startAt: iso(11), endAt: iso(12), allocationType: 'warehouse_work', title: 'Lager' },
      { id: 's4', startAt: iso(20), endAt: iso(22), allocationType: 'private_time', title: 'Privat' },
    ]);
    expect(out.map((b) => b.kind)).toEqual(['work', 'transport', 'warehouse']);
    expect(out.every((b) => b.source === 'workdayAllocation')).toBe(true);
  });

  it('hoppar över segment utan start/end', () => {
    const out = mapWorkdayAllocationSegmentsToGantt([
      { id: 's', allocationType: 'project_work', title: 'Skräp' } as any,
    ]);
    expect(out).toEqual([]);
  });
});

describe('selectGanttBlockSource (legacy, råa counts)', () => {
  it('V2 vinner när den har block', () => {
    expect(selectGanttBlockSource({
      displayTimelineBlocksV2: [{ id: 'a', startAt: iso(8), endAt: iso(9), displayType: 'project' }],
      workdayAllocationSegments: [{ id: 'x', startAt: iso(8), endAt: iso(9), allocationType: 'project_work' }],
      reportCandidateBlocksCount: 5,
    })).toBe('displayTimelineV2');
  });

  it('legacy används när V2 OCH allocation är tomma', () => {
    expect(selectGanttBlockSource({
      displayTimelineBlocksV2: [],
      workdayAllocationSegments: [],
      reportCandidateBlocksCount: 3,
    })).toBe('reportCandidate');
  });

  it('empty när allt saknas', () => {
    expect(selectGanttBlockSource({
      displayTimelineBlocksV2: [],
      workdayAllocationSegments: [],
      reportCandidateBlocksCount: 0,
    })).toBe('empty');
  });
});

describe('selectGanttSourceFromMapped (Gantt 5.2)', () => {
  it('V2 mapped > 0 vinner', () => {
    expect(selectGanttSourceFromMapped({
      mappedV2Count: 3, mappedAllocationCount: 2, legacyCount: 5,
    })).toBe('displayTimelineV2');
  });

  it('V2 raw fanns men mappade till 0 (bara private) → allocation används', () => {
    expect(selectGanttSourceFromMapped({
      mappedV2Count: 0, mappedAllocationCount: 2, legacyCount: 5,
    })).toBe('workdayAllocation');
  });

  it('V2 + allocation mappar till 0 → legacy används (aldrig tom Gantt)', () => {
    expect(selectGanttSourceFromMapped({
      mappedV2Count: 0, mappedAllocationCount: 0, legacyCount: 7,
    })).toBe('reportCandidate');
  });

  it('allt 0 → empty', () => {
    expect(selectGanttSourceFromMapped({
      mappedV2Count: 0, mappedAllocationCount: 0, legacyCount: 0,
    })).toBe('empty');
  });
});

describe('sessionKeyFromTimelineBlock', () => {
  it('prioriterar targetType + targetId', () => {
    expect(sessionKeyFromTimelineBlock({
      id: 'x', targetType: 'large_project', targetId: 'abc', address: 'Kungsgatan 1', title: 'Skip',
    })).toBe('target:large_project:abc');
  });

  it('faller tillbaka på normaliserad adress när targetId saknas', () => {
    expect(sessionKeyFromTimelineBlock({
      id: 'x', address: 'Kaggeholms Slott, Ekerö', title: 'Rigg',
    })).toBe('address:kaggeholms-slott-ekero');
  });

  it('faller tillbaka på normaliserad titel när inget annat finns', () => {
    expect(sessionKeyFromTimelineBlock({
      id: 'x', title: 'Rigg Kaggeholm',
    })).toBe('title:rigg-kaggeholm');
  });

  it('id som sista utväg', () => {
    expect(sessionKeyFromTimelineBlock({ id: 'fallback-id' })).toBe('id:fallback-id');
  });

  it('två V2-block med samma targetId får samma sessionKey (mergebart)', () => {
    const k1 = sessionKeyFromTimelineBlock({ id: 'a', targetType: 'project', targetId: '42' });
    const k2 = sessionKeyFromTimelineBlock({ id: 'b', targetType: 'project', targetId: '42' });
    expect(k1).toBe(k2);
  });
});

describe('mapDisplayTimelineBlocksToGantt + sessionKey-integration', () => {
  it('mappade block har targetType/targetId/address bevarade', () => {
    const out = mapDisplayTimelineBlocksToGantt([
      {
        id: 'a',
        startAt: iso(8),
        endAt: iso(12),
        displayType: 'large_project',
        title: 'Globen',
        targetType: 'large_project',
        targetId: 'lp-1',
        address: 'Arenavägen 1',
      },
    ]);
    expect(out[0].targetType).toBe('large_project');
    expect(out[0].targetId).toBe('lp-1');
    expect(out[0].address).toBe('Arenavägen 1');
    expect(sessionKeyFromTimelineBlock(out[0])).toBe('target:large_project:lp-1');
  });
});
