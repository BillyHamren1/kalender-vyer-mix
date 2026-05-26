/**
 * Unit tests för suggestionPayload.ts.
 * Verifierar att "skicka direkt från listan" bara tillåts när förslaget
 * är säkert nog, och att payload-byggandet är deterministiskt.
 */
import { describe, it, expect } from 'vitest';
import {
  buildManualDayFromSuggested,
  evaluateDirectSubmit,
  targetFromMatched,
} from './suggestionPayload';
import type { MobileGpsDayView, MobileGpsDaySegment } from './types';

function mkSegment(overrides: Partial<MobileGpsDaySegment> = {}): MobileGpsDaySegment {
  return {
    segmentKey: overrides.segmentKey ?? 'seg-1',
    kind: 'stay',
    type: overrides.type ?? 'stay',
    label: overrides.label ?? 'Lagret',
    originalStartTime: overrides.originalStartTime ?? '2026-05-20T07:00:00.000Z',
    originalEndTime: overrides.originalEndTime ?? '2026-05-20T15:00:00.000Z',
    currentStartTime: overrides.currentStartTime ?? '2026-05-20T07:00:00.000Z',
    currentEndTime: overrides.currentEndTime ?? '2026-05-20T15:00:00.000Z',
    durationMinutes: overrides.durationMinutes ?? 480,
    durationLabel: overrides.durationLabel ?? '8h',
    matched: overrides.matched ?? { kind: 'location', id: 'loc-1', name: 'Lagret' },
    manualOverride: { hasOverride: false, reason: null },
    confidence: 1,
    ...overrides,
  };
}

function mkView(overrides: Partial<MobileGpsDayView> = {}): MobileGpsDayView {
  return {
    source: 'mobile_gps_day_view_v2',
    staffId: 'staff-1',
    date: '2026-05-20',
    sourceSnapshotId: 'snap-1',
    title: '',
    subtitle: '',
    map: { type: 'empty', hasPings: false, routeGeoJson: null, bounds: null, markers: [], areas: [] },
    segments: [mkSegment()],
    rows: [],
    totals: { totalDurationMinutes: 480, totalDurationLabel: '8h', workMinutes: 480, travelMinutes: 0, gapMinutes: 0 },
    manualOverridesSummary: { count: 0, appliedSegmentKeys: [] },
    submission: {
      hasSubmission: false,
      status: 'not_submitted',
      submittedAt: null,
      submittedBy: null,
      userComment: null,
      reviewComment: null,
      correctionRequestedAt: null,
      correctionRequestedBy: null,
      canEdit: true,
      canSubmit: true,
      needsCorrection: false,
    },
    messages: [],
    debug: { rawPingCount: 0, firstPingAt: null, lastPingAt: null },
    manualTargets: { assignedTargets: [], locationTargets: [], searchableTargets: [] },
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('targetFromMatched', () => {
  it('mappar location-träff', () => {
    const t = targetFromMatched(mkSegment({ matched: { kind: 'location', id: 'L1', name: 'Lager' } }));
    expect(t?.targetType).toBe('location');
    expect(t?.location_id).toBe('L1');
  });
  it('mappar project-träff', () => {
    const t = targetFromMatched(mkSegment({ matched: { kind: 'project', id: 'P1', name: 'Festen' } }));
    expect(t?.targetType).toBe('project');
    expect(t?.project_id).toBe('P1');
  });
  it('home → null (privat)', () => {
    expect(targetFromMatched(mkSegment({ matched: { kind: 'home', id: 'H', name: 'Hem' } }))).toBeNull();
  });
  it('omatchat → null', () => {
    expect(targetFromMatched(mkSegment({ matched: { kind: null, id: null, name: null } }))).toBeNull();
  });
});

describe('buildManualDayFromSuggested', () => {
  it('returnerar null när inga giltiga work-block finns', () => {
    expect(buildManualDayFromSuggested(mkView({ segments: [] }), '')).toBeNull();
  });
  it('filtrerar bort 0-minutersblock', () => {
    const payload = buildManualDayFromSuggested(mkView({
      segments: [
        mkSegment({ segmentKey: 'a', durationMinutes: 0 }),
        mkSegment({ segmentKey: 'b', durationMinutes: 240 }),
      ],
    }), '');
    expect(payload).not.toBeNull();
    expect(payload!.segments).toHaveLength(1);
    expect(payload!.segments[0].sourceSegmentId).toBe('b');
  });
  it('comment trimmar till null', () => {
    const payload = buildManualDayFromSuggested(mkView(), '   ');
    expect(payload?.comment).toBeNull();
  });
  it('sätter dayStart/end från första/sista blocket', () => {
    const payload = buildManualDayFromSuggested(mkView({
      segments: [
        mkSegment({
          segmentKey: 'a',
          currentStartTime: '2026-05-20T05:00:00.000Z',
          currentEndTime: '2026-05-20T09:00:00.000Z',
          durationMinutes: 240,
        }),
        mkSegment({
          segmentKey: 'b',
          currentStartTime: '2026-05-20T10:00:00.000Z',
          currentEndTime: '2026-05-20T14:00:00.000Z',
          durationMinutes: 240,
        }),
      ],
    }), '');
    expect(payload?.dayStartTime).toBe('07:00');
    expect(payload?.dayEndTime).toBe('16:00');
  });
});

describe('evaluateDirectSubmit', () => {
  it('rimlig dag → ok=true', () => {
    const r = evaluateDirectSubmit(mkView());
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.payload).not.toBeNull();
  });

  it('correction_requested → blockerad', () => {
    const r = evaluateDirectSubmit(mkView({
      submission: { ...mkView().submission, status: 'correction_requested' },
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/komplette/i);
  });

  it('redan approved → blockerad', () => {
    const r = evaluateDirectSubmit(mkView({
      submission: { ...mkView().submission, status: 'approved' },
    }));
    expect(r.ok).toBe(false);
  });

  it('canSubmit=false → blockerad', () => {
    const r = evaluateDirectSubmit(mkView({
      submission: { ...mkView().submission, canSubmit: false },
    }));
    expect(r.ok).toBe(false);
  });

  it('inga work-block → blockerad (fyll i)', () => {
    const r = evaluateDirectSubmit(mkView({ segments: [] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/fyll/i);
  });

  it('0-minutersblock närvarande → blockerad (granska)', () => {
    const r = evaluateDirectSubmit(mkView({
      segments: [
        mkSegment({ segmentKey: 'a', durationMinutes: 0 }),
        mkSegment({ segmentKey: 'b', durationMinutes: 240 }),
      ],
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/granska/i);
  });

  it('saknad target → blockerad (granska)', () => {
    const r = evaluateDirectSubmit(mkView({
      segments: [mkSegment({ matched: { kind: null, id: null, name: null } })],
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/plats/i);
  });

  it('> 14h totalt → blockerad', () => {
    const r = evaluateDirectSubmit(mkView({
      segments: [mkSegment({ durationMinutes: 15 * 60 })],
      totals: { totalDurationMinutes: 900, totalDurationLabel: '15h', workMinutes: 900, travelMinutes: 0, gapMinutes: 0 },
    }));
    expect(r.ok).toBe(false);
  });

  it('block > 12h → blockerad', () => {
    const r = evaluateDirectSubmit(mkView({
      segments: [mkSegment({ durationMinutes: 13 * 60 })],
      totals: { totalDurationMinutes: 780, totalDurationLabel: '13h', workMinutes: 780, travelMinutes: 0, gapMinutes: 0 },
    }));
    expect(r.ok).toBe(false);
  });
});
