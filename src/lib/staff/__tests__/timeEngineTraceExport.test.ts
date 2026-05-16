import { describe, it, expect } from 'vitest';
import {
  buildTimeEngineTraceExport,
  type BuildTraceExportInput,
} from '../timeEngineTraceExport';

function baseInput(over: Partial<BuildTraceExportInput> = {}): BuildTraceExportInput {
  return {
    exportedAt: '2026-05-16T12:00:00Z',
    organizationId: 'org1',
    date: '2026-05-16',
    timezone: 'Europe/Stockholm',
    staffSeeds: [
      { staffId: 's1', staffName: 'Anna', appearsInReportList: true },
    ],
    reportCandidateByStaff: {
      s1: {
        blocks: [{ id: 'b1' }],
        displayTimelineBlocksV2: [{ id: 'd1', lane: 'main' }],
        displayTimelineDiagnosticsV2: { ok: true, locationTruthSegments: [{ id: 'lt1' }] },
        workdayAllocationSegments: [{ id: 'w1' }],
        workdayAllocationDiagnostics: { uncoveredWorkdayMinutes: 0 },
      },
    },
    rawPings: {
      summary: {} as any,
      diagnostics: {} as any,
      perStaff: [
        {
          staffId: 's1',
          staffName: 'Anna',
          pingCount: 3,
          firstRecordedAt: '2026-05-16T06:00:00Z',
          lastRecordedAt: '2026-05-16T15:00:00Z',
          firstCreatedAt: null,
          lastCreatedAt: null,
          minAccuracy: 5,
          medianAccuracy: 8,
          p90Accuracy: 20,
          maxAccuracy: 50,
          averagePingGapMinutes: 30,
          maxPingGapMinutes: 30,
          gapCountOver15Min: 1,
          gapCountOver60Min: 0,
          hasPingsBeforeWorkdayLikely: false,
          hasPingsAfterWorkdayLikely: false,
          sampleRows: [
            { id: 'p2', staff_id: 's1', recorded_at: '2026-05-16T08:00:00Z', created_at: null, latitude: 59, longitude: 18, accuracy: 5, speed_mps: 0, time_report_id: null, battery_level: null, battery_percent: 80, is_charging: false, battery_captured_at: null, battery_source: 'capacitor' },
            { id: 'p1', staff_id: 's1', recorded_at: '2026-05-16T06:00:00Z', created_at: null, latitude: 59, longitude: 18, accuracy: 5, speed_mps: 0, time_report_id: null, battery_level: null, battery_percent: 90, is_charging: true, battery_captured_at: null, battery_source: 'capacitor' },
          ],
        },
      ],
    },
    ganttDiagnosticsByStaff: {
      s1: {
        selectedSource: 'displayTimelineV2',
        rawV2: 1,
        mappedV2: 1,
        rawAllocation: 1,
        mappedAllocation: 1,
        legacyCount: 1,
        renderedCount: 1,
        renderedBlocks: [
          { id: 'g1', kind: 'work', startAt: '2026-05-16T06:00:00Z', endAt: '2026-05-16T08:00:00Z', durationMinutes: 120, title: 'Site', subtitle: null, isOpen: false },
        ],
        visualDiagnostics: null,
        sourceCounts: { rawV2: 1, mappedV2: 1, rawAlloc: 1, mappedAlloc: 1, legacy: 1, rendered: 1 },
      },
    },
    ...over,
  };
}

describe('buildTimeEngineTraceExport', () => {
  it('bygger ok-export utan findings när allt är synkat', () => {
    const exp = buildTimeEngineTraceExport(baseInput());
    expect(exp.staff).toHaveLength(1);
    expect(exp.staff[0].staffName).toBe('Anna');
    expect(exp.staff[0].diffFindings).toHaveLength(0);
    expect(exp.summary.totalStaff).toBe(1);
    expect(exp.summary.staffWithRawPings).toBe(1);
  });

  it('sorterar pings ascending och respekterar maxRowsPerStaff med truncated-flagga', () => {
    const input = baseInput({ maxRowsPerStaff: 1 });
    const exp = buildTimeEngineTraceExport(input);
    expect(exp.staff[0].rawPings.rows).toHaveLength(1);
    expect(exp.staff[0].rawPings.rows[0].id).toBe('p1'); // tidigast
    expect(exp.staff[0].rawPings.truncated).toBe(true);
    // totalCountBeforeLimit speglar verkligt pingCount (3), inte sampleRows.length (2)
    expect(exp.staff[0].rawPings.totalCountBeforeLimit).toBe(3);
    expect(exp.summary.rawPingsTruncatedStaffCount).toBe(1);
    expect(exp.summary.rawPingsTruncatedTotalMissingRows).toBe(2);
  });

  it('flaggar truncated när Edge Function-flaggan rowsTruncated=true även om vi inte kapar lokalt', () => {
    const input = baseInput();
    // Simulera EF som returnerade 2 sampleRows men säger pingCount=12000 + rowsTruncated.
    input.rawPings!.perStaff[0].pingCount = 12000;
    (input.rawPings!.perStaff[0] as any).rowsTruncated = true;
    (input.rawPings!.perStaff[0] as any).totalPingCount = 12000;
    (input.rawPings!.perStaff[0] as any).sampleRowsCount = 2;
    (input.rawPings!.perStaff[0] as any).maxRowsPerStaffApplied = 10000;
    const exp = buildTimeEngineTraceExport(input);
    expect(exp.staff[0].rawPings.truncated).toBe(true);
    expect(exp.staff[0].rawPings.totalCountBeforeLimit).toBe(12000);
    expect(exp.summary.rawPingsTruncatedStaffCount).toBe(1);
  });

  it('flaggar inte truncated när alla pings ryms (pingCount matchar sampleRows)', () => {
    const exp = buildTimeEngineTraceExport(baseInput());
    // baseInput: pingCount=3 men bara 2 sampleRows → blir truncated (mer pings än rader).
    expect(exp.staff[0].rawPings.truncated).toBe(true);
    expect(exp.staff[0].rawPings.totalCountBeforeLimit).toBe(3);
  });

  it('propagerar rawPingsHardCapReached + warnings från Edge Function diagnostics', () => {
    const input = baseInput();
    input.rawPings!.diagnostics = {
      paginationUsed: { pageSize: 1000, pageCount: 50, truncated: true },
      warnings: ['row_hard_cap_50000_reached'],
    } as any;
    const exp = buildTimeEngineTraceExport(input);
    expect(exp.summary.rawPingsHardCapReached).toBe(true);
    expect(exp.summary.rawPingsWarnings).toContain('row_hard_cap_50000_reached');
  });

  it('inkluderar staff som har raw pings men saknas i rapportlistan + flaggar critical finding', () => {
    const input = baseInput({
      staffSeeds: [], // tom rapportlista
    });
    const exp = buildTimeEngineTraceExport(input);
    expect(exp.staff).toHaveLength(1);
    expect(exp.staff[0].comparison.appearsInReportList).toBe(false);
    const types = exp.staff[0].diffFindings.map(f => f.type);
    expect(types).toContain('staff_has_pings_but_missing_from_report');
    expect(exp.summary.staffMissingFromReport).toBe(1);
    expect(exp.summary.criticalFindings).toBeGreaterThan(0);
  });

  it('flaggar raw_pings_missing när inga pings finns', () => {
    const input = baseInput({ rawPings: { summary: {} as any, diagnostics: {} as any, perStaff: [] } });
    const exp = buildTimeEngineTraceExport(input);
    expect(exp.staff[0].rawPings.count).toBe(0);
    expect(exp.staff[0].diffFindings.map(f => f.type)).toContain('raw_pings_missing');
  });

  it('flaggar display_exists_but_no_gantt när V2 finns men Gantt är tom', () => {
    const input = baseInput({
      ganttDiagnosticsByStaff: {
        s1: {
          selectedSource: null,
          rawV2: 1, mappedV2: 1, rawAllocation: 0, mappedAllocation: 0, legacyCount: 0,
          renderedCount: 0, renderedBlocks: [], visualDiagnostics: null,
          sourceCounts: { rawV2: 1, mappedV2: 1, rawAlloc: 0, mappedAlloc: 0, legacy: 0, rendered: 0 },
        },
      },
    });
    const exp = buildTimeEngineTraceExport(input);
    const types = exp.staff[0].diffFindings.map(f => f.type);
    expect(types).toContain('display_exists_but_no_gantt');
  });

  it('upptäcker stale_timer_created_large_empty_day', () => {
    const input = baseInput({
      reportCandidateByStaff: {
        s1: {
          blocks: [],
          displayTimelineBlocksV2: [],
          workdayAllocationSegments: [],
          workdayAllocationDiagnostics: {
            uncoveredWorkdayMinutes: 600,
            effectiveWorkdayStartAt: '2026-05-16T00:00:00Z',
          },
        },
      },
    });
    const exp = buildTimeEngineTraceExport(input);
    const types = exp.staff[0].diffFindings.map(f => f.type);
    expect(types).toContain('stale_timer_created_large_empty_day');
    expect(exp.staff[0].comparison.staleTimerSuspected).toBe(true);
  });
});
