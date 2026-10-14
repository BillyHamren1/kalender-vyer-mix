// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { warehouseTimeOf, warehouseDateOf, warehouseDayBounds, warehouseLocalToISO } from './warehouseTime';
import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import luxonPlugin from '@fullcalendar/luxon3';

describe('warehouse Stockholm time contract', () => {
  it('handles legacy time columns and timestamp instants consistently', () => {
    expect(warehouseTimeOf('08:30:00')).toBe('08:30');
    expect(warehouseTimeOf('2026-07-01T06:30:00Z')).toBe('08:30');
    expect(warehouseTimeOf('2026-01-01T07:30:00Z')).toBe('08:30');
    expect(warehouseTimeOf('2026-07-01T08:30:00+02:00')).toBe('08:30');
    expect(warehouseTimeOf('invalid')).toBeNull();
    expect(warehouseTimeOf(null)).toBeNull();
  });
  it('assigns late UTC events to the Stockholm calendar date', () => {
    expect(warehouseDateOf('2026-07-01T23:30:00Z')).toBe('2026-07-02');
    expect(warehouseDateOf('2026-01-01T23:30:00Z')).toBe('2026-01-02');
  });
  it.each([['2026-03-29', 23], ['2026-10-25', 25]])('uses actual day duration on %s', (day, hours) => {
    const { start, end } = warehouseDayBounds(day);
    expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(hours);
  });
  it('converts wall-clock inputs independently of browser zone', () => {
    expect(warehouseLocalToISO('2026-07-01T08:30')).toBe('2026-07-01T06:30:00.000Z');
    expect(warehouseLocalToISO('2026-01-01T08:30')).toBe('2026-01-01T07:30:00.000Z');
    expect(() => warehouseLocalToISO('2026-03-29T02:30')).toThrow();
    expect(() => warehouseLocalToISO('2026-10-25T02:30')).toThrow();
  });
  it('FullCalendar preserves actual instants when an event is moved across DST', () => {
    const calendar = new Calendar(document.createElement('div'), {
      plugins: [timeGridPlugin, luxonPlugin], initialView: 'timeGridDay', timeZone: 'Europe/Stockholm',
      events: [{ id: 'job', start: '2026-03-28T08:00:00+01:00', end: '2026-03-28T09:00:00+01:00' }],
    });
    const event = calendar.getEventById('job')!;
    expect(event.start!.toISOString()).toBe('2026-03-28T07:00:00.000Z');
    event.moveDates({ days: 1 });
    expect(event.start!.toISOString()).toBe('2026-03-29T06:00:00.000Z');
    expect(warehouseTimeOf(event.start)).toBe('08:00');
    event.setEnd('2026-03-29T10:00:00');
    expect(event.end!.toISOString()).toBe('2026-03-29T08:00:00.000Z');
    calendar.destroy();
  });
});
