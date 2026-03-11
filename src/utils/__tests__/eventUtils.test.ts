/**
 * ============================================================
 * TEST: Event Utilities — Identity, Dedup, Comparison
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import {
  getEventKey,
  getEventIdentity,
  deduplicateEvents,
  eventsEqual,
  filterEventsByResourceAndDate,
  getEventDisplayData,
  groupEventsByDate,
} from '@/utils/eventUtils';
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

// ─── getEventKey ───────────────────────────────────────────

describe('getEventKey', () => {
  it('combines id and resourceId', () => {
    expect(getEventKey(makeEvent())).toBe('ev-1-team-1');
  });

  it('produces unique keys for same event in different resources', () => {
    const a = getEventKey(makeEvent({ resourceId: 'team-1' }));
    const b = getEventKey(makeEvent({ resourceId: 'team-2' }));
    expect(a).not.toBe(b);
  });
});

// ─── deduplicateEvents ────────────────────────────────────

describe('deduplicateEvents', () => {
  it('removes exact duplicates', () => {
    const ev = makeEvent();
    expect(deduplicateEvents([ev, ev, ev])).toHaveLength(1);
  });

  it('keeps events with different IDs', () => {
    const a = makeEvent({ id: '1' });
    const b = makeEvent({ id: '2' });
    expect(deduplicateEvents([a, b])).toHaveLength(2);
  });

  it('keeps events with same ID but different resources', () => {
    const a = makeEvent({ id: '1', resourceId: 'r1' });
    const b = makeEvent({ id: '1', resourceId: 'r2' });
    expect(deduplicateEvents([a, b])).toHaveLength(2);
  });

  it('keeps events with same ID but different times', () => {
    const a = makeEvent({ id: '1', start: '2025-06-10T08:00:00Z' });
    const b = makeEvent({ id: '1', start: '2025-06-10T10:00:00Z' });
    expect(deduplicateEvents([a, b])).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(deduplicateEvents([])).toEqual([]);
  });

  it('handles large arrays efficiently', () => {
    const events = Array.from({ length: 10000 }, (_, i) => 
      makeEvent({ id: `ev-${i % 500}`, resourceId: `r-${i % 10}` })
    );
    const start = performance.now();
    const result = deduplicateEvents(events);
    const elapsed = performance.now() - start;
    
    expect(result.length).toBeLessThanOrEqual(5000); // 500 ids × 10 resources max
    expect(elapsed).toBeLessThan(100); // Should be fast
  });
});

// ─── eventsEqual ──────────────────────────────────────────

describe('eventsEqual', () => {
  it('same reference returns true', () => {
    const arr = [makeEvent()];
    expect(eventsEqual(arr, arr)).toBe(true);
  });

  it('equal contents returns true', () => {
    const a = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    const b = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    expect(eventsEqual(a, b)).toBe(true);
  });

  it('different lengths returns false', () => {
    expect(eventsEqual([makeEvent()], [])).toBe(false);
  });

  it('different IDs returns false', () => {
    const a = [makeEvent({ id: '1' })];
    const b = [makeEvent({ id: '2' })];
    expect(eventsEqual(a, b)).toBe(false);
  });

  it('different times returns false', () => {
    const a = [makeEvent({ start: '2025-06-10T08:00:00Z' })];
    const b = [makeEvent({ start: '2025-06-10T09:00:00Z' })];
    expect(eventsEqual(a, b)).toBe(false);
  });
});

// ─── filterEventsByResourceAndDate ────────────────────────

describe('filterEventsByResourceAndDate', () => {
  const events = [
    makeEvent({ id: '1', resourceId: 'r1', start: '2025-06-10T08:00:00Z', end: '2025-06-10T10:00:00Z' }),
    makeEvent({ id: '2', resourceId: 'r1', start: '2025-06-11T08:00:00Z', end: '2025-06-11T10:00:00Z' }),
    makeEvent({ id: '3', resourceId: 'r2', start: '2025-06-10T08:00:00Z', end: '2025-06-10T10:00:00Z' }),
  ];

  it('filters by resource and date', () => {
    expect(filterEventsByResourceAndDate(events, 'r1', '2025-06-10')).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    expect(filterEventsByResourceAndDate(events, 'r1', '2025-06-12')).toHaveLength(0);
    expect(filterEventsByResourceAndDate(events, 'r99', '2025-06-10')).toHaveLength(0);
  });
});

// ─── getEventDisplayData ──────────────────────────────────

describe('getEventDisplayData', () => {
  it('returns defaults for minimal event', () => {
    const data = getEventDisplayData(makeEvent({ title: '' }));
    expect(data.title).toBe('Untitled');
    expect(data.bookingNumber).toBe('');
    expect(data.deliveryCity).toBe('');
    expect(data.hasSourceChanges).toBe(false);
  });

  it('extracts booking number from extendedProps', () => {
    const data = getEventDisplayData(makeEvent({ 
      extendedProps: { bookingNumber: 'BK-12345' } 
    }));
    expect(data.bookingNumber).toBe('BK-12345');
  });

  it('truncates long booking IDs', () => {
    const longId = 'a'.repeat(30);
    const data = getEventDisplayData(makeEvent({ bookingNumber: longId }));
    expect(data.bookingNumber).toBe(longId.slice(-8));
  });

  it('detects source changes correctly', () => {
    const data = getEventDisplayData(makeEvent({ 
      extendedProps: { has_source_changes: true } 
    }));
    expect(data.hasSourceChanges).toBe(true);
  });

  it('ignores source changes when manually adjusted', () => {
    const data = getEventDisplayData(makeEvent({ 
      extendedProps: { has_source_changes: true, manually_adjusted: true } 
    }));
    expect(data.hasSourceChanges).toBe(false);
  });
});

// ─── groupEventsByDate ────────────────────────────────────

describe('groupEventsByDate', () => {
  it('groups events by UTC date', () => {
    const events = [
      makeEvent({ id: '1', start: '2025-06-10T08:00:00Z' }),
      makeEvent({ id: '2', start: '2025-06-10T14:00:00Z' }),
      makeEvent({ id: '3', start: '2025-06-11T08:00:00Z' }),
    ];
    const grouped = groupEventsByDate(events);
    expect(grouped.get('2025-06-10')).toHaveLength(2);
    expect(grouped.get('2025-06-11')).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(groupEventsByDate([]).size).toBe(0);
  });
});

// ─── Edge Cases: Display Data ─────────────────────────────

describe('getEventDisplayData: edge cases', () => {
  it('handles event with no extendedProps at all', () => {
    const ev = makeEvent();
    delete (ev as any).extendedProps;
    const data = getEventDisplayData(ev);
    expect(data.title).toBe('Test');
    expect(data.bookingNumber).toBe('');
    expect(data.deliveryCity).toBe('');
    expect(data.hasSourceChanges).toBe(false);
  });

  it('handles event with empty extendedProps', () => {
    const data = getEventDisplayData(makeEvent({ extendedProps: {} }));
    expect(data.bookingNumber).toBe('');
    expect(data.deliveryCity).toBe('');
  });

  it('handles event with null bookingId and no extendedProps', () => {
    const ev = makeEvent({ bookingId: undefined });
    delete (ev as any).extendedProps;
    const data = getEventDisplayData(ev);
    expect(data.bookingId).toBeNull();
  });
});

// ─── Edge Cases: Dedup with same id+resource but different times ──

describe('deduplicateEvents: edge cases', () => {
  it('keeps events with same id+resource but different start times', () => {
    const a = makeEvent({ id: '1', resourceId: 'r1', start: '2025-06-10T08:00:00Z', end: '2025-06-10T10:00:00Z' });
    const b = makeEvent({ id: '1', resourceId: 'r1', start: '2025-06-10T14:00:00Z', end: '2025-06-10T16:00:00Z' });
    expect(deduplicateEvents([a, b])).toHaveLength(2);
  });

  it('removes true duplicates (same id+resource+start+end)', () => {
    const a = makeEvent({ id: '1', resourceId: 'r1', start: '2025-06-10T08:00:00Z', end: '2025-06-10T10:00:00Z' });
    const b = { ...a }; // shallow copy, same values
    expect(deduplicateEvents([a, b])).toHaveLength(1);
  });
});
