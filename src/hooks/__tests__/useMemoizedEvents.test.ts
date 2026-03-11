/**
 * ============================================================
 * TEST: useMemoizedEvents — Reference stability & dedup
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStableEvents, useResourceEvents, useResourceDateEvents, useEventsByDate } from '@/hooks/useMemoizedEvents';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev-1',
    title: 'Test',
    start: '2025-06-10T08:00:00.000Z',
    end: '2025-06-10T16:00:00.000Z',
    resourceId: 'team-1',
    ...overrides,
  };
}

// ─── useStableEvents ───────────────────────────────────────

describe('useStableEvents', () => {
  it('returns same reference when events are identical', () => {
    const events = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    const { result, rerender } = renderHook(
      ({ evts }) => useStableEvents(evts),
      { initialProps: { evts: events } }
    );

    const ref1 = result.current;
    // Rerender with same array reference
    rerender({ evts: events });
    expect(result.current).toBe(ref1);
  });

  it('returns same reference when new array has same content', () => {
    const events1 = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    const events2 = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    
    const { result, rerender } = renderHook(
      ({ evts }) => useStableEvents(evts),
      { initialProps: { evts: events1 } }
    );

    const ref1 = result.current;
    rerender({ evts: events2 });
    expect(result.current).toBe(ref1);
  });

  it('returns new reference when events actually change', () => {
    const events1 = [makeEvent({ id: '1' })];
    const events2 = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    
    const { result, rerender } = renderHook(
      ({ evts }) => useStableEvents(evts),
      { initialProps: { evts: events1 } }
    );

    const ref1 = result.current;
    rerender({ evts: events2 });
    expect(result.current).not.toBe(ref1);
    expect(result.current).toHaveLength(2);
  });

  it('deduplicates before comparison', () => {
    const ev = makeEvent({ id: '1' });
    const { result } = renderHook(() => useStableEvents([ev, ev, ev]));
    expect(result.current).toHaveLength(1);
  });

  it('handles empty array', () => {
    const { result } = renderHook(() => useStableEvents([]));
    expect(result.current).toEqual([]);
  });
});

// ─── useResourceEvents ─────────────────────────────────────

describe('useResourceEvents', () => {
  it('filters by resourceId', () => {
    const events = [
      makeEvent({ id: '1', resourceId: 'r1' }),
      makeEvent({ id: '2', resourceId: 'r2' }),
      makeEvent({ id: '3', resourceId: 'r1' }),
    ];
    const { result } = renderHook(() => useResourceEvents(events, 'r1'));
    expect(result.current).toHaveLength(2);
    expect(result.current.every(e => e.resourceId === 'r1')).toBe(true);
  });

  it('returns empty for no matches', () => {
    const events = [makeEvent({ resourceId: 'r1' })];
    const { result } = renderHook(() => useResourceEvents(events, 'r99'));
    expect(result.current).toHaveLength(0);
  });
});

// ─── useResourceDateEvents ─────────────────────────────────

describe('useResourceDateEvents', () => {
  const events = [
    makeEvent({ id: '1', resourceId: 'r1', start: '2025-06-10T08:00:00Z' }),
    makeEvent({ id: '2', resourceId: 'r1', start: '2025-06-11T08:00:00Z' }),
    makeEvent({ id: '3', resourceId: 'r2', start: '2025-06-10T08:00:00Z' }),
  ];

  it('filters by resource and date', () => {
    const { result } = renderHook(() => useResourceDateEvents(events, 'r1', '2025-06-10'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('1');
  });

  it('returns empty for wrong date', () => {
    const { result } = renderHook(() => useResourceDateEvents(events, 'r1', '2025-06-12'));
    expect(result.current).toHaveLength(0);
  });

  it('returns empty for wrong resource', () => {
    const { result } = renderHook(() => useResourceDateEvents(events, 'r99', '2025-06-10'));
    expect(result.current).toHaveLength(0);
  });
});

// ─── useEventsByDate ───────────────────────────────────────

describe('useEventsByDate', () => {
  it('groups events by UTC date', () => {
    const events = [
      makeEvent({ id: '1', start: '2025-06-10T08:00:00Z' }),
      makeEvent({ id: '2', start: '2025-06-10T14:00:00Z' }),
      makeEvent({ id: '3', start: '2025-06-11T08:00:00Z' }),
    ];
    const { result } = renderHook(() => useEventsByDate(events));
    expect(result.current.get('2025-06-10')).toHaveLength(2);
    expect(result.current.get('2025-06-11')).toHaveLength(1);
  });

  it('handles empty array', () => {
    const { result } = renderHook(() => useEventsByDate([]));
    expect(result.current.size).toBe(0);
  });
});
