import { describe, expect, it } from 'vitest';
import { canConsumeVerticalScroll, getWeeklyHorizontalScrollDelta } from '../weeklyScrollRouting';

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

  it('låter intern vertikal scroll ta emot rörelsen när innehållet kan scrollas', () => {
    expect(canConsumeVerticalScroll({
      scrollTop: 120,
      clientHeight: 400,
      scrollHeight: 1200,
      deltaY: 80,
    })).toBe(true);

    expect(canConsumeVerticalScroll({
      scrollTop: 120,
      clientHeight: 400,
      scrollHeight: 1200,
      deltaY: -80,
    })).toBe(true);
  });

  it('skickar vidare vertikal scroll när intern lista redan står i ändläge', () => {
    expect(canConsumeVerticalScroll({
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 1200,
      deltaY: -80,
    })).toBe(false);

    expect(canConsumeVerticalScroll({
      scrollTop: 800,
      clientHeight: 400,
      scrollHeight: 1200,
      deltaY: 80,
    })).toBe(false);
  });
});