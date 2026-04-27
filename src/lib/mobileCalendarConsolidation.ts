import type { ScheduledShift } from '@/services/mobileApiService';
import { parsePlannerDateTime } from '@/utils/dateUtils';

/**
 * A calendar item rendered in the mobile day timeline.
 *
 * - kind='booking' → a regular standalone booking shift card (navigates to
 *   `/m/job/:bookingId`).
 * - kind='project' → a CONSOLIDATED card that represents one large project on
 *   one calendar day. Tapping it navigates to `/m/project/:projectId` where
 *   the user can drill down into the project's individual bookings.
 *
 * The consolidation rule keeps the calendar clean even for projects with
 * dozens of sub-bookings — the calendar shows the project, the project
 * detail page shows the bookings.
 */
export type MobileCalendarItem =
  | {
      kind: 'booking';
      key: string;
      shift: ScheduledShift;
    }
  | {
      kind: 'project';
      key: string;
      largeProjectId: string;
      title: string;
      client: string | null;
      delivery_address: string | null;
      delivery_latitude: number | null;
      delivery_longitude: number | null;
      start_time: string;
      end_time: string;
      event_type: ScheduledShift['event_type'];
      shifts: ScheduledShift[];
    };

const dayKey = (iso: string): string => (iso || '').slice(0, 10);

/**
 * Group shifts that belong to the same large project on the same day into a
 * single calendar item. Returns items sorted by start_time. Pure / no I/O.
 */
export function consolidateShifts(shifts: ScheduledShift[]): MobileCalendarItem[] {
  const projectGroups = new Map<string, ScheduledShift[]>();
  const standalone: ScheduledShift[] = [];

  for (const s of shifts) {
    if (s.large_project_id) {
      const k = `${s.large_project_id}|${dayKey(s.start_time)}`;
      const arr = projectGroups.get(k);
      if (arr) arr.push(s);
      else projectGroups.set(k, [s]);
    } else {
      standalone.push(s);
    }
  }

  const items: MobileCalendarItem[] = [];

  for (const [key, group] of projectGroups) {
    // Earliest start, latest end across the project's shifts that day.
    let earliest = group[0];
    let latestEnd = group[0];
    for (const s of group) {
      const sStart = parsePlannerDateTime(s.start_time)?.getTime() ?? 0;
      const eStart = parsePlannerDateTime(earliest.start_time)?.getTime() ?? 0;
      if (sStart < eStart) earliest = s;

      const sEnd = parsePlannerDateTime(s.end_time)?.getTime() ?? 0;
      const lEnd = parsePlannerDateTime(latestEnd.end_time)?.getTime() ?? 0;
      if (sEnd > lEnd) latestEnd = s;
    }

    items.push({
      kind: 'project',
      key,
      largeProjectId: earliest.large_project_id as string,
      title: earliest.large_project_name || earliest.client,
      client: earliest.client ?? null,
      delivery_address: earliest.delivery_address,
      delivery_latitude: earliest.delivery_latitude,
      delivery_longitude: earliest.delivery_longitude,
      start_time: earliest.start_time,
      end_time: latestEnd.end_time,
      event_type: earliest.event_type,
      shifts: group,
    });
  }

  for (const s of standalone) {
    items.push({ kind: 'booking', key: s.shift_id, shift: s });
  }

  items.sort((a, b) => {
    const aStart = parsePlannerDateTime(getStart(a))?.getTime() ?? 0;
    const bStart = parsePlannerDateTime(getStart(b))?.getTime() ?? 0;
    return aStart - bStart;
  });

  return items;
}

function getStart(item: MobileCalendarItem): string {
  return item.kind === 'booking' ? item.shift.start_time : item.start_time;
}

export function getItemEnd(item: MobileCalendarItem): string {
  return item.kind === 'booking' ? item.shift.end_time : item.end_time;
}

export function getItemEventType(item: MobileCalendarItem): ScheduledShift['event_type'] {
  return item.kind === 'booking' ? item.shift.event_type : item.event_type;
}

/**
 * Returns the set of "active" identifiers for a calendar item. A project card
 * lights up if ANY of its underlying bookings has an active timer, or if the
 * project itself has a project-level timer (`project-{id}`).
 */
export function isItemActive(item: MobileCalendarItem, activeIds: Set<string> | undefined): boolean {
  if (!activeIds || activeIds.size === 0) return false;
  if (item.kind === 'booking') return activeIds.has(item.shift.booking_id);
  if (activeIds.has(`project-${item.largeProjectId}`)) return true;
  return item.shifts.some((s) => activeIds.has(s.booking_id));
}
