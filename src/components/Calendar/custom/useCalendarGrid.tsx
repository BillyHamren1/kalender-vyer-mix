import { useMemo } from 'react';
import { CalendarEvent } from '../ResourceData';

export interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
  topPx: number;
}

export interface PositionedEvent extends CalendarEvent {
  topPx: number;
  heightPx: number;
  columnIndex: number;
  totalColumns: number;
}

const SLOT_HEIGHT = 48; // px per 30-min slot
const MIN_TIME = 6; // 06:00
const MAX_TIME = 22; // 22:00
const TOTAL_SLOTS = (MAX_TIME - MIN_TIME) * 2; // 32 half-hour slots

export const GRID_TOTAL_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT; // 1536px

/**
 * Generate half-hour time slots from 06:00 to 22:00
 */
export function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const totalMinutes = i * 30;
    const hour = MIN_TIME + Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    slots.push({
      hour,
      minute,
      label: minute === 0 ? `${hour.toString().padStart(2, '0')}:00` : '',
      topPx: i * SLOT_HEIGHT,
    });
  }
  return slots;
}

/**
 * Convert a UTC time to pixel position within the grid.
 */
function timeToPixels(date: Date): number {
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = (hours - MIN_TIME) * 60 + minutes;
  return (totalMinutes / 30) * SLOT_HEIGHT;
}

/**
 * Detect overlapping events and assign column indices.
 */
function layoutOverlaps(events: PositionedEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.topPx - b.topPx);
  const columns: PositionedEvent[][] = [];

  for (const event of sorted) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const lastInCol = columns[col][columns[col].length - 1];
      if (lastInCol.topPx + lastInCol.heightPx <= event.topPx) {
        event.columnIndex = col;
        columns[col].push(event);
        placed = true;
        break;
      }
    }
    if (!placed) {
      event.columnIndex = columns.length;
      columns.push([event]);
    }
  }

  // Set totalColumns for each group
  const totalCols = columns.length;
  for (const col of columns) {
    for (const ev of col) {
      ev.totalColumns = totalCols;
    }
  }

  return sorted;
}

/**
 * Position events for a specific resource on a specific date.
 */
export function positionEvents(
  events: CalendarEvent[],
  resourceId: string,
  dateStr: string
): PositionedEvent[] {
  const filtered = events.filter(ev => {
    if (ev.resourceId !== resourceId) return false;
    const start = new Date(ev.start);
    const evDate = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
    return evDate === dateStr;
  });

  const positioned: PositionedEvent[] = filtered.map(ev => {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const topPx = Math.max(0, timeToPixels(start));
    const bottomPx = Math.min(GRID_TOTAL_HEIGHT, timeToPixels(end));
    const heightPx = Math.max(SLOT_HEIGHT / 2, bottomPx - topPx);

    return {
      ...ev,
      topPx,
      heightPx,
      columnIndex: 0,
      totalColumns: 1,
    };
  });

  return layoutOverlaps(positioned);
}

/**
 * Hook: memoized time slots.
 */
export function useTimeSlots() {
  return useMemo(() => generateTimeSlots(), []);
}
