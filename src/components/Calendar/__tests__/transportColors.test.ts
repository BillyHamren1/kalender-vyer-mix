import { describe, expect, it } from 'vitest';
import { getEventColor, getEventDotClass, getEventBgClass, getEventCardClass, getTransportEventType } from '../ResourceData';

describe('Transport direction color tokens', () => {
  it('maps delivery/transfer to transport_out and pickup/return to transport_in', () => {
    expect(getTransportEventType('delivery')).toBe('transport_out');
    expect(getTransportEventType('transfer')).toBe('transport_out');
    expect(getTransportEventType('pickup')).toBe('transport_in');
    expect(getTransportEventType('return')).toBe('transport_in');
    expect(getTransportEventType('internal')).toBe('transport_in');
    expect(getTransportEventType('other')).toBe('transport_in');
    expect(getTransportEventType(null)).toBe('transport_in');
  });

  it('gives transport_out and transport_in different colors', () => {
    const out = getEventColor('transport_out');
    const inn = getEventColor('transport_in');
    expect(out).not.toBe(inn);
    expect(out).toBe('#FBCFE8');
    expect(inn).toBe('#FED7AA');
  });

  it('provides distinct dot, bg and card classes for transport directions', () => {
    expect(getEventDotClass('transport_out')).toBe('bg-pink-500');
    expect(getEventDotClass('transport_in')).toBe('bg-amber-500');
    expect(getEventBgClass('transport_out')).toBe('bg-pink-100');
    expect(getEventBgClass('transport_in')).toBe('bg-amber-100');
    expect(getEventCardClass('transport_out')).toBe('bg-pink-500/20 border-pink-500');
    expect(getEventCardClass('transport_in')).toBe('bg-amber-500/20 border-amber-500');
  });
});
