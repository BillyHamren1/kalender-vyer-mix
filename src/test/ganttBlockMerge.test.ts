// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mergeContiguousBlocks, type MergeBlockInput } from '@/lib/staff/ganttBlockMerge';
import { sessionKeyForBlock } from '@/lib/staff/ganttPhaseColor';

const b = (
  id: string,
  kind: MergeBlockInput['kind'],
  startAt: string,
  endAt: string,
  durationMinutes: number,
  sessionKey = 'booking#:2603-35R1',
  rawKind?: string,
  extra: Partial<MergeBlockInput> = {},
): MergeBlockInput => ({ id, kind, startAt, endAt, durationMinutes, sessionKey, rawKind, ...extra });

describe('mergeContiguousBlocks', () => {
  it('Pavels Creative Meetings: två rig-block med 3 min glapp → ETT block', () => {
    const input = [
      b('A', 'rig', '2026-05-15T07:53:00+02:00', '2026-05-15T12:03:00+02:00', 250, 'booking#:2603-35R1', 'work'),
      b('B', 'rig', '2026-05-15T12:06:00+02:00', '2026-05-15T14:38:00+02:00', 152, 'booking#:2603-35R1', 'rig'),
    ];
    const { blocks, diagnostics } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(1);
    const m = blocks[0];
    expect(m.kind).toBe('rig');
    expect(m.startAt).toBe('2026-05-15T07:53:00+02:00');
    expect(m.endAt).toBe('2026-05-15T14:38:00+02:00');
    expect(m.durationMinutes).toBe(402);
    expect(m.countedDurationMinutes).toBe(402);
    expect(m.visualGapMinutes).toBe(3);
    expect(m.subBlocks).toHaveLength(2);
    expect(m.id).toBe('A+merged');
    expect(diagnostics.mergedExamples[0].rawKinds).toEqual(['work', 'rig']);
    expect(diagnostics.mergedExamples[0].resolvedKinds).toEqual(['rig', 'rig']);
    expect(diagnostics.mergedBlockCount).toBe(1);
    expect(diagnostics.visualBlockCount).toBe(1);
  });

  it('olika visualKind (work + rig) → INTE merge', () => {
    const input = [
      b('A', 'work', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 60),
      b('B', 'rig', '2026-05-15T09:03:00Z', '2026-05-15T10:00:00Z', 57),
    ];
    const { blocks } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(2);
  });

  it('glapp 20 min, samma session+kind → INTE merge', () => {
    const input = [
      b('A', 'rig', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 60),
      b('B', 'rig', '2026-05-15T09:20:00Z', '2026-05-15T10:00:00Z', 40),
    ];
    const { blocks } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(2);
  });

  it('olika sessionKey → INTE merge', () => {
    const input = [
      b('A', 'rig', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 60, 'booking#:1111'),
      b('B', 'rig', '2026-05-15T09:03:00Z', '2026-05-15T10:00:00Z', 57, 'booking#:2222'),
    ];
    const { blocks } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(2);
  });

  it('warehouse + warehouse, samma session, 5 min glapp → merge', () => {
    const input = [
      b('A', 'warehouse', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 60, 'location:lager-1'),
      b('B', 'warehouse', '2026-05-15T09:05:00Z', '2026-05-15T10:00:00Z', 55, 'location:lager-1'),
    ];
    const { blocks } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('warehouse');
    expect(blocks[0].durationMinutes).toBe(115);
  });

  it('transport mergeas aldrig', () => {
    const input = [
      b('A', 'transport', '2026-05-15T08:00:00Z', '2026-05-15T08:30:00Z', 30, 'project:p1'),
      b('B', 'transport', '2026-05-15T08:33:00Z', '2026-05-15T09:00:00Z', 27, 'project:p1'),
    ];
    expect(mergeContiguousBlocks(input).blocks).toHaveLength(2);
  });

  it('pre_work + work → INTE merge', () => {
    const input = [
      b('A', 'pre_work', '2026-05-15T07:00:00Z', '2026-05-15T07:50:00Z', 50),
      b('B', 'work', '2026-05-15T07:53:00Z', '2026-05-15T09:00:00Z', 67),
    ];
    expect(mergeContiguousBlocks(input).blocks).toHaveLength(2);
  });

  it('open vs closed → INTE merge', () => {
    const input = [
      b('A', 'rig', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 60, 'booking#:X', undefined, { isOpen: false }),
      b('B', 'rig', '2026-05-15T09:03:00Z', '2026-05-15T10:00:00Z', 57, 'booking#:X', undefined, { isOpen: true }),
    ];
    expect(mergeContiguousBlocks(input).blocks).toHaveLength(2);
  });

  it('night-GPS-only mergeas aldrig', () => {
    const input = [
      b('A', 'rig', '2026-05-15T01:00:00Z', '2026-05-15T02:00:00Z', 60, 'booking#:X', undefined, { isNightGpsOnly: true }),
      b('B', 'rig', '2026-05-15T02:03:00Z', '2026-05-15T03:00:00Z', 57, 'booking#:X'),
    ];
    expect(mergeContiguousBlocks(input).blocks).toHaveLength(2);
  });

  it('tre rig-block i kedja (2 min + 4 min gap) → ETT block med subBlocks=3', () => {
    const input = [
      b('A', 'rig', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 60),
      b('B', 'rig', '2026-05-15T09:02:00Z', '2026-05-15T10:00:00Z', 58),
      b('C', 'rig', '2026-05-15T10:04:00Z', '2026-05-15T11:00:00Z', 56),
    ];
    const { blocks } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].subBlocks).toHaveLength(3);
    expect(blocks[0].durationMinutes).toBe(174);
    expect(blocks[0].visualGapMinutes).toBe(6);
    expect(blocks[0].endAt).toBe('2026-05-15T11:00:00Z');
  });

  it('osorterad input sorteras på startAt internt', () => {
    const input = [
      b('B', 'rig', '2026-05-15T09:03:00Z', '2026-05-15T10:00:00Z', 57),
      b('A', 'rig', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 60),
    ];
    const { blocks } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].mergedFromIds).toEqual(['A', 'B']);
  });
});

describe('sessionKey via booking# wins över targetType/project', () => {
  it('samma bokningsnummer i titel ger samma sessionKey trots olika targetType', () => {
    const k1 = sessionKeyForBlock({
      id: 'A',
      targetType: 'project',
      targetId: 'other-project-uuid',
      title: 'Creative Meetings (#2603-35R1)',
    });
    const k2 = sessionKeyForBlock({
      id: 'B',
      targetType: 'booking',
      targetId: '2603-35R1',
      title: 'Creative Meetings (#2603-35R1)',
    });
    expect(k1).toBe('booking#:2603-35R1');
    expect(k2).toBe('booking#:2603-35R1');
    expect(k1).toBe(k2);
  });

  it('block med samma booking# i titel + matchande visualKind + 3 min gap → merge', () => {
    const k = sessionKeyForBlock({
      id: 'A',
      targetType: 'project',
      targetId: 'other-uuid',
      title: 'Creative Meetings (#2603-35R1)',
    });
    const input = [
      b('A', 'rig', '2026-05-15T07:53:00+02:00', '2026-05-15T12:03:00+02:00', 250, k, 'work'),
      b('B', 'rig', '2026-05-15T12:06:00+02:00', '2026-05-15T14:38:00+02:00', 152, k, 'rig'),
    ];
    const { blocks } = mergeContiguousBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].durationMinutes).toBe(402);
  });
});
