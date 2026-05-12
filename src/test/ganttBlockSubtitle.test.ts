import { describe, expect, it } from 'vitest';

import { getGanttDisplaySubtitle } from '@/lib/staff/ganttBlockSubtitle';

describe('getGanttDisplaySubtitle', () => {
  it('hides subtitles that only repeat time span and duration', () => {
    expect(getGanttDisplaySubtitle({ subtitle: '08:15–14:36 · 6h 22m' })).toBeNull();
  });

  it('hides ongoing subtitles that only repeat start time and duration', () => {
    expect(getGanttDisplaySubtitle({ subtitle: '08:17– pågår · 6h 36m' })).toBeNull();
  });

  it('keeps meaningful extra subtitle text after the duplicated time prefix is removed', () => {
    expect(getGanttDisplaySubtitle({ subtitle: '08:17–14:53 · kund på plats' })).toBe('kund på plats');
  });
});