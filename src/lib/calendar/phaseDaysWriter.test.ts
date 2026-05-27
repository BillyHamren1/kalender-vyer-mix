import { describe, expect, it } from 'vitest';
import { planPhaseDayWrites } from './phaseDaysWriter';

describe('planPhaseDayWrites — pure helper', () => {
  it('returns one spec per unique date, sorted, with only first marked', () => {
    const specs = planPhaseDayWrites(
      ['2026-06-20', '2026-06-18', '2026-06-19'],
      '08:00',
      '17:00',
    );
    expect(specs).toHaveLength(3);
    expect(specs.map((s) => s.date)).toEqual([
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
    ]);
    expect(specs[0].isFirst).toBe(true);
    expect(specs[1].isFirst).toBe(false);
    expect(specs[2].isFirst).toBe(false);
  });

  it('builds ISO start/end per date from HH:MM input', () => {
    const [first] = planPhaseDayWrites(['2026-06-18'], '08:30', '17:15');
    expect(first.startISO).toBe('2026-06-18T08:30:00Z');
    expect(first.endISO).toBe('2026-06-18T17:15:00Z');
  });

  it('dedupes duplicate dates and skips invalid/empty strings', () => {
    const specs = planPhaseDayWrites(
      ['2026-06-18', '2026-06-18', '', 'not-a-date', '2026-06-19'],
      '08:00',
      '17:00',
    );
    expect(specs.map((s) => s.date)).toEqual(['2026-06-18', '2026-06-19']);
  });

  it('returns empty array when no valid dates supplied', () => {
    expect(planPhaseDayWrites([], '08:00', '17:00')).toEqual([]);
    expect(planPhaseDayWrites(['', 'bad'], '08:00', '17:00')).toEqual([]);
  });

  it('GUARD: when user passes 3 dates we MUST emit 3 specs — regression for "bara EN dag sparas"', () => {
    const specs = planPhaseDayWrites(
      ['2026-06-18', '2026-06-19', '2026-06-20'],
      '08:00',
      '17:00',
    );
    expect(specs).toHaveLength(3);
    // Tidigare bugg: bara dates[0] sparades. Vi måste få ut alla tre.
    expect(specs.filter((s) => s.isFirst)).toHaveLength(1);
    expect(specs.filter((s) => !s.isFirst)).toHaveLength(2);
  });
});
