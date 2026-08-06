import { describe, expect, it } from 'vitest';

describe('personalkalenderns historikfönster', () => {
  it('hämtar minst ett år bakåt så vårens jobb syns i augusti', async () => {
    const source = await import('../services/eventService?raw').then(module => String(module.default));

    expect(source).toContain('const CALENDAR_WINDOW_DAYS_BACK = 365');
    expect(source).toContain(".gte('start_time', windowFrom)");
    expect(source).toContain('.range(fromIdx, toIdx)');
  });
});