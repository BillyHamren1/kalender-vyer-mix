import { describe, it, expect } from 'vitest';
import { resolveGanttBlockTitle } from '@/lib/staff/resolveGanttBlockTitle';
import type { ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

const base = (overrides: Partial<ReportCandidateBlockUI> = {}): ReportCandidateBlockUI => ({
  id: 'x',
  kind: 'work',
  startAt: '2026-05-12T08:00:00Z',
  endAt: '2026-05-12T14:00:00Z',
  durationMinutes: 360,
  title: '',
  confidence: 'medium',
  reviewState: 'ok',
  ...overrides,
});

describe('resolveGanttBlockTitle', () => {
  it('uses targetLabel when title is generic Rigg', () => {
    expect(
      resolveGanttBlockTitle(base({ title: 'RIGG', targetLabel: 'Swedish Game Fair' })),
    ).toBe('Swedish Game Fair');
  });

  it('falls back to FA Warehouse when warehouse evidence and no name', () => {
    expect(resolveGanttBlockTitle(base({ title: '', subtitle: 'FA Warehouse · 06:55' }))).toBe(
      'FA Warehouse',
    );
  });

  it('keeps a real project title', () => {
    expect(resolveGanttBlockTitle(base({ title: 'Bergman Event AB' }))).toBe('Bergman Event AB');
  });

  it('falls back to "Arbete – okänd plats" for nameless work', () => {
    expect(resolveGanttBlockTitle(base({ title: 'Arbete' }))).toBe('Arbete – okänd plats');
  });

  it('uses Resa for transport without label', () => {
    expect(resolveGanttBlockTitle(base({ kind: 'transport', title: '' }))).toBe('Resa');
  });

  it('prefers displayTitle over targetLabel', () => {
    expect(
      resolveGanttBlockTitle(
        Object.assign(base({ targetLabel: 'Loc' }), { displayTitle: 'GOPA' }),
      ),
    ).toBe('GOPA');
  });
});
