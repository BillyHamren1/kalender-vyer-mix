import { describe, expect, it } from 'vitest';

import { buildReportCandidateBlocks } from '../../supabase/functions/_shared/time-engine/buildReportCandidateBlocks';

describe('Time Engine 2.11 — active timer overlap clamp', () => {
  // FA Warehouse open active timer at 06:55, but engine has clear evidence
  // of work on a different project (Bergman Event AB) starting 08:15.
  // Anchor must be clamped at 08:15, not extend to "now/dayEnd".
  it('clamps open active timer anchor at first hard-break (different-target work)', () => {
    const fa = '11111111-1111-1111-1111-111111111111';
    const bergman = '22222222-2222-2222-2222-222222222222';

    const result = buildReportCandidateBlocks({
      staffId: '99999999-9999-9999-9999-999999999999',
      organizationId: '88888888-8888-8888-8888-888888888888',
      date: '2026-05-11',
      presenceDayBlocks: [
        {
          id: 'fa-1',
          kind: 'confirmed_on_site',
          startAt: '2026-05-11T05:55:00.000Z',
          endAt: '2026-05-11T07:00:00.000Z',
          durationMinutes: 65,
          durationLabel: '1 h 5 min',
          confidence: 'high',
          confidenceReason: 'gps',
          reviewState: 'ok',
          targetType: 'organization_location',
          targetId: fa,
          targetLabel: 'FA Warehouse',
          signalGapMinutes: 0,
          evidence: {},
          sourceSegmentIds: ['fa-seg'],
          hiddenRawSegmentIds: [],
        },
        {
          id: 'bm-1',
          kind: 'confirmed_on_site',
          startAt: '2026-05-11T07:15:00.000Z',
          endAt: '2026-05-11T13:30:00.000Z',
          durationMinutes: 375,
          durationLabel: '6 h 15 min',
          confidence: 'high',
          confidenceReason: 'gps',
          reviewState: 'ok',
          targetType: 'project',
          targetId: bergman,
          targetLabel: 'Bergman Event AB',
          signalGapMinutes: 0,
          evidence: {},
          sourceSegmentIds: ['bm-seg'],
          hiddenRawSegmentIds: [],
        },
      ],
      openActiveRegistration: {
        startedAtIso: '2026-05-11T05:55:00.000Z',
        targetType: 'organization_location',
        targetId: fa,
        targetLabel: 'FA Warehouse',
        currentLabel: 'FA Warehouse',
        status: 'active',
      },
    });

    const works = result.blocks.filter((b) => b.kind === 'work');
    // FA-blocket får inte överlappa Bergman.
    const fa1 = works.find((b) => b.targetId === fa);
    const bm1 = works.find((b) => b.targetId === bergman);
    expect(fa1).toBeTruthy();
    expect(bm1).toBeTruthy();
    if (!fa1 || !bm1) return;
    expect(new Date(fa1.endAt).getTime()).toBeLessThanOrEqual(
      new Date(bm1.startAt).getTime(),
    );
    // diagnostics-räknare ska visa att klampning skedde.
    const diag = result.summary.activeTimerOverlapDiagnostics;
    expect(diag).toBeTruthy();
    expect(diag!.activeTimerAnchorsFound).toBeGreaterThan(0);
    // Antingen clamp-by-later-block eller overlap-resolved.
    const cuts = (diag!.activeTimerAnchorsClampedByLaterBlock ?? 0) +
      (diag!.overlappingWorkBlocksResolved ?? 0);
    expect(cuts).toBeGreaterThan(0);
  });
});
