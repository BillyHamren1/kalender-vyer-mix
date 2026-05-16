import { describe, it, expect } from 'vitest';
import {
  buildReportDataGapDiagnosis,
  type ReportDataGapInput,
} from '../reportDataGapDiagnostics';

function base(overrides: Partial<ReportDataGapInput> = {}): ReportDataGapInput {
  return {
    staffId: 's1',
    staffName: 'Test Testsson',
    date: '2026-05-16',
    rawPings: {
      rawPingCount: 100,
      firstRawPingAt: '2026-05-16T06:00:00Z',
      lastRawPingAt: '2026-05-16T15:00:00Z',
      maxRawGapMinutes: 5,
    },
    appHealth: null,
    reportChain: { isShownInReportList: true },
    ...overrides,
  };
}

describe('buildReportDataGapDiagnosis', () => {
  it('returnerar ok när allt ser rimligt ut', () => {
    const d = buildReportDataGapDiagnosis(base());
    expect(d.status).toBe('ok');
    expect(d.suggestedNextAction).toBe('none');
  });

  it('flaggar raw_pings_missing när det inte finns några pings och appen inte heller setts', () => {
    const d = buildReportDataGapDiagnosis(base({
      rawPings: { rawPingCount: 0, firstRawPingAt: null, lastRawPingAt: null, maxRawGapMinutes: null },
    }));
    expect(d.status).toBe('raw_pings_missing');
    expect(d.severity).toBe('warning');
  });

  it('föredrar app_seen_but_no_gps när appen sågs men inga pings finns', () => {
    const d = buildReportDataGapDiagnosis(base({
      rawPings: { rawPingCount: 0, firstRawPingAt: null, lastRawPingAt: null, maxRawGapMinutes: null },
      appHealth: { lastAppSeenAt: '2026-05-16T12:00:00Z', lastHealthEventType: 'app_foreground' },
    }));
    expect(d.status).toBe('app_seen_but_no_gps');
    expect(d.suggestedNextAction).toBe('check_phone_permissions');
  });

  it('flaggar staff_missing_from_report som critical när pings finns men staff saknas i listan', () => {
    const d = buildReportDataGapDiagnosis(base({
      reportChain: { isShownInReportList: false },
    }));
    expect(d.status).toBe('staff_missing_from_report');
    expect(d.severity).toBe('critical');
  });

  it('flaggar pings_exist_but_no_location_truth', () => {
    const d = buildReportDataGapDiagnosis(base({
      reportChain: { isShownInReportList: true, locationTruthSegmentCount: 0 },
    }));
    expect(d.status).toBe('pings_exist_but_no_location_truth');
  });

  it('flaggar location_truth_exists_but_no_display_blocks', () => {
    const d = buildReportDataGapDiagnosis(base({
      reportChain: {
        isShownInReportList: true,
        locationTruthSegmentCount: 4,
        displayTimelineBlocksV2Count: 0,
      },
    }));
    expect(d.status).toBe('location_truth_exists_but_no_display_blocks');
  });

  it('flaggar display_blocks_exist_but_no_gantt_blocks', () => {
    const d = buildReportDataGapDiagnosis(base({
      reportChain: {
        isShownInReportList: true,
        locationTruthSegmentCount: 4,
        displayTimelineBlocksV2Count: 3,
        renderedGanttBlocks: 0,
      },
    }));
    expect(d.status).toBe('display_blocks_exist_but_no_gantt_blocks');
  });

  it('flaggar stale_timer_created_empty_day när öppen timer från 00:00 ger högt uncovered', () => {
    const d = buildReportDataGapDiagnosis(base({
      reportChain: {
        isShownInReportList: true,
        staleOpenTimer: true,
        effectiveWorkdayStartAt: '2026-05-16T00:00:00Z',
        uncoveredWorkdayMinutes: 600,
        locationTruthSegmentCount: 0,
      },
    }));
    expect(d.status).toBe('stale_timer_created_empty_day');
    expect(d.suggestedNextAction).toBe('fix_stale_timer');
  });

  it('flaggar app_seen_but_no_gps när appen syns efter sista ping', () => {
    const d = buildReportDataGapDiagnosis(base({
      rawPings: {
        rawPingCount: 10,
        firstRawPingAt: '2026-05-16T06:00:00Z',
        lastRawPingAt: '2026-05-16T10:00:00Z',
        maxRawGapMinutes: 5,
      },
      appHealth: {
        lastAppSeenAt: '2026-05-16T13:00:00Z',
        lastHealthEventType: 'app_background',
      },
    }));
    expect(d.status).toBe('app_seen_but_no_gps');
  });

  it('flaggar likely_battery_signal_loss när låg batteri före gap', () => {
    const d = buildReportDataGapDiagnosis(base({
      rawPings: {
        rawPingCount: 30,
        firstRawPingAt: '2026-05-16T06:00:00Z',
        lastRawPingAt: '2026-05-16T11:00:00Z',
        maxRawGapMinutes: 120,
        lowBatteryBeforeGap: true,
        lastBatteryPercent: 4,
      },
    }));
    expect(d.status).toBe('likely_battery_signal_loss');
  });

  it('exponerar alltid metrics oavsett status', () => {
    const d = buildReportDataGapDiagnosis(base());
    expect(d.metrics.rawPingCount).toBe(100);
    expect(d.metrics.lastRawPingAt).toBe('2026-05-16T15:00:00Z');
  });
});
