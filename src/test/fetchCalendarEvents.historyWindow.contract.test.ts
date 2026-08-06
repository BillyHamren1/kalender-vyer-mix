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

  it('inkluderar alltid nuet även när ankaret ligger långt bakåt', () => {
    const anchor = new Date('2023-01-10T00:00:00Z');
    const { windowTo } = resolveCalendarWindow({ anchorDate: anchor });
    const today = new Date().toISOString().slice(0, 10);

    expect(windowTo > today).toBe(true);
  });

  it('faller tillbaka på idag när ankaret är ogiltigt', () => {
    const { windowFrom, windowTo } = resolveCalendarWindow({ anchorDate: 'not-a-date' });
    const today = new Date().toISOString().slice(0, 10);

    expect(windowFrom < today).toBe(true);
    expect(windowTo > today).toBe(true);
  });
});
