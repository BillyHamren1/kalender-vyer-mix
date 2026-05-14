import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildReportCandidateBlocks } from '../buildReportCandidateBlocks.ts';

function privateResidencePresenceBlock(overrides: Partial<any> = {}): any {
  return {
    id: 'pr-1',
    kind: 'unknown_place',
    startAt: '2026-05-14T06:09:00.000Z',
    endAt: '2026-05-14T17:48:00.000Z',
    durationMinutes: 699,
    durationLabel: '11h 39m',
    targetType: null,
    targetId: null,
    targetLabel: null,
    confidence: 'high',
    confidenceReason: 'inside_private_residence',
    reviewState: 'ok',
    evidence: {
      privateResidence: true,
      privateResidenceTargetId: 'home-1',
      privateResidenceLabel: 'Hemma',
    },
    sourceSegmentIds: ['seg-1'],
    hiddenRawSegmentIds: [],
    ...overrides,
  };
}

Deno.test('private residence evidence stays excluded and never becomes visible report candidate block', () => {
  const result = buildReportCandidateBlocks({
    staffId: 'staff-1',
    organizationId: 'org-1',
    date: '2026-05-14',
    presenceDayBlocks: [privateResidencePresenceBlock()],
    activeTimeRegistrations: [],
    openActiveRegistration: null,
  });

  assertEquals(result.excludedPrivateResidenceBlocks.length, 1);
  assertEquals(result.blocks.length, 0);
  assert(
    !result.blocks.some((b) => b.targetType === 'private_residence' || (b.reviewReasons ?? []).includes('private_residence_status')),
    'private residence must never surface as visible report candidate block',
  );
});
