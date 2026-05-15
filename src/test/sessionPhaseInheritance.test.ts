// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildSessionPhaseMap,
  sessionKeyForBlock,
  extractBookingNumberFromText,
  resolveBookingPhaseFromTitle,
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

describe('extractBookingNumberFromText', () => {
  it('matchar #2603-35R1', () => {
    expect(extractBookingNumberFromText('Creative Meetings (#2603-35R1)')).toBe('2603-35R1');
  });
  it('matchar bart 2603-35R1', () => {
    expect(extractBookingNumberFromText('Job 2603-35R1 idag')).toBe('2603-35R1');
  });
  it('returnerar null när inget bokningsnummer finns', () => {
    expect(extractBookingNumberFromText('Creative Meetings')).toBeNull();
    expect(extractBookingNumberFromText(null)).toBeNull();
  });
});

describe('sessionKeyForBlock — bokningsnummer i titel vinner', () => {
  it('block med olika targetType/targetId men samma #booking → samma nyckel', () => {
    const a = sessionKeyForBlock({
      id: 'A', targetType: 'project', targetId: 'lp-uuid',
      title: 'Creative Meetings (#2603-35R1)',
    });
    const b = sessionKeyForBlock({
      id: 'B', targetType: 'booking', targetId: '2603-35R1',
      title: 'Creative Meetings (#2603-35R1)',
    });
    expect(a).toBe('booking#:2603-35R1');
    expect(b).toBe('booking#:2603-35R1');
  });

  it('utan bokningsnummer faller tillbaka till targetType:targetId', () => {
    expect(sessionKeyForBlock({
      id: 'A', targetType: 'booking', targetId: 'X', title: 'No number here',
    })).toBe('booking:X');
  });
});

describe('resolveBookingPhaseFromTitle', () => {
  it('plockar rig från bookingPhaseByDate via #2603-35R1 i titeln', () => {
    expect(resolveBookingPhaseFromTitle(
      { title: 'Creative Meetings (#2603-35R1)' },
      { '2603-35R1': 'rig' },
    )).toBe('rig');
  });

  it('event mappas till work', () => {
    expect(resolveBookingPhaseFromTitle(
      { title: 'Job (#2603-35R1)' },
      { '2603-35R1': 'event' },
    )).toBe('work');
  });

  it('returnerar null när bookingen inte finns i mapen', () => {
    expect(resolveBookingPhaseFromTitle(
      { title: 'Creative Meetings (#2603-35R1)' },
      { 'OTHER': 'rig' },
    )).toBeNull();
  });
});

describe('Pavels Creative Meetings (#2603-35R1) regression', () => {
  it('block A (project-target) + block B (booking-target) ärver båda rig via session-nyckel', () => {
    // Replikerar exakt scenariot från skärmavbilden
    const blocks = [
      {
        id: 'A',
        targetType: 'project',
        targetId: 'some-large-project-uuid',
        title: 'Creative Meetings (#2603-35R1)',
      },
      {
        id: 'B',
        targetType: 'booking',
        targetId: '2603-35R1',
        title: 'Creative Meetings (#2603-35R1)',
      },
    ];

    // Båda blocken får samma sessionsnyckel (via bokningsnummer)
    const keyA = sessionKeyForBlock(blocks[0]);
    const keyB = sessionKeyForBlock(blocks[1]);
    expect(keyA).toBe(keyB);
    expect(keyA).toBe('booking#:2603-35R1');

    // Block A har ingen direkt fas (project-uuid finns inte i lp-mapen),
    // block B har rig direkt. Sessions-arvet ska ge båda rig.
    const perBlock = {
      A: null,
      B: 'rig' as const,
    };
    const map = buildSessionPhaseMap(blocks, perBlock);
    expect(map['booking#:2603-35R1']).toBe('rig');
  });

  it('olika bokningsnummer i samma rad ärver INTE mellan sig', () => {
    const blocks = [
      { id: 'A', title: 'Job (#1111-AA)' },
      { id: 'B', title: 'Job (#2222-BB)' },
    ];
    const map = buildSessionPhaseMap(blocks, { A: null, B: 'rig' as const });
    expect(map['booking#:1111-AA']).toBeUndefined();
    expect(map['booking#:2222-BB']).toBe('rig');
  });
});
