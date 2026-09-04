import { format } from 'date-fns';
import type { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';
import type { StaffAssignment } from '@/hooks/useUnifiedStaffOperations';

const STAFFABLE_EVENT_TYPES = new Set(['rig', 'event', 'rigDown']);

export interface PersonnelGanttItem {
  id: string;
  staffId: string;
  teamId: string;
  title: string;
  subtitle: string;
  eventType: string;
  sourceEventId?: string;
  bookingId?: string;
  startIndex: number;
  endIndex: number;
  lane: number;
}

const eventDate = (event: CalendarEvent): string => {
  if (typeof event.start === 'string') return event.start.slice(0, 10);
  if (event.start) return format(new Date(event.start as any), 'yyyy-MM-dd');
  return '';
};

const phaseLabel = (eventType: string): string => {
  if (eventType === 'rig') return 'Rig';
  if (eventType === 'event') return 'Event';
  if (eventType === 'rigDown') return 'Rivning';
  return 'Planerad';
};

/**
 * Read-only projection of the existing team/day staffing into a personnel
 * timeline. It deliberately creates no second staffing model: an item exists
 * only when an existing staff assignment exists for the same team and date.
 */
export function buildPersonnelGanttItems(input: {
  days: Date[];
  assignments: StaffAssignment[];
  events: CalendarEvent[];
  resources: Resource[];
}): PersonnelGanttItem[] {
  const { days, assignments, events, resources } = input;
  const dayIndex = new Map(days.map((day, index) => [format(day, 'yyyy-MM-dd'), index]));
  const teamNames = new Map(resources.map(resource => [resource.id, resource.title]));
  const eventsByTeamAndDay = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const type = String(event.eventType || event.extendedProps?.eventType || '');
    const date = eventDate(event);
    if (!date || !event.resourceId || !STAFFABLE_EVENT_TYPES.has(type)) continue;
    const key = `${event.resourceId}|${date}`;
    const list = eventsByTeamAndDay.get(key) || [];
    list.push(event);
    eventsByTeamAndDay.set(key, list);
  }

  const raw: Array<Omit<PersonnelGanttItem, 'lane'>> = [];
  for (const assignment of assignments) {
    const index = dayIndex.get(assignment.date);
    if (index === undefined) continue;
    const matchingEvents = eventsByTeamAndDay.get(`${assignment.teamId}|${assignment.date}`) || [];

    if (matchingEvents.length === 0) {
      const teamName = teamNames.get(assignment.teamId) || assignment.teamId;
      raw.push({
        id: `${assignment.staffId}-${assignment.teamId}-${assignment.date}`,
        staffId: assignment.staffId,
        teamId: assignment.teamId,
        title: teamName,
        subtitle: 'Planerad i team',
        eventType: 'assignment',
        startIndex: index,
        endIndex: index,
      });
      continue;
    }

    for (const event of matchingEvents) {
      const type = String(event.eventType || event.extendedProps?.eventType || 'assignment');
      raw.push({
        id: `${assignment.staffId}-${event.id}-${assignment.date}`,
        staffId: assignment.staffId,
        teamId: assignment.teamId,
        title: event.title || teamNames.get(assignment.teamId) || 'Planerat arbete',
        subtitle: `${phaseLabel(type)} · ${teamNames.get(assignment.teamId) || assignment.teamId}`,
        eventType: type,
        sourceEventId: event.id,
        bookingId: event.bookingId || event.extendedProps?.bookingId || event.extendedProps?.booking_id,
        startIndex: index,
        endIndex: index,
      });
    }
  }

  // Join consecutive days for the same person, booking/label, phase and team.
  const merged: Array<Omit<PersonnelGanttItem, 'lane'>> = [];
  const sorted = [...raw].sort((a, b) =>
    a.staffId.localeCompare(b.staffId) ||
    a.startIndex - b.startIndex ||
    a.teamId.localeCompare(b.teamId) ||
    a.title.localeCompare(b.title),
  );
  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    const sameSchedule = previous &&
      previous.staffId === item.staffId &&
      previous.teamId === item.teamId &&
      previous.title === item.title &&
      previous.eventType === item.eventType &&
      previous.bookingId === item.bookingId &&
      previous.endIndex + 1 === item.startIndex;
    if (sameSchedule) {
      previous.endIndex = item.endIndex;
    } else {
      merged.push({ ...item });
    }
  }

  // Place overlaps on separate lanes for each member.
  const result: PersonnelGanttItem[] = [];
  const byStaff = new Map<string, Array<Omit<PersonnelGanttItem, 'lane'>>>();
  for (const item of merged) {
    const list = byStaff.get(item.staffId) || [];
    list.push(item);
    byStaff.set(item.staffId, list);
  }
  for (const [staffId, items] of byStaff) {
    const laneEnds: number[] = [];
    for (const item of items.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex)) {
      let lane = laneEnds.findIndex(end => end < item.startIndex);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.endIndex;
      result.push({ ...item, staffId, lane });
    }
  }

  return result;
}

