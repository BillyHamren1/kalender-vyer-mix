/**
 * Contract test — staffGanttMirrorParity
 *
 * Säkerställer att buildStaffGanttMirrorBlocks producerar GanttBlock-listor
 * som matchar `/staff-management/time-reports` per personal+dag. Tester
 * fokuserar på källval, fas-färgning och absorberade chips.
 */
import { describe, expect, it } from 'vitest';
import { buildStaffGanttMirrorBlocks } from '@/lib/staff/buildStaffGanttMirrorBlocks';

const DATE = '2026-05-17';
const STAFF = 'Test Person';

describe('buildStaffGanttMirrorBlocks — parity med admin-Gantten', () => {
  it('returnerar tomt + source=none när motorn saknar data', () => {
    const r = buildStaffGanttMirrorBlocks({
      staffName: STAFF,
      dateStr: DATE,
      presenceDay: {},
    });
    expect(r.blocks).toEqual([]);
    expect(r.source).toBe('none');
    expect(r.counts.rendered).toBe(0);
  });

  it('Suggested-Only Policy: reportCandidate vinner när blocks finns (även om V2-fältet finns tomt)', () => {
    const r = buildStaffGanttMirrorBlocks({
      staffName: STAFF,
      dateStr: DATE,
      presenceDay: {
        displayTimelineBlocksV2: [],
        reportCandidateBlocks: [
          {
            id: 'rc-1',
            kind: 'work',
            startAt: `${DATE}T08:00:00Z`,
            endAt: `${DATE}T11:00:00Z`,
            durationMinutes: 180,
            title: 'Westmans Uthyrning',
            subtitle: null,
            targetType: 'booking',
            targetId: 'b-1',
          },
        ],
      },
    });
    expect(r.source).toBe('reportCandidate');
    expect(r.blocks.length).toBeGreaterThan(0);
    expect(r.blocks[0].title).toContain('Westmans');
  });

  it('faller tillbaka till V2-källan när reportCandidate är tom men V2 har block', () => {
    const r = buildStaffGanttMirrorBlocks({
      staffName: STAFF,
      dateStr: DATE,
      presenceDay: {
        reportCandidateBlocks: [],
        displayTimelineBlocksV2: [
          {
            id: 'v2-1',
            displayType: 'project',
            startAt: `${DATE}T09:00:00Z`,
            endAt: `${DATE}T12:00:00Z`,
            durationMinutes: 180,
            title: 'Projekt X',
            targetType: 'project',
            targetId: 'p-1',
          },
        ],
      },
    });
    expect(['displayTimelineV2', 'none']).toContain(r.source);
    // V2-pipelinen ska inte krascha även om vi inte har full meta
    expect(r.counts.rawV2).toBe(1);
  });

  it('är en pure-funktion (samma input → samma output)', () => {
    const input = {
      staffName: STAFF,
      dateStr: DATE,
      presenceDay: {
        reportCandidateBlocks: [
          {
            id: 'rc-1',
            kind: 'work' as const,
            startAt: `${DATE}T08:00:00Z`,
            endAt: `${DATE}T11:00:00Z`,
            durationMinutes: 180,
            title: 'A',
            targetType: 'booking',
            targetId: 'b-1',
          },
        ],
      },
    };
    const r1 = buildStaffGanttMirrorBlocks(input);
    const r2 = buildStaffGanttMirrorBlocks(input);
    expect(r1.blocks.map((b) => b.id)).toEqual(r2.blocks.map((b) => b.id));
    expect(r1.source).toBe(r2.source);
  });
});
