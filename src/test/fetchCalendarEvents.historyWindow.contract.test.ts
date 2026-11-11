import { describe, expect, it } from 'vitest';
import { resolveCalendarWindow } from '../services/eventService';

describe('personalkalenderns datumfönster', () => {
  it('centrerar fönstret kring datumet användaren tittar på', () => {
    const anchor = new Date('2024-03-15T00:00:00Z');
    const { windowFrom, windowTo } = resolveCalendarWindow({ anchorDate: anchor });

    expect(windowFrom < '2024-03-15').toBe(true);
    expect(windowTo > '2024-03-15').toBe(true);
    // Två år bakåt ska ge ett fönster som faktiskt täcker den perioden
    expect(windowFrom.startsWith('20')).toBe(true);
  });

  it.each(['2023-01-10', '2030-01-10'])('keeps distant navigation bounded around %s', (date) => {
    const anchor = new Date(`${date}T12:00:00`);
    const { windowFrom, windowTo } = resolveCalendarWindow({ anchorDate: anchor });
    const span = (new Date(windowTo).getTime() - new Date(windowFrom).getTime()) / 86400000;
    expect(span).toBe(105);
    expect(windowFrom < date).toBe(true);
    expect(windowTo > date).toBe(true);
  });

  it.each(['2026-01-01', '2026-02-01', '2026-03-01', '2026-12-01'])('covers the complete month grid at %s', (date) => {
    const { windowFrom, windowTo } = resolveCalendarWindow({ anchorDate: date });
    const anchor = new Date(`${date}T12:00:00Z`).getTime();
    expect(new Date(windowFrom).getTime()).toBeLessThan(anchor - 7 * 86400000);
    expect(new Date(windowTo).getTime()).toBeGreaterThan(anchor + 42 * 86400000);
  });

  it('faller tillbaka på idag när ankaret är ogiltigt', () => {
    const { windowFrom, windowTo } = resolveCalendarWindow({ anchorDate: 'not-a-date' });
    const today = new Date().toISOString().slice(0, 10);

    expect(windowFrom < today).toBe(true);
    expect(windowTo > today).toBe(true);
  });
});
