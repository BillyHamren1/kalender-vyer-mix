/**
 * Pure layout helpers for TimeGrid — overlap math, time slots, event positioning.
 * No React, no DOM.
 */
import type { CalendarEvent } from './ResourceData';
import { extractUTCDate, extractUTCTime } from '@/utils/dateUtils';

export interface OverlapInfo { column: number; totalColumns: number; }

export function computeOverlapLayout(
  events: CalendarEvent[],
  getPos: (e: CalendarEvent) => { top: number; height: number },
): Map<string, OverlapInfo> {
  const result = new Map<string, OverlapInfo>();
  if (events.length === 0) return result;

  const items = events.map(e => ({ id: e.id, ...getPos(e) }));
  items.sort((a, b) => a.top - b.top || b.height - a.height);

  const groups: typeof items[] = [];
  const eventGroup = new Map<string, number>();

  for (const item of items) {
    let placed = false;
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const overlaps = group.some(g => item.top < g.top + g.height && item.top + item.height > g.top);
      if (overlaps) {
        group.push(item);
        eventGroup.set(item.id, gi);
        placed = true;
        break;
      }
    }
    if (!placed) {
      eventGroup.set(item.id, groups.length);
      groups.push([item]);
    }
  }

  for (const group of groups) {
    const cols: typeof items[] = [];
    for (const item of group) {
      let assigned = false;
      for (let ci = 0; ci < cols.length; ci++) {
        const canFit = cols[ci].every(c => item.top >= c.top + c.height || item.top + item.height <= c.top);
        if (canFit) {
          cols[ci].push(item);
          result.set(item.id, { column: ci, totalColumns: 0 });
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        cols.push([item]);
        result.set(item.id, { column: cols.length - 1, totalColumns: 0 });
      }
    }
    for (const item of group) {
      const info = result.get(item.id)!;
      info.totalColumns = cols.length;
    }
  }

  return result;
}

export function generateTimeSlots(): Array<{ time: string; displayTime: string }> {
  const slots: Array<{ time: string; displayTime: string }> = [];
  for (let hour = 5; hour <= 23; hour++) {
    const time = hour.toString().padStart(2, '0') + ':00';
    const displayTime = hour.toString().padStart(2, '0');
    slots.push({ time, displayTime });
  }
  for (let hour = 24; hour < 29; hour++) {
    const displayHour = hour - 24;
    const time = hour.toString();
    const displayTime = displayHour.toString().padStart(2, '0');
    slots.push({ time, displayTime });
  }
  return slots;
}

/** Vertical position in pixels for an event on a continuous 24h grid. slotPx = pixels per 1h. */
export function getEventPosition(event: CalendarEvent, slotPx: number = 25): { top: number; height: number } {
  const startClock = extractUTCTime(event.start);
  const endClock = extractUTCTime(event.end);
  const startDate = extractUTCDate(event.start);
  const endDate = extractUTCDate(event.end);

  const [startHH, startMM] = startClock.split(':').map(Number);
  const [endHH, endMM] = endClock.split(':').map(Number);

  let startHour = (Number.isNaN(startHH) ? 0 : startHH) + (Number.isNaN(startMM) ? 0 : startMM / 60);
  let endHour = (Number.isNaN(endHH) ? 0 : endHH) + (Number.isNaN(endMM) ? 0 : endMM / 60);

  if (endDate > startDate || endHour < startHour) {
    endHour += 24;
  }

  const top = (startHour - 5) * slotPx;
  const height = Math.max(12, (endHour - startHour) * slotPx);
  return { top, height };
}
