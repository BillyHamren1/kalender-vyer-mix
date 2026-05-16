import { describe, it, expect } from 'vitest';
import { buildTimeEngineFlowTrace } from '../timeEngineFlowTrace';

const baseInput = {
  staffId: 's1',
  staffName: 'Test Tester',
  date: '2026-05-16',
};

describe('buildTimeEngineFlowTrace', () => {
  it('handles missing presence response gracefully', () => {
    const t = buildTimeEngineFlowTrace({ ...baseInput, presenceResponse: null });
    expect(t.summary.staffId).toBe('s1');
    expect(t.layers.dayEvidence.available).toBe(false);
    expect(t.missingDataWarnings.length).toBeGreaterThan(0);
    expect(t.flowSteps.length).toBe(9);
  });

  it('flags stale open timer from midnight', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: {
        summary: {
          activeTimer: { startedAt: '2026-05-16T00:00:00Z', stoppedAt: null },
        },
        rawGpsTimeline: { rawPingCount: 100 },
        dayEvidenceDiagnostics: { locationLogicPingCount: 90 },
      },
      selectedGanttSource: 'displayTimelineV2',
      ganttSourceCounts: { rawV2: 3, mappedV2: 3, rawAlloc: 0, mappedAlloc: 0, legacy: 0, rendered: 3 },
    });
    expect(t.summary.staleOpenTimer).toBe(true);
    expect(t.suspectedProblems.some((p) => p.key === 'stale_open_timer_created_day_from_midnight')).toBe(true);
  });

  it('flags V2 selected but rendered zero', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: {
        displayTimelineBlocksV2: [{ id: 'd1' }, { id: 'd2' }],
        displayTimelineDiagnosticsV2: {},
      },
      selectedGanttSource: 'displayTimelineV2',
      ganttSourceCounts: { rawV2: 2, mappedV2: 2, rawAlloc: 0, mappedAlloc: 0, legacy: 0, rendered: 0 },
    });
    expect(t.suspectedProblems.some((p) => p.key === 'gantt_selected_v2_but_rendered_zero')).toBe(true);
  });

  it('flags location_truth_missing_despite_pings', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: {
        rawGpsTimeline: { rawPingCount: 50 },
        dayEvidenceDiagnostics: { locationLogicPingCount: 50 },
        locationTruthV2Segments: [],
      },
    });
    expect(t.suspectedProblems.some((p) => p.key === 'location_truth_missing_despite_pings')).toBe(true);
  });

  it('builds block lineage from V2 blocks when present', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: {
        displayTimelineBlocksV2: [
          {
            id: 'dt1',
            startAt: '2026-05-16T08:00:00Z',
            endAt: '2026-05-16T10:00:00Z',
            targetType: 'project',
            targetId: 'p1',
            allocationSegmentIds: ['a1', 'a2'],
            locationTruthSegmentIds: ['l1'],
            title: 'Projekt A',
          },
        ],
      },
    });
    expect(t.blockLineage).toHaveLength(1);
    expect(t.blockLineage[0].displayBlockId).toBe('dt1');
    expect(t.blockLineage[0].allocationSegmentIds).toEqual(['a1', 'a2']);
  });

  it('falls back to legacy rcBlocks when no V2 blocks', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: {
        reportCandidateBlocks: [
          { id: 'rc1', startAt: '2026-05-16T08:00:00Z', endAt: '2026-05-16T09:00:00Z' },
        ],
      },
    });
    expect(t.blockLineage).toHaveLength(1);
    expect(t.blockLineage[0].ganttBlockId).toBe('rc1');
    expect(t.blockLineage[0].source).toBe('reportCandidate');
  });

  it('adds raw GPS debug snapshot + suspected problems', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: {
        rawGpsTimeline: { rawPingCount: 0 },
        summary: { activeTimer: { startedAt: '2026-05-16T00:00:00Z', stoppedAt: null } },
      },
      rawPingDebug: {
        rawPingCount: 120,
        firstRawPingAt: '2026-05-16T06:00:00Z',
        lastRawPingAt: '2026-05-16T15:00:00Z',
        maxRawPingGapMinutes: 12,
        medianAccuracy: 18,
        p90Accuracy: 40,
        missingFromReportList: true,
      },
    });
    expect(t.summary.rawDebug.available).toBe(true);
    expect(t.summary.rawDebug.rawPingCount).toBe(120);
    expect(t.summary.rawDebug.hasRawPingsButNoLocationTruth).toBe(true);
    expect(t.summary.rawDebug.hasRawPingsButNoDisplayBlocks).toBe(true);
    expect(t.summary.rawDebug.hasRawPingsButMissingFromReportList).toBe(true);
    const keys = t.suspectedProblems.map((p) => p.key);
    expect(keys).toContain('raw_pings_exist_but_no_location_truth');
    expect(keys).toContain('raw_pings_exist_but_no_display_blocks');
    expect(keys).toContain('raw_pings_exist_but_staff_missing_from_report');
  });

  it('flags stale_timer_but_no_same_day_pings when raw debug has 0 pings', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: {
        summary: { activeTimer: { startedAt: '2026-05-16T00:00:00Z', stoppedAt: null } },
      },
      rawPingDebug: {
        rawPingCount: 0,
        firstRawPingAt: null,
        lastRawPingAt: null,
        maxRawPingGapMinutes: null,
        medianAccuracy: null,
        p90Accuracy: null,
      },
    });
    expect(t.suspectedProblems.some((p) => p.key === 'stale_timer_but_no_same_day_pings')).toBe(true);
  });

  it('exposes empty batteryDiagnostics when no input provided', () => {
    const t = buildTimeEngineFlowTrace({ ...baseInput, presenceResponse: null });
    expect(t.summary.batteryDiagnostics.hasBatteryData).toBe(false);
    expect(t.summary.batteryDiagnostics.signalLossBannerText).toBeNull();
    expect(t.decisionTrace).toEqual([]);
    expect(t.suspectedProblems.some((p) => p.key === 'battery_low_before_signal_loss')).toBe(false);
  });

  it('flags battery_low_before_signal_loss when last ping <=10% and gap > 30 min', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: { rawGpsTimeline: { rawPingCount: 50 } },
      rawPingDebug: {
        rawPingCount: 50,
        firstRawPingAt: '2026-05-16T08:00:00Z',
        lastRawPingAt: '2026-05-16T12:04:00Z',
        maxRawPingGapMinutes: 120,
        medianAccuracy: 10,
        p90Accuracy: 25,
      },
      batteryDiagnostics: {
        hasBatteryData: true,
        firstBatteryPercent: 80,
        lastBatteryPercent: 4,
        minBatteryPercent: 4,
        latestIsCharging: false,
        batterySamplesCount: 30,
        missingBatterySamplesCount: 0,
        likelyBatteryRelatedSignalLoss: true,
        batteryDroppedFast: true,
        lastPingBeforeLargeGap: {
          recordedAt: '2026-05-16T12:04:00Z',
          batteryPercent: 4,
          isCharging: false,
          gapAfterMinutes: 120,
        },
      },
    });
    expect(t.summary.batteryDiagnostics.hasBatteryData).toBe(true);
    expect(t.summary.batteryDiagnostics.signalLossBannerText).toContain('12:04');
    expect(t.summary.batteryDiagnostics.signalLossBannerText).toContain('4 %');
    expect(t.summary.batteryDiagnostics.signalLossBannerText).toContain('nej');
    expect(t.suspectedProblems.some((p) => p.key === 'battery_low_before_signal_loss')).toBe(true);
    const dt = t.decisionTrace.find((d) => d.decision === 'battery_signal_loss_candidate');
    expect(dt?.confidence).toBe('medium');
    expect(dt?.warnings).toContain('low_battery_before_signal_gap');
  });

  it('does not flag battery_low_before_signal_loss when battery is healthy', () => {
    const t = buildTimeEngineFlowTrace({
      ...baseInput,
      presenceResponse: { rawGpsTimeline: { rawPingCount: 50 } },
      rawPingDebug: {
        rawPingCount: 50,
        firstRawPingAt: '2026-05-16T08:00:00Z',
        lastRawPingAt: '2026-05-16T17:00:00Z',
        maxRawPingGapMinutes: 5,
        medianAccuracy: 10,
        p90Accuracy: 20,
      },
      batteryDiagnostics: {
        hasBatteryData: true,
        firstBatteryPercent: 90,
        lastBatteryPercent: 65,
        minBatteryPercent: 65,
        latestIsCharging: false,
        batterySamplesCount: 40,
        missingBatterySamplesCount: 0,
        likelyBatteryRelatedSignalLoss: false,
        batteryDroppedFast: false,
      },
    });
    expect(t.suspectedProblems.some((p) => p.key === 'battery_low_before_signal_loss')).toBe(false);
    expect(t.summary.batteryDiagnostics.signalLossBannerText).toBeNull();
  });
});
