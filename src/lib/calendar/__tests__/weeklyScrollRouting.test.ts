import { describe, expect, it } from 'vitest';
import { getWeeklyHorizontalScrollDelta } from '../weeklyScrollRouting';

describe('weeklyScrollRouting', () => {
  it('routar tydlig horisontell scroll till veckocontainern', () => {
    expect(getWeeklyHorizontalScrollDelta({ deltaX: 120, deltaY: 20 })).toBe(120);
    expect(getWeeklyHorizontalScrollDelta({ deltaX: -80, deltaY: 10 })).toBe(-80);
  });

  it('låter vertikal scroll stanna som vertikal scroll', () => {
    expect(getWeeklyHorizontalScrollDelta({ deltaX: 10, deltaY: 120 })).toBe(0);
    expect(getWeeklyHorizontalScrollDelta({ deltaX: 0, deltaY: 120 })).toBe(0);
  });

  it('tolkar shift+hjulet som horisontell veckoscroll', () => {
    expect(getWeeklyHorizontalScrollDelta({ deltaX: 0, deltaY: 90, shiftKey: true })).toBe(90);
  });
});