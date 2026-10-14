import { DateTime } from 'luxon';
import { WAREHOUSE_TIME_ZONE, warehouseTimeOf } from './warehouseTime';

export interface PersonnelInterval {
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** Actual minutes in this day's clipped segment, including DST transitions. */
  plannedDurationMinutes: number | null;
}

/** Split only established intervals. Legacy clock-only overnight ends stay unknown. */
export function personnelIntervals(start: string | null | undefined, end: string | null | undefined, fallbackDate: string, from: string, to: string): PersonnelInterval[] {
  const dated = (value: string | null | undefined) => !!value && /^\d{4}-\d{2}-\d{2}[T ]/.test(value);
  if (!dated(start) || !dated(end)) {
    if (fallbackDate < from || fallbackDate > to) return [];
    const startTime = warehouseTimeOf(start), endTime = warehouseTimeOf(end);
    const minutes = (value: string) => +value.slice(0, 2) * 60 + +value.slice(3);
    const duration = startTime && endTime && endTime > startTime ? minutes(endTime) - minutes(startTime) : null;
    return [{ date: fallbackDate, startTime, endTime, plannedDurationMinutes: duration }];
  }
  const first = DateTime.fromISO(start!.replace(' ', 'T'), { zone: WAREHOUSE_TIME_ZONE });
  const last = DateTime.fromISO(end!.replace(' ', 'T'), { zone: WAREHOUSE_TIME_ZONE });
  if (!first.isValid || !last.isValid || last <= first) {
    return fallbackDate >= from && fallbackDate <= to ? [{ date: fallbackDate, startTime: warehouseTimeOf(start), endTime: null, plannedDurationMinutes: null }] : [];
  }
  const result: PersonnelInterval[] = [];
  let day = DateTime.fromISO(from, { zone: WAREHOUSE_TIME_ZONE }).startOf('day');
  const limit = DateTime.fromISO(to, { zone: WAREHOUSE_TIME_ZONE }).plus({ days: 1 }).startOf('day');
  while (day < limit) {
    const next = day.plus({ days: 1 });
    const begin = first > day ? first : day;
    const finish = last < next ? last : next;
    if (begin < finish) result.push({
      date: day.toISODate()!, startTime: begin.toFormat('HH:mm'),
      endTime: finish.equals(next) ? '24:00' : finish.toFormat('HH:mm'),
      plannedDurationMinutes: finish.diff(begin, 'minutes').minutes,
    });
    day = next;
  }
  return result;
}

export function unstaffedWarehouseEvents<T extends { id?: string | null }>(events: T[], assignments: { warehouse_event_id?: string | null; status?: string | null }[]): T[] {
  const assigned = new Set(assignments.filter(a => a.status !== 'cancelled').map(a => a.warehouse_event_id).filter(Boolean));
  return events.filter(event => !event.id || !assigned.has(event.id));
}
