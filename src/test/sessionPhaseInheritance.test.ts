// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildSessionPhaseMap,
  sessionKeyForBlock,
} from '@/lib/staff/ganttPhaseColor';

describe('sessionKeyForBlock', () => {
  it('grupperar på targetType:targetId när finns', () => {
    expect(
      sessionKeyForBlock({ id: 'a', targetType: 'booking', targetId: 'b1' }),
    ).toBe('booking:b1');
  });

  it('faller tillbaka till normaliserad titel när targetId saknas', () => {
    expect(
      sessionKeyForBlock({ id: 'a', title: '  Creative   Meetings  ' }),
    ).toBe('title:creative meetings');
  });

  it('faller tillbaka till block-id om inget annat finns', () => {
    expect(sessionKeyForBlock({ id: 'a' })).toBe('block:a');
  });
});

describe('buildSessionPhaseMap (jobb planerat som RIGG)', () => {
  it('första blocket utan fas ärver rig från andra blocket i samma session', () => {
    // Creative Meetings #2603-35R1 — två block, samma booking
    const blocks = [
      { id: 'A', targetType: 'booking', targetId: '2603-35R1', title: 'Creative Meetings' },
      { id: 'B', targetType: 'booking', targetId: '2603-35R1', title: 'Creative Meetings' },
    ];
    const perBlock = { A: null, B: 'rig' as const };
    const map = buildSessionPhaseMap(blocks, perBlock);
    expect(map['booking:2603-35R1']).toBe('rig');
  });

  it('två olika jobb samma dag ärver INTE fas mellan sig', () => {
    const blocks = [
      { id: 'A', targetType: 'booking', targetId: 'X', title: 'Job X' },
      { id: 'B', targetType: 'booking', targetId: 'Y', title: 'Job Y' },
    ];
    const perBlock = { A: null, B: 'rig' as const };
    const map = buildSessionPhaseMap(blocks, perBlock);
    expect(map['booking:X']).toBeUndefined();
    expect(map['booking:Y']).toBe('rig');
  });

  it('rig vinner över rigdown vid kollision i samma session', () => {
    const blocks = [
      { id: 'A', targetType: 'booking', targetId: 'X' },
      { id: 'B', targetType: 'booking', targetId: 'X' },
    ];
    const perBlock = { A: 'rigdown' as const, B: 'rig' as const };
    const map = buildSessionPhaseMap(blocks, perBlock);
    expect(map['booking:X']).toBe('rig');
  });

  it('alla block work → ingen session-fas (fortsätter som ARBETE)', () => {
    const blocks = [{ id: 'A', targetType: 'booking', targetId: 'X' }];
    const perBlock = { A: 'work' as const };
    const map = buildSessionPhaseMap(blocks, perBlock);
    expect(map['booking:X']).toBeUndefined();
  });
});
