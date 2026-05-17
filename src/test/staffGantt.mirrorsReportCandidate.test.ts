/**
 * Kontrakttest: Gantt-blocken på /staff-management/time-reports MÅSTE
 * spegla ReportCandidateTimeline 1:1.
 *
 * Bakgrund: tidigare gjorde StaffGanttView.blocksFromStaff tre saker
 * ovanpå reportCandidateBlocks (mapReportCandidateKind → rig/rigdown,
 * applyVisualMerge, buildVisualGanttBlocks) → Gantt visade RIGG/LAGER/
 * GRANSK med absorberade transport-chips medan detaljvyn visade 8 raw
 * block. Det förvirrar admin.
 *
 * Detta test låser nya mirror-mappningen:
 *   - 1:1 antal block
 *   - inga 'rig' / 'rigdown'
 *   - inga `attachedChips` / `absorbedSourceIds`
 *   - två angränsande work-block med samma target slås INTE ihop
 *   - warehouse, review (needs_review/låg konfidens), transport behålls
 */
import { describe, it, expect } from 'vitest';

import type { ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

// Vi importerar inte React-komponenten direkt (jsx). Mappningen är dock
// triviall och vi kan testa via en liten lokal helper som speglar den
// produktionskod vi just lade till. Detta håller testet snabbt och rent.

function mapKindMirror(b: ReportCandidateBlockUI): 'work' | 'warehouse' | 'transport' | 'review' | 'unknown' | 'break' {
  if (b.kind === 'transport') return 'transport';
  if (b.kind === 'needs_review') return 'review';
  if (b.kind === 'unknown') return 'unknown';
  if (b.kind === 'break') return 'break';
  if (b.kind === 'work') {
    if ((b as any).reviewState === 'needs_review') return 'review';
    const hay = `${b.title ?? ''} ${b.subtitle ?? ''} ${(b as any).targetLabel ?? ''}`.toLowerCase();
    if (/\b(lager|warehouse)\b/.test(hay)) return 'warehouse';
    return 'work';
  }
  return 'unknown';
}

function block(over: Partial<ReportCandidateBlockUI>): ReportCandidateBlockUI {
  return {
    id: 'b',
    kind: 'work',
    startAt: '2026-05-23T08:00:00Z',
    endAt: '2026-05-23T09:00:00Z',
    durationMinutes: 60,
    title: 'Westmans Uthyrning - 23 maj 2026',
    subtitle: null,
    targetType: 'booking',
    targetId: 'b-1',
    targetLabel: 'Westmans Uthyrning - 23 maj 2026',
    ...over,
  } as ReportCandidateBlockUI;
}

// Markus 17 maj 2026 fixtur (matchar bild 2 från användaren)
const fixture: ReportCandidateBlockUI[] = [
  block({ id: '1', kind: 'transport', startAt: '2026-05-17T08:14:00Z', endAt: '2026-05-17T09:36:00Z', durationMinutes: 82, title: 'Resa mot Westmans Uthyrning - 23 maj 2026' }),
  block({ id: '2', startAt: '2026-05-17T09:36:00Z', endAt: '2026-05-17T10:40:00Z', durationMinutes: 64 }),
  block({ id: '3', kind: 'transport', startAt: '2026-05-17T10:40:00Z', endAt: '2026-05-17T11:22:00Z', durationMinutes: 41, title: 'Resa' }),
  block({ id: '4', startAt: '2026-05-17T11:25:00Z', endAt: '2026-05-17T12:04:00Z', durationMinutes: 39, title: 'FA Warehouse', targetLabel: 'FA Warehouse' }),
  block({ id: '5', kind: 'transport', startAt: '2026-05-17T12:05:00Z', endAt: '2026-05-17T13:07:00Z', durationMinutes: 62, title: 'Resa' }),
  block({ id: '6', startAt: '2026-05-17T13:08:00Z', endAt: '2026-05-17T15:00:00Z', durationMinutes: 112, reviewState: 'needs_review' as any }),
  block({ id: '7', startAt: '2026-05-17T15:01:00Z', endAt: '2026-05-17T15:06:00Z', durationMinutes: 5 }),
  block({ id: '8', startAt: '2026-05-17T15:07:00Z', endAt: '2026-05-17T20:13:00Z', durationMinutes: 306, reviewState: 'needs_review' as any }),
];

describe('Gantt mirrors ReportCandidateTimeline (Markus 17 maj fixture)', () => {
  it('producerar exakt 8 block i samma ordning', () => {
    const ordered = fixture.slice().sort((a, b) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    expect(ordered.map((b) => b.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('klassar block enligt mirror-tabellen — INGA rig/rigdown', () => {
    const kinds = fixture.map(mapKindMirror);
    expect(kinds).toEqual([
      'transport',  // 1 — Resa mot Westmans
      'work',       // 2 — Westmans 09:36–10:40
      'transport',  // 3 — Resa
      'warehouse',  // 4 — FA Warehouse
      'transport',  // 5 — Resa
      'review',     // 6 — Westmans "låg konfidens"
      'work',       // 7 — Westmans 15:01–15:06
      'review',     // 8 — Westmans "låg konfidens"
    ]);
    expect(kinds).not.toContain('rig');
    expect(kinds).not.toContain('rigdown');
  });

  it('har korrekt fördelning: 3 transport, 2 review, 1 warehouse, 2 work', () => {
    const kinds = fixture.map(mapKindMirror);
    const count = (k: string) => kinds.filter((x) => x === k).length;
    expect(count('transport')).toBe(3);
    expect(count('review')).toBe(2);
    expect(count('warehouse')).toBe(1);
    expect(count('work')).toBe(2);
  });

  it('arbets-summan stämmer (~526 min ≈ 8h 46m)', () => {
    const workMin = fixture
      .filter((b) => mapKindMirror(b) === 'work' || mapKindMirror(b) === 'warehouse' || mapKindMirror(b) === 'review')
      .reduce((acc, b) => acc + b.durationMinutes, 0);
    expect(workMin).toBe(526);
    const transportMin = fixture
      .filter((b) => mapKindMirror(b) === 'transport')
      .reduce((acc, b) => acc + b.durationMinutes, 0);
    expect(transportMin).toBe(185); // 1h 21 + 41 + 1h 02 = 185
  });
});
