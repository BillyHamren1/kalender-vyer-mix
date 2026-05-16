import { describe, it, expect } from 'vitest';
import { buildVisualGanttBlocks, visibleChips, MAX_VISIBLE_CHIPS, type GanttBlockLite } from '../visualGanttBlocks';

const iso = (h: number, m: number = 0) =>
  `2026-05-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`;

const mk = (overrides: Partial<GanttBlockLite> & { id: string; kind: GanttBlockLite['kind']; sH: number; sM?: number; eH: number; eM?: number }): GanttBlockLite => {
  const startAt = iso(overrides.sH, overrides.sM ?? 0);
  const endAt = iso(overrides.eH, overrides.eM ?? 0);
  const durationMinutes = (Date.parse(endAt) - Date.parse(startAt)) / 60000;
  return {
    id: overrides.id,
    kind: overrides.kind,
    startAt,
    endAt,
    durationMinutes,
    title: overrides.title,
    sessionKey: overrides.sessionKey,
    isNightGpsOnly: overrides.isNightGpsOnly,
  };
};

describe('buildVisualGanttBlocks', () => {
  it('absorberar kort transport före huvudjobb', () => {
    const transport = mk({ id: 't1', kind: 'transport', sH: 7, sM: 45, eH: 8, eM: 9 }); // 24min
    const rig = mk({ id: 'r1', kind: 'rig', sH: 8, sM: 9, eH: 19, eM: 48 });
    const { blocks, diagnostics } = buildVisualGanttBlocks([transport, rig]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('r1');
    expect(blocks[0].chips).toEqual(['Transport före 24 min']);
    expect(diagnostics.absorbedTransportCount).toBe(1);
  });

  it('absorberar kort transport efter jobb', () => {
    const rig = mk({ id: 'r1', kind: 'work', sH: 8, eH: 16 });
    const transport = mk({ id: 't1', kind: 'transport', sH: 16, sM: 5, eH: 16, eM: 25 });
    const { blocks } = buildVisualGanttBlocks([rig, transport]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].chips[0]).toMatch(/Transport efter 20 min/);
  });

  it('låter LÅNG transport stå som eget block', () => {
    const rig = mk({ id: 'r1', kind: 'work', sH: 8, eH: 16 });
    const transport = mk({ id: 't1', kind: 'transport', sH: 6, eH: 7 }); // 60min
    const { blocks, diagnostics } = buildVisualGanttBlocks([transport, rig]);
    expect(blocks).toHaveLength(2);
    expect(diagnostics.standaloneSecondaryCount).toBe(1);
  });

  it('absorberar review/unknown som ligger inuti ett huvudjobb', () => {
    const rig = mk({ id: 'r1', kind: 'work', sH: 8, eH: 16 });
    const review = mk({ id: 'rv1', kind: 'review', sH: 10, eH: 10, eM: 15 });
    const unknown = mk({ id: 'u1', kind: 'unknown', sH: 12, eH: 12, eM: 20 });
    const { blocks, diagnostics } = buildVisualGanttBlocks([rig, review, unknown]);
    expect(blocks).toHaveLength(1);
    expect(diagnostics.absorbedReviewCount).toBe(1);
    expect(diagnostics.absorbedUnknownCount).toBe(1);
    expect(blocks[0].chips.length).toBe(2);
  });

  it('pre_work absorberas eller döljs helt — aldrig som huvudkort', () => {
    const pre = mk({ id: 'p1', kind: 'pre_work', sH: 5, eH: 6 });
    const rig = mk({ id: 'r1', kind: 'rig', sH: 8, eH: 16 });
    const { blocks, diagnostics } = buildVisualGanttBlocks([pre, rig]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('r1');
    // pre 5–6 → rig 8 = 120 min gap > adjacency 10 → hidden, inte attached
    expect(diagnostics.hiddenPreWorkCount).toBe(1);
    expect(diagnostics.absorbedPreWorkCount).toBe(0);
  });

  it('lane-packing räknas BARA när två huvudjobb faktiskt överlappar', () => {
    const a = mk({ id: 'a', kind: 'work', sH: 8, eH: 12 });
    const b = mk({ id: 'b', kind: 'warehouse', sH: 10, eH: 14 });
    const trans = mk({ id: 't', kind: 'transport', sH: 7, sM: 45, eH: 8 });
    const { diagnostics } = buildVisualGanttBlocks([a, b, trans]);
    expect(diagnostics.lanePackedMainBlocksCount).toBe(1);
  });

  it('tomt indata ger tomt resultat', () => {
    const { blocks, diagnostics } = buildVisualGanttBlocks([]);
    expect(blocks).toEqual([]);
    expect(diagnostics.rawBlockCount).toBe(0);
  });

  it('rena huvudjobb (utan småblock) passerar oförändrade', () => {
    const a = mk({ id: 'a', kind: 'rig', sH: 8, eH: 12 });
    const b = mk({ id: 'b', kind: 'work', sH: 13, eH: 17 });
    const { blocks } = buildVisualGanttBlocks([a, b]);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((x) => x.attachedEvents.length === 0)).toBe(true);
  });
});
