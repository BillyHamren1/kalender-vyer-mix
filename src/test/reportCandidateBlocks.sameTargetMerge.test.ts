import { describe, expect, it } from 'vitest';

import { buildReportCandidateBlocks } from '../../supabase/functions/_shared/time-engine/buildReportCandidateBlocks';

describe('buildReportCandidateBlocks', () => {
  it('merges same-target work blocks after sandwich inference', () => {
    const targetId = '11111111-1111-1111-1111-111111111111';

    const result = buildReportCandidateBlocks({
      staffId: '22222222-2222-2222-2222-222222222222',
      organizationId: '33333333-3333-3333-3333-333333333333',
      date: '2026-05-11',
      presenceDayBlocks: [
        {
          id: 'pb-1',
          kind: 'confirmed_on_site',
          startAt: '2026-05-11T04:57:00.000Z',
          endAt: '2026-05-11T05:17:00.000Z',
          durationMinutes: 20,
          durationLabel: '20 min',
          confidence: 'high',
          confidenceReason: 'test',
          reviewState: 'ok',
          targetType: 'organization_location',
          targetId,
          targetLabel: 'FA Warehouse',
          signalGapMinutes: 10,
          evidence: {},
          sourceSegmentIds: ['seg-1'],
          hiddenRawSegmentIds: [],
        },
        {
          id: 'pb-2',
          kind: 'signal_gap',
          startAt: '2026-05-11T05:18:00.000Z',
          endAt: '2026-05-11T05:52:00.000Z',
          durationMinutes: 34,
          durationLabel: '34 min',
          confidence: 'low',
          confidenceReason: 'test',
          reviewState: 'needs_review',
          targetType: null,
          targetId: null,
          targetLabel: null,
          signalGapMinutes: 34,
          evidence: {},
          sourceSegmentIds: ['seg-2'],
          hiddenRawSegmentIds: [],
        },
        {
          id: 'pb-3',
          kind: 'confirmed_on_site',
          startAt: '2026-05-11T05:52:00.000Z',
          endAt: '2026-05-11T06:00:00.000Z',
          durationMinutes: 8,
          durationLabel: '8 min',
          confidence: 'high',
          confidenceReason: 'test',
          reviewState: 'ok',
          targetType: 'organization_location',
          targetId,
          targetLabel: 'FA Warehouse',
          signalGapMinutes: 0,
          evidence: {},
          sourceSegmentIds: ['seg-3'],
          hiddenRawSegmentIds: [],
        },
      ],
      policy: {
        longGapInsideWorkMinutes: 20,
        loneGapNeedsReviewMinutes: 10,
        sandwichInferWorkMaxMinutes: 90,
      },
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].kind).toBe('work');
    expect(result.blocks[0].targetLabel).toBe('FA Warehouse');
    expect(result.blocks[0].startAt).toBe('2026-05-11T04:57:00.000Z');
    expect(result.blocks[0].endAt).toBe('2026-05-11T06:00:00.000Z');
    expect(result.blocks[0].reviewReasons).toContain('signal_gaps_inside_work_block');
  });
});