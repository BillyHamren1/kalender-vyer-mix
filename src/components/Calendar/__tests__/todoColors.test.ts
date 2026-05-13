import { describe, it, expect } from 'vitest';
import { getEventColor, getEventDotClass, getEventBgClass, getEventCardClass } from '@/components/Calendar/ResourceData';

describe('Calendar todo color tokens', () => {
  it('returns orange-200 hex for getEventColor("todo")', () => {
    expect(getEventColor('todo')).toBe('#FED7AA');
  });
  it('returns bg-orange-500 dot class', () => {
    expect(getEventDotClass('todo')).toBe('bg-orange-500');
  });
  it('returns bg-orange-100 bg class', () => {
    expect(getEventBgClass('todo')).toBe('bg-orange-100');
  });
  it('returns orange card class', () => {
    expect(getEventCardClass('todo')).toBe('bg-orange-500/20 border-orange-500');
  });
  it('does not collide with default for unknown types', () => {
    expect(getEventColor('something-else')).not.toBe('#FED7AA');
  });
});
