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

  // Transport-kolumnen ('warehouse-event') ska vara tom tills vidare —
  // filtrera bort alla rig/event/rigDown från lagerkalendern.
  const lagerEvents: CalendarEvent[] = events.filter(
    ev => !EVENT_TYPES.has(ev.eventType || '')
  );

  const result: CalendarEvent[] = [];

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

  // Events with an explicit lager-resourceId (e.g. internal_task) keep their place.
  const explicit: CalendarEvent[] = [];
  const toDistribute: CalendarEvent[] = [];
  const lagerIds = new Set(lagerResources.map(r => r.id));
  for (const ev of lagerEvents) {
    if (ev.eventType === 'internal_task' && ev.resourceId && lagerIds.has(ev.resourceId)) {
      explicit.push(ev);
    } else {
      toDistribute.push(ev);
    }
  }

  const sorted = [...toDistribute].sort(
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
