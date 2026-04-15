import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';

/**
 * Distributes warehouse events across lager-1 … lager-N using the same
 * collision-avoidance + round-robin algorithm as the planning calendar.
 *
 * Events with eventType rig/event/rigDown are assigned to the 'warehouse-event'
 * resource and stacked in sequential 3h blocks (like team-11 Live column).
 *
 * Packing/delivery/etc events are distributed across lager-1…N using
 * collision-avoidance + round-robin.
 */
export const distributeWarehouseEvents = (
  events: CalendarEvent[],
  resources: Resource[]
): CalendarEvent[] => {
  const EVENT_TYPES = new Set(['rig', 'event', 'rigDown']);

  // Separate event-column events from lager events
  const eventColumnEvents: CalendarEvent[] = [];
  const lagerEvents: CalendarEvent[] = [];

  for (const ev of events) {
    if (EVENT_TYPES.has(ev.eventType || '')) {
      eventColumnEvents.push(ev);
    } else {
      lagerEvents.push(ev);
    }
  }

  const result: CalendarEvent[] = [];

  // === 1. Stack event-column events in 3h blocks per day ===
  // Sort by start time, then stack sequentially
  const sortedEventCol = [...eventColumnEvents].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  // Track how many events placed per day for stacking
  const eventColDayCount = new Map<string, number>();

  for (const event of sortedEventCol) {
    const evStart = new Date(event.start);
    const dateKey = `${evStart.getUTCFullYear()}-${String(evStart.getUTCMonth() + 1).padStart(2, '0')}-${String(evStart.getUTCDate()).padStart(2, '0')}`;

    const count = eventColDayCount.get(dateKey) || 0;
    eventColDayCount.set(dateKey, count + 1);

    // Stack: 08:00-11:00, 11:00-14:00, 14:00-17:00, etc.
    const baseHour = 8 + count * 3;
    const stackedStart = new Date(evStart);
    stackedStart.setUTCHours(baseHour, 0, 0, 0);
    const stackedEnd = new Date(evStart);
    stackedEnd.setUTCHours(baseHour + 3, 0, 0, 0);

    result.push({
      ...event,
      resourceId: 'warehouse-event',
      start: stackedStart.toISOString(),
      end: stackedEnd.toISOString(),
    });
  }

  // === 2. Distribute lager events with round-robin ===
  const lagerResources = resources
    .filter(r => r.id.startsWith('lager-'))
    .sort((a, b) => {
      const aNum = parseInt(a.id.replace('lager-', '')) || 0;
      const bNum = parseInt(b.id.replace('lager-', '')) || 0;
      return aNum - bNum;
    });

  if (lagerResources.length === 0) {
    // No lager resources, just return event column results + lager events as-is
    return [...result, ...lagerEvents];
  }

  const sorted = [...lagerEvents].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const placed = new Map<string, Map<string, { start: number; end: number }[]>>();

  for (const event of sorted) {
    const evStart = new Date(event.start);
    const evEnd = new Date(event.end);
    const startMs = evStart.getTime();
    const endMs = evEnd.getTime();
    const dateKey = `${evStart.getUTCFullYear()}-${String(evStart.getUTCMonth() + 1).padStart(2, '0')}-${String(evStart.getUTCDate()).padStart(2, '0')}`;

    if (!placed.has(dateKey)) {
      placed.set(dateKey, new Map());
    }
    const dayMap = placed.get(dateKey)!;

    let assignedId: string | null = null;

    for (const lager of lagerResources) {
      const intervals = dayMap.get(lager.id) || [];
      const hasOverlap = intervals.some(iv => startMs < iv.end && endMs > iv.start);
      if (!hasOverlap) {
        assignedId = lager.id;
        break;
      }
    }

    if (!assignedId) {
      let minCount = Number.MAX_SAFE_INTEGER;
      for (const lager of lagerResources) {
        const count = (dayMap.get(lager.id) || []).length;
        if (count < minCount) {
          minCount = count;
          assignedId = lager.id;
        }
      }
    }

    if (!assignedId) assignedId = lagerResources[0].id;

    if (!dayMap.has(assignedId)) dayMap.set(assignedId, []);
    dayMap.get(assignedId)!.push({ start: startMs, end: endMs });

    result.push({ ...event, resourceId: assignedId });
  }

  return result;
};
