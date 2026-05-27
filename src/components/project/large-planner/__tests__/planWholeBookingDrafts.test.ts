import { describe, it, expect } from 'vitest';
import { planPhaseDayWrites } from '@/lib/calendar/phaseDaysWriter';

/**
 * Kontraktstest för det nya "Planera hela bokningen"-flödet.
 *
 * Bakgrund: tidigare skrev sheeten direkt till DB vid datumändring, och
 * planeringen tappade alla dagar utom första. Den nya kontrakten:
 *  - Sheeten håller drafts.{rig,event,rigDown} lokalt.
 *  - Planera-knappen committar utkastet via savePhaseDays (alla dagar).
 *  - Planner-items skapas för VARJE datum i utkastet, inte bara dates[0].
 *
 * Vi testar transformeringen användaren ser: 3 valda dagar → 3 specs → 3
 * planner-items. Vi simulerar reducer-logiken som finns i
 * LargeProjectPlannerPanel.handlePlanWholeBooking utan att rendera React.
 */

interface PhaseDraft {
  dates: string[];
  startTime: string;
  endTime: string;
}

interface Selection {
  rig: boolean;
  event: boolean;
  rigDown: boolean;
  createProductTodos: boolean;
  drafts: { rig: PhaseDraft; event: PhaseDraft; rigDown: PhaseDraft };
}

/** Speglar reducer-delen i LargeProjectPlannerPanel.handlePlanWholeBooking. */
function planPhaseItemsFromSelection(
  selection: Selection,
): Array<{ phase: 'rig' | 'event' | 'rigDown'; date: string; start: string; end: string }> {
  const phases = [
    { phase: 'rig' as const, enabled: selection.rig, draft: selection.drafts.rig },
    { phase: 'event' as const, enabled: selection.event, draft: selection.drafts.event },
    { phase: 'rigDown' as const, enabled: selection.rigDown, draft: selection.drafts.rigDown },
  ];
  const out: Array<{ phase: 'rig' | 'event' | 'rigDown'; date: string; start: string; end: string }> = [];
  for (const ph of phases) {
    if (!ph.enabled) continue;
    for (const date of ph.draft.dates) {
      out.push({ phase: ph.phase, date, start: ph.draft.startTime, end: ph.draft.endTime });
    }
  }
  return out;
}

describe('Planera hela bokningen — draft commit', () => {
  it('REGRESSION: 3 valda rigg-dagar genererar 3 calendar_events-specs (ej bara första)', () => {
    const drafts: Selection['drafts'] = {
      rig: { dates: ['2026-06-17', '2026-06-18', '2026-06-19'], startTime: '08:00', endTime: '17:00' },
      event: { dates: [], startTime: '08:00', endTime: '17:00' },
      rigDown: { dates: [], startTime: '08:00', endTime: '17:00' },
    };
    const specs = planPhaseDayWrites(drafts.rig.dates, drafts.rig.startTime, drafts.rig.endTime);
    expect(specs.map((s) => s.date)).toEqual(['2026-06-17', '2026-06-18', '2026-06-19']);
    expect(specs.filter((s) => s.isFirst)).toHaveLength(1);
  });

  it('REGRESSION: 3 dagar i utkastet → 3 planner-items skapas (ej dates[0])', () => {
    const selection: Selection = {
      rig: true,
      event: false,
      rigDown: false,
      createProductTodos: false,
      drafts: {
        rig: { dates: ['2026-06-17', '2026-06-18', '2026-06-19'], startTime: '08:00', endTime: '17:00' },
        event: { dates: [], startTime: '08:00', endTime: '17:00' },
        rigDown: { dates: [], startTime: '08:00', endTime: '17:00' },
      },
    };
    const items = planPhaseItemsFromSelection(selection);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.date)).toEqual(['2026-06-17', '2026-06-18', '2026-06-19']);
    expect(items.every((i) => i.phase === 'rig')).toBe(true);
  });

  it('inaktiverade faser hoppas över även om de har datum i utkastet', () => {
    const selection: Selection = {
      rig: false,
      event: true,
      rigDown: false,
      createProductTodos: false,
      drafts: {
        rig: { dates: ['2026-06-17'], startTime: '08:00', endTime: '17:00' },
        event: { dates: ['2026-06-22', '2026-06-23'], startTime: '10:00', endTime: '22:00' },
        rigDown: { dates: ['2026-06-27'], startTime: '08:00', endTime: '17:00' },
      },
    };
    const items = planPhaseItemsFromSelection(selection);
    expect(items.map((i) => `${i.phase}:${i.date}`)).toEqual([
      'event:2026-06-22',
      'event:2026-06-23',
    ]);
    expect(items[0].start).toBe('10:00');
    expect(items[0].end).toBe('22:00');
  });

  it('alla tre faser aktiva med flera dagar genererar items över alla', () => {
    const selection: Selection = {
      rig: true,
      event: true,
      rigDown: true,
      createProductTodos: false,
      drafts: {
        rig: { dates: ['2026-06-17', '2026-06-18'], startTime: '08:00', endTime: '17:00' },
        event: { dates: ['2026-06-22'], startTime: '10:00', endTime: '23:00' },
        rigDown: { dates: ['2026-06-27', '2026-06-28'], startTime: '08:00', endTime: '17:00' },
      },
    };
    const items = planPhaseItemsFromSelection(selection);
    expect(items).toHaveLength(5);
    expect(items.filter((i) => i.phase === 'rig')).toHaveLength(2);
    expect(items.filter((i) => i.phase === 'event')).toHaveLength(1);
    expect(items.filter((i) => i.phase === 'rigDown')).toHaveLength(2);
  });
});
